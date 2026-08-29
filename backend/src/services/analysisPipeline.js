import { fetchRepoMeta, fetchRecentCommits, fetchRecentPullRequests } from './github.js';
import { scoreRisk } from './riskScoring.js';
import { analyzeWithOllama } from './ollama.js';
import { Analysis } from '../models/Analysis.js';

/**
 * Result of the LLM step when it fails outright. Kept as a factory (not a shared constant)
 * so callers can never mutate a frozen singleton by accident.
 */
function failedLlmResult(reason) {
  return {
    summary: 'AI summary unavailable — the LLM analysis step failed for this item.',
    qualityNote: 'Not available.',
    llmOutputMalformed: false,
    llmAnalysisFailed: true,
    llmFailureReason: reason,
    diffTruncated: false,
  };
}

/**
 * Runs the LLM step for one item, converting any failure into a degraded-but-valid result.
 *
 * Ollama is called sequentially across items by design: a local single-GPU Ollama serves one
 * generation at a time, so issuing them concurrently increases per-request latency and the
 * chance of a timeout without improving throughput.
 */
async function summarizeItem(item) {
  try {
    return await analyzeWithOllama(item);
  } catch (err) {
    return failedLlmResult(err.message);
  }
}

/** Maps a scored + summarized item into the shape the Analysis model persists. */
function toAnalysisDocument({ repoFullName, item, risk, llm }) {
  return {
    repo: repoFullName,
    type: item.type,
    externalId: item.externalId,
    title: item.title,
    author: item.author,
    url: item.url,
    sourceCreatedAt: item.createdAt,
    summary: llm.summary,
    qualityNote: llm.qualityNote,
    llmOutputMalformed: Boolean(llm.llmOutputMalformed),
    llmAnalysisFailed: Boolean(llm.llmAnalysisFailed),
    llmFailureReason: llm.llmFailureReason ?? null,
    riskLevel: risk.level,
    riskScore: risk.score,
    riskReasoning: risk.reasoning,
    diffStats: {
      additions: item.additions,
      deletions: item.deletions,
      changedFiles: item.changedFiles,
      sensitiveFiles: risk.breakdown.sensitiveFiles,
      testFilesIncluded: risk.breakdown.testFilesIncluded,
      diffTruncatedForLLM: Boolean(llm.diffTruncated),
      fileListComplete: risk.breakdown.fileListComplete,
    },
  };
}

/**
 * Analyzes one commit/PR end to end: risk score -> LLM summary -> upsert.
 * Returns a per-item result record; never throws for item-scoped failures.
 */
async function analyzeItem(repoFullName, item) {
  const risk = scoreRisk({
    files: item.files,
    additions: item.additions,
    deletions: item.deletions,
    fileListComplete: item.fileListComplete,
  });

  const llm = await summarizeItem(item);

  try {
    const doc = await Analysis.upsertAnalysis(toAnalysisDocument({ repoFullName, item, risk, llm }));
    return {
      id: doc._id,
      type: item.type,
      externalId: item.externalId,
      title: item.title,
      riskLevel: risk.level,
      riskScore: risk.score,
      llmAnalysisFailed: Boolean(llm.llmAnalysisFailed),
      saved: true,
    };
  } catch (err) {
    return {
      type: item.type,
      externalId: item.externalId,
      title: item.title,
      saved: false,
      error: `Database write failed: ${err.message}`,
    };
  }
}

/**
 * Fetches recent commits + PRs for a repo, scores and summarizes each, and upserts them.
 *
 * Failure model — deliberately two-tier:
 *   - Repo-scoped failures (not found, private, empty, rate limited) reject, because nothing
 *     downstream can proceed without a reachable repo.
 *   - Item-scoped failures (GitHub can't generate one diff, Ollama times out on one item,
 *     one DB write fails) are captured per item so the rest of the batch still completes.
 *
 * @returns {Promise<{repo:string, commitsFetched:number, pullRequestsFetched:number,
 *   itemsSkippedDuringFetch:number, succeeded:number, failed:number, results:object[]}>}
 */
export async function analyzeRepository({ owner, repo, commitLimit, prLimit }) {
  const repoFullName = `${owner}/${repo}`;

  // Fails fast with a precise error (404 / empty) before spending any per-item API calls.
  await fetchRepoMeta(owner, repo);

  const [{ commits, skipped: skippedCommits }, { pullRequests, skipped: skippedPRs }] = await Promise.all([
    fetchRecentCommits(owner, repo, commitLimit),
    fetchRecentPullRequests(owner, repo, prLimit),
  ]);

  const results = [...skippedCommits, ...skippedPRs].map(({ type, externalId, reason }) => ({
    type,
    externalId,
    saved: false,
    error: reason,
  }));

  for (const item of [...commits, ...pullRequests]) {
    results.push(await analyzeItem(repoFullName, item));
  }

  return {
    repo: repoFullName,
    commitsFetched: commits.length,
    pullRequestsFetched: pullRequests.length,
    itemsSkippedDuringFetch: skippedCommits.length + skippedPRs.length,
    succeeded: results.filter((r) => r.saved).length,
    failed: results.filter((r) => !r.saved).length,
    results,
  };
}
