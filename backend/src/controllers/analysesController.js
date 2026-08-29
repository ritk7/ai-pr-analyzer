import mongoose from 'mongoose';
import { Analysis } from '../models/Analysis.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';

const RISK_LEVELS = ['low', 'medium', 'high'];
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/**
 * Sorting happens in MongoDB, not in the client, because the client only holds the current
 * page: sorting there would order the visible slice while the genuinely highest-risk item
 * sat unseen on page 2 — a "highest risk first" view that hides the riskiest change.
 *
 * Ordering is by numeric riskScore, never by the riskLevel string: "high" < "low" < "medium"
 * alphabetically, so a lexical sort would rank them almost exactly wrong. Each sort has a
 * deterministic tiebreak so pagination cannot repeat or drop rows between pages.
 */
const SORT_ORDERS = {
  recent: { lastAnalyzedAt: -1, _id: -1 },
  'risk-desc': { riskScore: -1, lastAnalyzedAt: -1, _id: -1 },
  'risk-asc': { riskScore: 1, lastAnalyzedAt: -1, _id: -1 },
};
const DEFAULT_SORT = 'recent';

/** GET /api/analyses?risk=&repo=&sort=&page=&limit= */
export async function listAnalyses(req, res) {
  const { risk, repo, page, limit, sort } = req.query;

  const filter = {};
  if (risk !== undefined) {
    if (!RISK_LEVELS.includes(risk)) {
      throw new ValidationError(`risk must be one of ${RISK_LEVELS.join(', ')}. Got: "${risk}"`);
    }
    filter.riskLevel = risk;
  }
  if (repo !== undefined) {
    filter.repo = repo;
  }

  // Pagination params are clamped rather than rejected, deliberately diverging from the
  // write path (which rejects a bad commitLimit with a 400). Reads are cheap and idempotent,
  // so being forgiving costs nothing; an analyze run is expensive enough that silently
  // honouring something other than what the caller asked for would be the wrong trade.
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(limit) || DEFAULT_PAGE_SIZE));

  // Unlike pagination bounds, an unrecognized sort key is rejected: silently falling back to
  // a different order would show the caller data that contradicts the sort they asked for.
  const sortKey = sort ?? DEFAULT_SORT;
  if (!Object.hasOwn(SORT_ORDERS, sortKey)) {
    throw new ValidationError(
      `sort must be one of ${Object.keys(SORT_ORDERS).join(', ')}. Got: "${sortKey}"`,
    );
  }

  const [items, total] = await Promise.all([
    Analysis.find(filter)
      .sort(SORT_ORDERS[sortKey])
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    Analysis.countDocuments(filter),
  ]);

  res.json({
    items,
    total,
    page: pageNum,
    limit: limitNum,
    sort: sortKey,
    totalPages: Math.ceil(total / limitNum) || 1,
  });
}

/** GET /api/analyses/stats?repo= */
export async function getStats(req, res) {
  const { repo } = req.query;
  const filter = repo ? { repo } : {};

  const [total, byRisk] = await Promise.all([
    Analysis.countDocuments(filter),
    Analysis.aggregate([{ $match: filter }, { $group: { _id: '$riskLevel', count: { $sum: 1 } } }]),
  ]);

  const riskDistribution = { low: 0, medium: 0, high: 0 };
  for (const row of byRisk) riskDistribution[row._id] = row.count;

  res.json({ total, riskDistribution });
}

/** GET /api/analyses/:id */
export async function getAnalysisById(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    throw new ValidationError(`Invalid analysis id: "${id}"`);
  }
  const doc = await Analysis.findById(id);
  if (!doc) {
    throw new NotFoundError(`No analysis found with id "${id}"`);
  }
  res.json(doc);
}
