// Browser-side GitHub REST client for the static demo. api.github.com supports CORS, so this
// runs directly from a visitor's browser with no proxy — unauthenticated, so it shares the
// same 60 req/hr-per-IP limit as everyone browsing without a token, but that budget belongs
// to each visitor individually (nothing is shared across visitors, since there's no server).
//
// Error codes match backend/src/utils/errors.js exactly, so the existing
// errorMessages.js banner mapping and ErrorBanner component work unmodified.
const GITHUB_API = 'https://api.github.com';
const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;
const GITHUB_MAX_PER_PAGE = 100;
const GITHUB_MAX_COMMIT_FILES = 300;

// Kept intentionally low: each "Analyze repo" click costs roughly 1 (repo) + 1 + N (commits)
// + 2*M (PRs) requests against the visitor's own 60/hr budget.
const DEMO_COMMIT_LIMIT = 4;
const DEMO_PR_LIMIT = 2;

function makeError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

/** Same validation as backend/src/services/github.js's validateRepoFormat. */
export function validateRepoFormat(input) {
  if (typeof input !== 'string' || input.trim().length === 0) {
    throw makeError('repo is required and must be a non-empty string.', 'VALIDATION_ERROR');
  }
  const trimmed = input.trim();

  if (/^https?:\/\//i.test(trimmed) || trimmed.includes('github.com')) {
    throw makeError(
      `repo must be in "owner/repo" format (e.g. "facebook/react"), not a URL. Got: "${trimmed}"`,
      'VALIDATION_ERROR',
    );
  }

  const parts = trimmed.split('/');
  if (parts.length !== 2) {
    throw makeError(`repo must be in "owner/repo" format (e.g. "facebook/react"). Got: "${trimmed}"`, 'VALIDATION_ERROR');
  }

  const [owner, rawRepo] = parts;
  const repo = rawRepo.replace(/\.git$/i, '');

  if (!OWNER_RE.test(owner)) {
    throw makeError(
      `Invalid owner "${owner}": must be alphanumeric/hyphens, cannot start with a hyphen, max 39 chars.`,
      'VALIDATION_ERROR',
    );
  }
  if (!REPO_RE.test(repo)) {
    throw makeError(`Invalid repo name "${rawRepo}": must contain only letters, digits, ".", "_", "-".`, 'VALIDATION_ERROR');
  }
  if (repo === '.' || repo === '..') {
    throw makeError(`Invalid repo name "${rawRepo}": "." and ".." are not valid repository names.`, 'VALIDATION_ERROR');
  }

  return { owner, repo };
}

async function ghFetch(path) {
  let res;
  try {
    res = await fetch(`${GITHUB_API}${path}`, { headers: { Accept: 'application/vnd.github+json' } });
  } catch {
    throw makeError('Could not reach api.github.com from your browser.', 'NETWORK_ERROR');
  }

  if (res.status === 404) {
    throw makeError(
      "Repository not found. Either it doesn't exist, or it's private — this demo has no token and can't see private repos.",
      'REPO_NOT_FOUND_OR_PRIVATE',
    );
  }
  if (res.status === 409) {
    throw makeError('Repository exists but has no commits yet.', 'REPO_EMPTY');
  }
  if (res.status === 403 || res.status === 429) {
    const remaining = res.headers.get('x-ratelimit-remaining');
    if (remaining === '0' || res.status === 429) {
      const reset = Number(res.headers.get('x-ratelimit-reset'));
      const resetMsg = Number.isFinite(reset) ? ` Resets at ${new Date(reset * 1000).toLocaleTimeString()}.` : '';
      throw makeError(
        `GitHub's public API rate limit (60/hr, unauthenticated) was hit from your connection.${resetMsg} This is shared with any other unauthenticated GitHub API use from your network — try again later, or run the real app locally with your own token.`,
        'GITHUB_RATE_LIMITED',
      );
    }
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw makeError(`GitHub API error: ${body.message ?? res.statusText}`, 'GITHUB_API_ERROR');
  }
  return res.json();
}

export function fetchRepoMeta(owner, repo) {
  return ghFetch(`/repos/${owner}/${repo}`);
}

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

export async function fetchRecentCommits(owner, repo) {
  const list = await ghFetch(`/repos/${owner}/${repo}/commits?per_page=${DEMO_COMMIT_LIMIT}`);
  const commits = [];
  for (const summary of list) {
    try {
      const full = await ghFetch(`/repos/${owner}/${repo}/commits/${summary.sha}`);
      const files = (full.files ?? []).slice(0, GITHUB_MAX_COMMIT_FILES);
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
        fileListComplete: files.length < GITHUB_MAX_COMMIT_FILES,
        files: files.map(normalizeFile),
      });
    } catch (err) {
      if (err.code === 'GITHUB_RATE_LIMITED') throw err;
      // per-item fetch failure (matches backend's per-item isolation) — skip, don't abort
    }
  }
  return commits;
}

export async function fetchRecentPullRequests(owner, repo) {
  const list = await ghFetch(
    `/repos/${owner}/${repo}/pulls?state=all&per_page=${DEMO_PR_LIMIT}&sort=updated&direction=desc`,
  );
  const prs = [];
  for (const summary of list) {
    try {
      const [full, files] = await Promise.all([
        ghFetch(`/repos/${owner}/${repo}/pulls/${summary.number}`),
        ghFetch(`/repos/${owner}/${repo}/pulls/${summary.number}/files?per_page=${GITHUB_MAX_PER_PAGE}`),
      ]);
      const changedFiles = full.changed_files ?? files.length;
      prs.push({
        type: 'pull_request',
        externalId: String(full.number),
        title: full.title,
        author: full.user?.login ?? 'unknown',
        url: full.html_url,
        createdAt: full.created_at,
        additions: full.additions ?? 0,
        deletions: full.deletions ?? 0,
        changedFiles,
        fileListComplete: files.length >= changedFiles,
        files: files.map(normalizeFile),
      });
    } catch (err) {
      if (err.code === 'GITHUB_RATE_LIMITED') throw err;
    }
  }
  return prs;
}
