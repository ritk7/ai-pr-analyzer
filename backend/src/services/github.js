import { Octokit } from '@octokit/rest';
import { config } from '../config/index.js';
import {
  ValidationError,
  RepoNotFoundOrInaccessibleError,
  RepoEmptyError,
  GithubRateLimitError,
  GithubApiError,
} from '../utils/errors.js';

const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;

// GitHub API hard limits (theirs, not ours — these are not tunable settings).
const GITHUB_MAX_PER_PAGE = 100;
const GITHUB_MAX_COMMIT_FILES = 300;

/**
 * Validates the "owner/repo" input format. Throws ValidationError with a clear message
 * for anything malformed, including the common mistake of pasting a full GitHub URL.
 * @param {string} input
 * @returns {{owner: string, repo: string}}
 */
export function validateRepoFormat(input) {
  if (typeof input !== 'string' || input.trim().length === 0) {
    throw new ValidationError('repo is required and must be a non-empty string.');
  }
  const trimmed = input.trim();

  if (/^https?:\/\//i.test(trimmed) || trimmed.includes('github.com')) {
    throw new ValidationError(
      `repo must be in "owner/repo" format (e.g. "facebook/react"), not a URL. Got: "${trimmed}"`,
    );
  }

  const parts = trimmed.split('/');
  if (parts.length !== 2) {
    throw new ValidationError(
      `repo must be in "owner/repo" format (e.g. "facebook/react"). Got: "${trimmed}"`,
    );
  }

  const [owner, rawRepo] = parts;
  // "owner/repo.git" is a common copy-paste from a clone URL; accept it by normalizing
  // rather than rejecting something we can unambiguously interpret.
  const repo = rawRepo.replace(/\.git$/i, '');

  if (!OWNER_RE.test(owner)) {
    throw new ValidationError(
      `Invalid owner "${owner}": must be alphanumeric/hyphens, cannot start with a hyphen, max 39 chars.`,
    );
  }
  if (!REPO_RE.test(repo)) {
    throw new ValidationError(
      `Invalid repo name "${rawRepo}": must contain only letters, digits, ".", "_", "-".`,
    );
  }
  // "." and ".." satisfy REPO_RE but are path segments, not repo names — GitHub rejects
  // them and letting them reach the API would build a nonsense request URL.
  if (repo === '.' || repo === '..') {
    throw new ValidationError(`Invalid repo name "${rawRepo}": "." and ".." are not valid repository names.`);
  }

  return { owner, repo };
}

let octokitInstance = null;
let octokitCacheKey = null;

/**
 * Returns a cached Octokit client, rebuilding it if the token or API base URL changed.
 * Keying the cache on those values (rather than caching forever) keeps the client correct
 * when configuration changes — which is what makes the GitHub error paths testable against
 * a local stub server, and what allows pointing at a GitHub Enterprise host.
 */
function getOctokit() {
  const cacheKey = `${config.github.apiBaseUrl}|${config.github.token}`;
  if (!octokitInstance || octokitCacheKey !== cacheKey) {
    octokitInstance = new Octokit({
      baseUrl: config.github.apiBaseUrl,
      ...(config.github.token ? { auth: config.github.token } : {}),
      // Octokit retries rate-limited requests by default; disable so the caller sees the
      // rate limit immediately as a typed error instead of silently stalling for minutes.
      request: { retries: 0 },
    });
    octokitCacheKey = cacheKey;
  }
  return octokitInstance;
}

/**
 * GitHub signals rate limiting in three different shapes, and missing any one of them would
 * surface a rate limit to the user as a generic "GitHub API error":
 *   - primary limit:   403 with x-ratelimit-remaining: 0
 *   - secondary limit: 403 OR 429, identified by the message body
 *   - abuse/throttle:  429 with a retry-after header
 * Header values are compared as strings because Octokit exposes raw header strings.
 */
function isRateLimitError(error) {
  if (error.status !== 403 && error.status !== 429) return false;

  const remaining = error.response?.headers?.['x-ratelimit-remaining'];
  if (String(remaining) === '0') return true;
  if (/secondary rate limit|rate limit exceeded|abuse detection/i.test(error.message ?? '')) return true;
  // A bare 429 from GitHub is always some form of throttling.
  return error.status === 429;
}

function rateLimitResetFrom(error) {
  const reset = Number(error.response?.headers?.['x-ratelimit-reset']);
  if (Number.isFinite(reset) && reset > 0) return reset;
  // Secondary limits use retry-after (seconds from now) instead of an absolute reset.
  const retryAfter = Number(error.response?.headers?.['retry-after']);
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.floor(Date.now() / 1000) + retryAfter;
  return undefined;
}

/**
 * Translates raw Octokit failures into this app's typed errors. Every GitHub call goes
 * through here so no route ever has to interpret a bare HTTP status code.
 */
async function callGithub(owner, repo, fn) {
  try {
    return await fn();
  } catch (error) {
    if (isRateLimitError(error)) {
      throw new GithubRateLimitError(rateLimitResetFrom(error));
    }
    if (error.status === 404) {
      throw new RepoNotFoundOrInaccessibleError(owner, repo);
    }
    if (error.status === 409) {
      // GitHub's documented response for listCommits() on a repo with zero commits.
      throw new RepoEmptyError(owner, repo);
    }
    throw new GithubApiError(error.message ?? 'unknown error', error.status ?? 502);
  }
}

/**
 * Confirms the repo exists and is accessible, failing fast with a precise error before the
 * pipeline spends any per-item API calls.
 *
 * Deliberately does NOT infer emptiness from the `size` field. That heuristic was tried and
 * measured wrong: of 15 public repos GitHub reports as `size: 0`, all 15 had commits
 * (jsplumb/jsplumb and bincode-org/bincode among them) — `size` is disk usage that GitHub
 * does not keep current, not a commit-count signal. Emptiness is instead detected from the
 * 409 "Git Repository is empty" that listCommits returns, which is GitHub's documented and
 * authoritative response for that case.
 */
export async function fetchRepoMeta(owner, repo) {
  const octokit = getOctokit();
  const { data } = await callGithub(owner, repo, () => octokit.rest.repos.get({ owner, repo }));
  return data;
}

/** Reduces a GitHub file object down to the fields the rest of the pipeline consumes. */
function normalizeFile(file) {
  return {
    filename: file.filename,
    status: file.status,
    additions: file.additions,
    deletions: file.deletions,
    changes: file.changes,
    patch: file.patch,
  };
}

/**
 * Fetches the N most recent commits on the default branch, each normalized with full
 * stats + per-file patches (one extra API call per commit to get that detail).
 *
 * Per-commit detail fetches are isolated: GitHub occasionally can't serve full detail for
 * a specific commit/PR (e.g. "problem generating diff" on very old history) even though
 * the repo and the rest of its history are fine. One such item is skipped (and reported
 * in `skipped`) rather than failing the entire analyze run. A rate limit hit, by contrast,
 * affects every remaining call, so it aborts the whole fetch rather than being "skipped".
 */
export async function fetchRecentCommits(owner, repo, limit = config.github.maxCommitsPerRun) {
  const octokit = getOctokit();
  const { data: commitList } = await callGithub(owner, repo, () =>
    octokit.rest.repos.listCommits({ owner, repo, per_page: limit }),
  );

  const commits = [];
  const skipped = [];
  for (const summary of commitList) {
    try {
      const { data: full } = await callGithub(owner, repo, () =>
        octokit.rest.repos.getCommit({ owner, repo, ref: summary.sha }),
      );
      const files = (full.files ?? []).slice(0, config.github.maxFilesPerItem);
      commits.push({
        type: 'commit',
        externalId: full.sha,
        title: (full.commit.message ?? '').split('\n')[0].slice(0, 200),
        author: full.commit.author?.name ?? full.author?.login ?? 'unknown',
        url: full.html_url,
        createdAt: full.commit.author?.date ?? new Date().toISOString(),
        additions: full.stats?.additions ?? 0,
        deletions: full.stats?.deletions ?? 0,
        changedFiles: files.length,
        // Unlike PRs, the commit endpoint returns no total file count and cannot be
        // paginated — GitHub hard-caps it at 300 files. Hitting that ceiling is therefore
        // the only signal available that the file list may be incomplete.
        fileListComplete: files.length < GITHUB_MAX_COMMIT_FILES,
        files: files.map(normalizeFile),
      });
    } catch (err) {
      if (err instanceof GithubRateLimitError) throw err;
      skipped.push({ type: 'commit', externalId: summary.sha, reason: err.message });
    }
  }
  return { commits, skipped };
}

/**
 * Pulls every changed file for a PR, following pagination up to config.github.maxFilesPerItem.
 *
 * This matters for correctness, not just completeness: a single listFiles page caps at 100
 * files, so on a 204-file PR an unpaginated fetch would silently hide files 101+ from
 * sensitive-file and test detection — a PR touching `.env` as its 150th file would score as
 * "no sensitive files touched". Verified against rust-lang/rust#161906 (204 files).
 */
async function fetchAllPullRequestFiles(owner, repo, pullNumber) {
  const octokit = getOctokit();
  const files = [];
  const maxPages = Math.ceil(config.github.maxFilesPerItem / GITHUB_MAX_PER_PAGE);

  for (let page = 1; page <= maxPages; page++) {
    const { data } = await callGithub(owner, repo, () =>
      octokit.rest.pulls.listFiles({ owner, repo, pull_number: pullNumber, per_page: GITHUB_MAX_PER_PAGE, page }),
    );
    files.push(...data);
    if (data.length < GITHUB_MAX_PER_PAGE) break; // last page
  }

  return files.slice(0, config.github.maxFilesPerItem);
}

/**
 * Fetches the N most recently updated pull requests (any state), each normalized with
 * full stats + per-file patches. See fetchRecentCommits' doc comment for the per-item
 * isolation rationale — the same applies here (e.g. GitHub can fail to generate a diff
 * for a single very old PR).
 */
export async function fetchRecentPullRequests(owner, repo, limit = config.github.maxPullRequestsPerRun) {
  const octokit = getOctokit();
  const { data: prList } = await callGithub(owner, repo, () =>
    octokit.rest.pulls.list({
      owner,
      repo,
      state: 'all',
      per_page: Math.min(limit, GITHUB_MAX_PER_PAGE),
      sort: 'updated',
      direction: 'desc',
    }),
  );

  const pullRequests = [];
  const skipped = [];
  for (const summary of prList) {
    try {
      const [{ data: full }, files] = await Promise.all([
        callGithub(owner, repo, () => octokit.rest.pulls.get({ owner, repo, pull_number: summary.number })),
        fetchAllPullRequestFiles(owner, repo, summary.number),
      ]);
      const changedFiles = full.changed_files ?? files.length;
      pullRequests.push({
        type: 'pull_request',
        externalId: String(full.number),
        title: full.title,
        author: full.user?.login ?? 'unknown',
        url: full.html_url,
        createdAt: full.created_at,
        additions: full.additions ?? 0,
        deletions: full.deletions ?? 0,
        changedFiles,
        // False when GitHub's reported change count exceeds the file objects we hold, i.e.
        // sensitive-file / test detection saw only part of the change.
        fileListComplete: files.length >= changedFiles,
        files: files.map(normalizeFile),
      });
    } catch (err) {
      if (err instanceof GithubRateLimitError) throw err;
      skipped.push({ type: 'pull_request', externalId: String(summary.number), reason: err.message });
    }
  }
  return { pullRequests, skipped };
}
