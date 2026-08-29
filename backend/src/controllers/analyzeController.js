import { validateRepoFormat } from '../services/github.js';
import { analyzeRepository } from '../services/analysisPipeline.js';
import { ValidationError } from '../utils/errors.js';
import { config } from '../config/index.js';

/**
 * Validates an optional caller-supplied item limit.
 *
 * Unbounded limits are a real availability problem here, not a theoretical one: each item
 * costs a GitHub round trip plus a 10-30s local LLM generation, so `commitLimit: 5000` would
 * tie up the server for hours on a single request. Anything non-integer, non-positive, or
 * above the hard cap is rejected with a clear 400 rather than silently clamped, so the caller
 * learns their request was not honoured as written.
 */
function parseItemLimit(value, fieldName, defaultValue) {
  if (value === undefined || value === null) return defaultValue;

  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new ValidationError(`${fieldName} must be an integer. Got: ${JSON.stringify(value)}`);
  }
  if (value < 1 || value > config.github.maxItemsPerRunHardCap) {
    throw new ValidationError(
      `${fieldName} must be between 1 and ${config.github.maxItemsPerRunHardCap}. Got: ${value}`,
    );
  }
  return value;
}

/** POST /api/analyze — body: { repo: "owner/repo", commitLimit?: number, prLimit?: number } */
export async function analyzeRepo(req, res) {
  const { owner, repo } = validateRepoFormat(req.body?.repo);
  const commitLimit = parseItemLimit(req.body?.commitLimit, 'commitLimit', config.github.maxCommitsPerRun);
  const prLimit = parseItemLimit(req.body?.prLimit, 'prLimit', config.github.maxPullRequestsPerRun);

  const result = await analyzeRepository({ owner, repo, commitLimit, prLimit });

  res.status(200).json(result);
}
