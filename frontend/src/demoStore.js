// In-memory stand-in for the backend's MongoDB, scoped to one browser tab's session. Seeded
// from the sample dataset; live results from "Analyze repo" are upserted into it exactly like
// Analysis.upsertAnalysis on the server — same (repo, type, externalId) identity, same
// "update in place, don't duplicate" behavior — so re-analyzing a repo in this demo behaves
// the same way it would against the real backend.
import { DEMO_ANALYSES } from './demoData.js';

let store = DEMO_ANALYSES.map((item) => ({ ...item }));

export function upsertDemoAnalysis(record) {
  const idx = store.findIndex(
    (a) => a.repo === record.repo && a.type === record.type && a.externalId === record.externalId,
  );
  if (idx >= 0) {
    store = [...store];
    store[idx] = { ...store[idx], ...record, firstAnalyzedAt: store[idx].firstAnalyzedAt ?? record.lastAnalyzedAt };
  } else {
    store = [record, ...store];
  }
  return record;
}

const SORTERS = {
  recent: (a, b) => new Date(b.lastAnalyzedAt) - new Date(a.lastAnalyzedAt),
  'risk-desc': (a, b) => b.riskScore - a.riskScore,
  'risk-asc': (a, b) => a.riskScore - b.riskScore,
};

export function queryDemoAnalyses({ risk, repo, sort = 'recent', page = 1, limit = 10 }) {
  let items = store.filter((a) => (!risk || a.riskLevel === risk) && (!repo || a.repo === repo));
  items = [...items].sort(SORTERS[sort] ?? SORTERS.recent);

  const total = items.length;
  const totalPages = Math.ceil(total / limit) || 1;
  const start = (page - 1) * limit;

  return { items: items.slice(start, start + limit), total, page, limit, sort, totalPages };
}

export function demoStatsFor(repoFilter) {
  const items = repoFilter ? store.filter((a) => a.repo === repoFilter) : store;
  const riskDistribution = { low: 0, medium: 0, high: 0 };
  for (const item of items) riskDistribution[item.riskLevel]++;
  return { total: items.length, riskDistribution };
}
