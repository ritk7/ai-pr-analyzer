import 'dotenv/config';

function requireEnv(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 5001),
  host: process.env.HOST || '127.0.0.1',
  mongoUri: requireEnv('MONGODB_URI', 'mongodb://127.0.0.1:27017/ai_pr_analyzer'),

  // Optional shared-secret for the write endpoint. When set, POST /api/analyze requires a
  // matching x-api-key header. Left empty it is disabled — see README "API authentication".
  apiKey: process.env.API_KEY || '',

  github: {
    token: process.env.GITHUB_TOKEN || '',
    // Overridable for GitHub Enterprise, and so tests can point the client at a local stub
    // to exercise error paths (rate limit, empty repo) that are impractical to trigger live.
    apiBaseUrl: process.env.GITHUB_API_BASE_URL || 'https://api.github.com',
    // Default number of recent commits / PRs to pull and analyze per POST /analyze call.
    maxCommitsPerRun: Number(process.env.MAX_COMMITS_PER_RUN ?? 10),
    maxPullRequestsPerRun: Number(process.env.MAX_PRS_PER_RUN ?? 10),
    // Hard ceiling on caller-supplied commitLimit/prLimit. Each analyzed item costs one
    // GitHub round trip plus one Ollama generation (10-30s), so an unbounded limit would
    // let a single request occupy the server for hours. GitHub also caps per_page at 100.
    maxItemsPerRunHardCap: Number(process.env.MAX_ITEMS_PER_RUN_HARD_CAP ?? 25),
    // Max file objects to pull per commit/PR. GitHub returns at most 100 files per
    // listFiles page (we paginate) and at most 300 files for a commit (no pagination
    // available). Items above this are marked fileListComplete:false so risk reasoning can
    // disclose that sensitive-file / test detection saw only part of the change.
    maxFilesPerItem: Number(process.env.MAX_FILES_PER_ITEM ?? 300),
  },

  ollama: {
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    model: process.env.OLLAMA_MODEL || 'llama3.2:3b',
    // Ollama has no reliable default num_ctx across versions, so we set it explicitly
    // and size our prompt budget (see diffTruncation.js) to fit inside it.
    numCtx: Number(process.env.OLLAMA_NUM_CTX ?? 4096),
    // Observed 11-30s+ for single calls on local hardware, including variance right after
    // a large back-to-back call — set with headroom rather than the naive minimum.
    requestTimeoutMs: Number(process.env.OLLAMA_TIMEOUT_MS ?? 45000),
    maxOutputTokens: Number(process.env.OLLAMA_MAX_OUTPUT_TOKENS ?? 300),
  },

  // Diff truncation strategy for the text we send to the LLM (see services/diffTruncation.js
  // for the full explanation). These limits bound only the patch TEXT sent to the model;
  // risk scoring reads GitHub's file-level stats instead and is unaffected by them. Risk
  // scoring is, separately, bounded by github.maxFilesPerItem — see that setting.
  diffTruncation: {
    maxTotalChars: Number(process.env.DIFF_MAX_TOTAL_CHARS ?? 8000),
    maxCharsPerFile: Number(process.env.DIFF_MAX_CHARS_PER_FILE ?? 1500),
    maxFilesWithPatch: Number(process.env.DIFF_MAX_FILES_WITH_PATCH ?? 12),
    // Characters held back from maxTotalChars for the "files not shown in full" tail, and
    // the max number of filenames listed in it. Together these stop a many-file change from
    // appending an unbounded filename list after the patch budget is already spent.
    tailReserveChars: Number(process.env.DIFF_TAIL_RESERVE_CHARS ?? 1200),
    maxOmittedFilesListed: Number(process.env.DIFF_MAX_OMITTED_LISTED ?? 20),
  },

  // Risk-scoring thresholds and weights. Centralized here so the formula in
  // services/riskScoring.js has no magic numbers embedded in it.
  risk: {
    sizeThresholds: {
      smallMaxLines: Number(process.env.RISK_SIZE_SMALL_MAX ?? 50),
      mediumMaxLines: Number(process.env.RISK_SIZE_MEDIUM_MAX ?? 300),
    },
    weights: {
      sizeSmall: 0,
      sizeMedium: 2,
      sizeLarge: 4,
      sensitiveFileTouched: 4,
      noTestsIncluded: 2,
    },
    // Cap on how many filenames are named inline in a reasoning string before it summarizes
    // the rest — a 300-file change must not produce an unreadable wall of text.
    maxFilesNamedInReasoning: Number(process.env.RISK_MAX_FILES_NAMED ?? 5),
    levelThresholds: {
      // score <= lowMax -> low; lowMax < score <= mediumMax -> medium; else high
      lowMax: Number(process.env.RISK_LEVEL_LOW_MAX ?? 1),
      mediumMax: Number(process.env.RISK_LEVEL_MEDIUM_MAX ?? 5),
    },
    // Path patterns treated as "sensitive" (case-insensitive). Kept as strings here so
    // they're easy to inspect/override; compiled to RegExp in riskScoring.js.
    sensitiveFilePatterns: [
      '(^|/)\\.env(\\..*)?$',
      '(^|/)package(-lock)?\\.json$',
      '(^|/)yarn\\.lock$',
      '(^|/)pnpm-lock\\.yaml$',
      '(^|/)requirements\\.txt$',
      '(^|/)pipfile(\\.lock)?$',
      '(^|/)pyproject\\.toml$',
      '(^|/)go\\.(mod|sum)$',
      '(^|/)gemfile(\\.lock)?$',
      '(^|/)composer\\.(json|lock)$',
      '(^|/)dockerfile$',
      '(^|/)docker-compose\\.ya?ml$',
      '(^|/)config(s)?/',
      '(^|/)(auth|authentication|authorization)(/|\\.)',
      '\\.github/workflows/',
      '(secret|credential|apikey|api_key)',
    ],
    // Test-file conventions across ecosystems. Verified empirically against real diffs from
    // kubernetes/kubernetes (Go), python/cpython, rust-lang/rust and facebook/react.
    // Deliberately NOT included: a bare `(^|/)spec/` directory rule — in rust-lang/rust,
    // `compiler/rustc_target/src/spec/` means "target specification", not tests, so that
    // rule would misclassify production code as tests and suppress the missing-tests signal.
    testFilePatterns: [
      '\\.(test|spec)\\.[jt]sx?$',
      '(^|/)__tests__/',
      '(^|/)tests?/',
      // <name>_test.<ext> — Go, Python, Ruby, Rust, Dart, Elixir, TS/JS
      '(^|/)[^/]*_test\\.(go|py|rb|rs|ts|tsx|js|jsx|dart|ex|exs)$',
      // <name>_spec.<ext> — RSpec and friends
      '(^|/)[^/]*_spec\\.(rb|js|jsx|ts|tsx)$',
      // <Name>Test.<ext> / <Name>Tests.<ext> — JVM, .NET, Swift, PHP
      '(^|/)[^/]*Tests?\\.(cs|java|kt|kts|swift|php|scala)$',
      '(^|/)test_[^/]+\\.py$',
      // Go convention: testdata/ holds fixtures and is ignored by the Go toolchain.
      '(^|/)testdata/',
    ],
    // Files that don't need test coverage in the first place (docs, text, images). Excluded
    // from the "missing tests" check so a README fix doesn't get dinged for having no tests.
    nonCodeFilePatterns: [
      '\\.mdx?$',
      '\\.txt$',
      '\\.rst$',
      '(^|/)LICENSE([.-].*)?$',
      '(^|/)CHANGELOG([.-].*)?$',
      '(^|/)README([.-].*)?$',
      '\\.(png|jpe?g|gif|svg|ico|webp)$',
    ],
  },
};
