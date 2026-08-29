// Typed application errors. Every failure mode the API can produce gets its own class
// with a fixed statusCode + errorCode, so the error middleware never has to guess what
// went wrong and the frontend can branch on `errorCode` instead of parsing messages.

export class AppError extends Error {
  constructor(message, { statusCode = 500, errorCode = 'INTERNAL_ERROR', details } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message, details) {
    super(message, { statusCode: 400, errorCode: 'VALIDATION_ERROR', details });
  }
}

// GitHub returns 404 for both "repo does not exist" and "private repo your token can't
// see" — it deliberately does not distinguish the two (so a token-less caller can't probe
// for the existence of private repos). We surface that ambiguity honestly instead of
// guessing which one it was.
export class RepoNotFoundOrInaccessibleError extends AppError {
  constructor(owner, repo) {
    super(
      `Repository "${owner}/${repo}" was not found. Either it does not exist, or it is ` +
        `private and your GITHUB_TOKEN does not have access to it.`,
      { statusCode: 404, errorCode: 'REPO_NOT_FOUND_OR_PRIVATE' },
    );
  }
}

export class RepoEmptyError extends AppError {
  constructor(owner, repo) {
    super(`Repository "${owner}/${repo}" exists but has no commits yet.`, {
      statusCode: 422,
      errorCode: 'REPO_EMPTY',
    });
  }
}

export class GithubRateLimitError extends AppError {
  constructor(resetAt) {
    const resetDate = resetAt ? new Date(resetAt * 1000) : null;
    super(
      resetDate
        ? `GitHub API rate limit exceeded. Resets at ${resetDate.toISOString()}.`
        : 'GitHub API rate limit exceeded.',
      { statusCode: 429, errorCode: 'GITHUB_RATE_LIMITED', details: { resetAt: resetDate?.toISOString() } },
    );
  }
}

export class GithubApiError extends AppError {
  constructor(message, statusCode = 502) {
    super(`GitHub API error: ${message}`, { statusCode, errorCode: 'GITHUB_API_ERROR' });
  }
}

export class OllamaUnavailableError extends AppError {
  constructor(cause) {
    super(
      `Could not reach Ollama at the configured OLLAMA_BASE_URL. Is "ollama serve" running?`,
      { statusCode: 503, errorCode: 'OLLAMA_UNAVAILABLE', details: { cause: cause?.message } },
    );
  }
}

export class OllamaTimeoutError extends AppError {
  constructor(timeoutMs) {
    super(`Ollama did not respond within ${timeoutMs}ms.`, {
      statusCode: 504,
      errorCode: 'OLLAMA_TIMEOUT',
    });
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found.') {
    super(message, { statusCode: 404, errorCode: 'NOT_FOUND' });
  }
}
