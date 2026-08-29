// Maps every backend error code to a readable title + hint, so the UI never has to show a
// blank screen or a raw error dump. Falls back to a generic-but-still-readable message for
// anything unmapped (network failure, or a backend error code added later).
const ERROR_DISPLAY = {
  VALIDATION_ERROR: {
    title: 'Invalid input',
    hint: 'Check the repo format (owner/repo) and try again.',
  },
  REPO_NOT_FOUND_OR_PRIVATE: {
    title: 'Repository not found',
    hint: "It doesn't exist, or it's private and your GitHub token can't see it.",
  },
  REPO_EMPTY: {
    title: 'Repository is empty',
    hint: 'This repo has no commits yet, so there is nothing to analyze.',
  },
  GITHUB_RATE_LIMITED: {
    title: 'GitHub rate limit hit',
    hint: 'Add a GITHUB_TOKEN to the backend .env for a much higher limit, or wait for it to reset.',
  },
  GITHUB_API_ERROR: {
    title: 'GitHub API error',
    hint: 'GitHub returned an unexpected error. Try again in a moment.',
  },
  OLLAMA_UNAVAILABLE: {
    title: 'Ollama is not reachable',
    hint: 'Make sure "ollama serve" is running locally on the configured port.',
  },
  OLLAMA_TIMEOUT: {
    title: 'Ollama timed out',
    hint: 'The local model took too long to respond. It may be under load — try again.',
  },
  NOT_FOUND: {
    title: 'Not found',
    hint: 'That item does not exist.',
  },
  UNAUTHORIZED: {
    title: 'Not authorized',
    hint: 'This server requires an API key for analysis requests.',
  },
  MALFORMED_JSON: {
    title: 'Bad request',
    hint: 'The request body could not be read. This is likely a bug in the app.',
  },
  PAYLOAD_TOO_LARGE: {
    title: 'Request too large',
    hint: 'The request body exceeded the size the server accepts.',
  },
  NETWORK_ERROR: {
    title: 'Cannot reach the backend',
    hint: 'Make sure the API server is running.',
  },
  INTERNAL_ERROR: {
    title: 'Something went wrong',
    hint: 'An unexpected server error occurred.',
  },
};

export function describeError(error) {
  const known = ERROR_DISPLAY[error?.code];
  if (known) return known;
  return { title: 'Unexpected error', hint: error?.message || 'Please try again.' };
}
