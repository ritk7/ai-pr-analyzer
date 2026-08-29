import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { config } from '../src/config/index.js';
import {
  validateRepoFormat,
  fetchRepoMeta,
  fetchRecentCommits,
} from '../src/services/github.js';
import {
  GithubRateLimitError,
  RepoNotFoundOrInaccessibleError,
  RepoEmptyError,
  GithubApiError,
  ValidationError,
} from '../src/utils/errors.js';

// A stub GitHub API. Exercising rate limiting and empty repos against the real API is
// impractical (you would have to burn 5,000 requests, or find a repo with zero commits that
// stays empty), so we drive the exact HTTP responses GitHub documents for those cases and
// assert our client translates each one into the right typed error.
let server;
let originalBaseUrl;
let nextResponse = null;

function respondWith(status, body, headers = {}) {
  nextResponse = { status, body, headers };
}

before(async () => {
  server = http.createServer((req, res) => {
    const { status, body, headers } = nextResponse ?? { status: 500, body: {}, headers: {} };
    res.writeHead(status, { 'content-type': 'application/json', ...headers });
    res.end(JSON.stringify(body));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  originalBaseUrl = config.github.apiBaseUrl;
  config.github.apiBaseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  config.github.apiBaseUrl = originalBaseUrl;
  await new Promise((resolve) => server.close(resolve));
});

test('primary rate limit (403 + x-ratelimit-remaining: 0) -> GithubRateLimitError', async () => {
  const resetAt = Math.floor(Date.now() / 1000) + 1800;
  respondWith(
    403,
    { message: 'API rate limit exceeded for user ID 1.' },
    { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(resetAt) },
  );

  const err = await fetchRepoMeta('someowner', 'somerepo').catch((e) => e);

  assert.ok(err instanceof GithubRateLimitError, `got ${err.constructor.name}: ${err.message}`);
  assert.equal(err.statusCode, 429);
  assert.equal(err.errorCode, 'GITHUB_RATE_LIMITED');
  assert.ok(err.details.resetAt, 'reset time must be surfaced so the user knows when to retry');
});

test('secondary rate limit (403, message-identified) -> GithubRateLimitError', async () => {
  respondWith(
    403,
    { message: 'You have exceeded a secondary rate limit. Please wait a few minutes.' },
    { 'retry-after': '60' },
  );

  const err = await fetchRepoMeta('someowner', 'somerepo').catch((e) => e);

  assert.ok(err instanceof GithubRateLimitError, `got ${err.constructor.name}: ${err.message}`);
  assert.ok(err.details.resetAt, 'retry-after must be converted into a reset time');
});

// Regression: a bare 429 was previously misclassified as a generic GITHUB_API_ERROR, so the
// UI showed "GitHub API error" instead of the actionable rate-limit message.
test('bare 429 with no rate-limit headers -> GithubRateLimitError, not a generic API error', async () => {
  respondWith(429, { message: 'Too Many Requests' });

  const err = await fetchRepoMeta('someowner', 'somerepo').catch((e) => e);

  assert.ok(err instanceof GithubRateLimitError, `got ${err.constructor.name}: ${err.message}`);
  assert.equal(err.errorCode, 'GITHUB_RATE_LIMITED');
});

test('rate limit during per-commit fetch aborts the run instead of skipping the item', async () => {
  // A rate limit affects every remaining call, so unlike a one-off diff failure it must not
  // be swallowed as a "skipped item" — that would silently produce a partial analysis.
  respondWith(403, { message: 'API rate limit exceeded' }, { 'x-ratelimit-remaining': '0' });

  const err = await fetchRecentCommits('someowner', 'somerepo', 3).catch((e) => e);

  assert.ok(err instanceof GithubRateLimitError, `got ${err.constructor.name}: ${err.message}`);
});

// Regression: emptiness used to be inferred from `size === 0`, which measured wrong on
// every one of 15 sampled public repos — GitHub reports size 0 for plenty of repos that
// have commits, so real repos were being rejected as "empty" and never analyzed.
test('a repo reporting size 0 but having commits is NOT treated as empty', async () => {
  respondWith(200, { name: 'jsplumb', size: 0, default_branch: 'main', private: false });

  const meta = await fetchRepoMeta('jsplumb', 'jsplumb');

  assert.equal(meta.name, 'jsplumb', 'size:0 must not short-circuit into RepoEmptyError');
});

test('empty repository (listCommits 409) -> RepoEmptyError', async () => {
  // GitHub's documented response for listing commits on a repo with no commits.
  respondWith(409, { message: 'Git Repository is empty.' });

  const err = await fetchRecentCommits('someowner', 'emptyrepo', 3).catch((e) => e);

  assert.ok(err instanceof RepoEmptyError, `got ${err.constructor.name}: ${err.message}`);
  assert.equal(err.errorCode, 'REPO_EMPTY');
});

test('404 -> RepoNotFoundOrInaccessibleError naming both possible causes', async () => {
  respondWith(404, { message: 'Not Found' });

  const err = await fetchRepoMeta('someowner', 'ghostrepo').catch((e) => e);

  assert.ok(err instanceof RepoNotFoundOrInaccessibleError);
  assert.equal(err.errorCode, 'REPO_NOT_FOUND_OR_PRIVATE');
  assert.match(err.message, /private/i, 'message must name the private-repo possibility too');
});

test('unexpected 500 from GitHub -> GithubApiError, not an unhandled crash', async () => {
  respondWith(500, { message: 'Server Error' });

  const err = await fetchRepoMeta('someowner', 'somerepo').catch((e) => e);

  assert.ok(err instanceof GithubApiError, `got ${err.constructor.name}: ${err.message}`);
  assert.equal(err.errorCode, 'GITHUB_API_ERROR');
});

test('repo format validation rejects malformed input and normalizes .git suffixes', () => {
  const invalid = [
    '',
    '   ',
    'noslash',
    'too/many/slashes',
    'https://github.com/facebook/react',
    'github.com/facebook/react',
    '/leadingslash',
    'trailingslash/',
    '-badowner/repo',
    'owner/bad name',
    'owner/.',
    'owner/..',
    'a'.repeat(45) + '/repo',
  ];
  for (const input of invalid) {
    assert.throws(() => validateRepoFormat(input), ValidationError, `expected rejection for: "${input}"`);
  }

  assert.deepEqual(validateRepoFormat('  facebook/react  '), { owner: 'facebook', repo: 'react' });
  assert.deepEqual(validateRepoFormat('facebook/react.git'), { owner: 'facebook', repo: 'react' });
  assert.deepEqual(validateRepoFormat('a/b'), { owner: 'a', repo: 'b' });
});

test('non-string repo inputs are rejected rather than coerced', () => {
  for (const input of [null, undefined, 42, {}, [], true]) {
    assert.throws(() => validateRepoFormat(input), ValidationError, `expected rejection for: ${JSON.stringify(input)}`);
  }
});
