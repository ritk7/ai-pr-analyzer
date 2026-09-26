# AI PR & Code Review Assistant

Connects to a GitHub repo, pulls recent commits and pull requests, and for each one generates:

- a **plain-English summary** (1-2 sentences, via a local Ollama model)
- an **explainable risk score** (low/medium/high, with the reasoning shown)
- a short **code-quality note**

The goal is triage: skim the dashboard and know what changed and how risky it looks before opening a diff.

**[Live demo →](https://ritk7.github.io/ai-pr-analyzer/)** — a static build with sample data (the
real app needs a live backend: GitHub API, local Ollama, MongoDB — see [Demo mode](#demo-mode)).

## Architecture

```
backend/    Node.js + Express API
  src/
    config/         All tunables (thresholds, limits, model name) — nothing hardcoded inline
    services/
      github.js           Octokit wrapper: validation, repo fetch, commits, PRs, error mapping
      riskScoring.js      Pure function: diff stats in, {level, score, reasoning} out
      diffTruncation.js   Pure function: shrinks a diff to fit the LLM's context budget
      ollama.js           Prompts the local model, defensively parses its response
      analysisPipeline.js Orchestration: fetch -> score -> summarize -> upsert
    models/Analysis.js    Mongoose schema + upsert-by-(repo,type,externalId)
    controllers/          Thin HTTP adapters: parse/validate input, delegate, respond
    routes/               POST /api/analyze, GET /api/analyses[/stats|/:id]
    middleware/
      errorHandler.js     Every response funnels through one place
      apiKeyAuth.js       Opt-in shared-secret guard for the write endpoint
    utils/errors.js       Typed errors — each failure mode has its own class + status code
  tests/                  Unit + integration tests (node:test, no external runner)

frontend/   React + Vite dashboard
  src/
    api.js                Fetch wrapper, throws typed errors carrying a `code`
    errorMessages.js      Maps every backend error code to a readable title + hint
    demoData.js           Sample dataset used by the static GitHub Pages build (see below)
    demoStore.js          In-memory stand-in for MongoDB in demo mode, upserts like the real API
    githubClient.js       Browser-side GitHub REST client used by demo mode's "Analyze repo"
    liveAnalysis.js       Runs a real analyze pass client-side (no LLM step) in demo mode
    riskFormula.js        Client-side mirror of backend/src/config/index.js's weights/patterns
    riskScoring.js        Full port of the backend risk formula for the no-backend demo
    components/           RepoInput, StatsPanel, FilterBar, AnalysisCard/List,
                          Pagination, ErrorBanner, RiskExplainer
```

**Why the layering is this way**: `riskScoring.js` and `diffTruncation.js` are pure functions —
no network, no DB — so they can be unit-tested in isolation. `github.js` and `ollama.js` own their
external calls and translate failures into typed errors, so no controller ever interprets a raw
HTTP status. `analysisPipeline.js` holds the orchestration, keeping controllers thin enough that
the HTTP layer could be swapped (CLI, queue worker) without touching business logic.

## The risk-scoring formula, in plain language

Risk score is **additive** — three independent factors, each adds points, and the total maps to a
level. Every score is returned with the exact reasoning that produced it.

| Factor | Rule | Points |
|---|---|---|
| **Diff size** (additions + deletions) | ≤ 50 lines / ≤ 300 lines / more | +0 / +2 / +4 |
| **Sensitive files touched** | config/auth paths, `.env`, package manifests & lockfiles, Dockerfiles, CI workflows | +4 |
| **Missing tests** | changes "code" files but includes no matching test file | +2 |

Score **0-1 → low**, **2-5 → medium**, **6+ → high**. All thresholds and weights live in
[`backend/src/config/index.js`](backend/src/config/index.js).

Four refinements that came out of testing against real repos, each of which was a real
mis-scoring before it was fixed:

- **Docs-only changes never get the "missing tests" penalty.** A README fix isn't supposed to ship
  a test. Covers extensionless `README` files too, as used by `octocat/Hello-World`.
- **Test-file detection spans ecosystems**, not just JS/Python: `*_test.go` (Go), `*_spec.rb`
  (Ruby), `*Test.java` / `*Tests.cs` (JVM/.NET), `testdata/` (Go fixtures). Before this, every Go
  PR that *did* ship tests was still penalized for having none.
- **A bare `spec/` directory is deliberately NOT treated as tests.** In `rust-lang/rust`,
  `compiler/rustc_target/src/spec/` means *target specification* — treating it as tests would
  suppress the missing-tests signal on production code.
- **Test files are excluded from the sensitive-file set.** `pkg/kubelet/apis/config/helpers_test.go`
  matched the `config/` rule, so a routine Go test change reported "touches 12 sensitive files".
  Test fixtures don't ship configuration, and diluting that signal is what makes a "high risk"
  label stop being trusted.

### Where risk scoring is bounded (and says so)

Risk scoring reads GitHub's file-level stats, so it is unaffected by the LLM text truncation below.
It *is* bounded by how many file objects GitHub will return: PR file lists are paginated up to
`maxFilesPerItem` (default 300), and the commit endpoint hard-caps at 300 files with no pagination
at all. When the list is incomplete the analysis says so explicitly in its reasoning and via
`diffStats.fileListComplete`, rather than quietly reporting a lower bound as if it were complete.
The score is deliberately not inflated for this — a change that large already scores +4 on size.

## LLM diff truncation strategy

`llama3.2:3b` runs with an explicit `num_ctx` (default 4096 tokens ≈ 16,000 characters for prompt +
diff + output). Real diffs are routinely far larger, so
[`diffTruncation.js`](backend/src/services/diffTruncation.js) applies a deliberate budget:

1. Rank files: sensitive files first, then by lines changed.
2. Truncate each file's patch to `maxCharsPerFile` (1,500) so one huge file can't crowd out others.
3. Add ranked files until `maxFilesWithPatch` (12) or the character budget is reached — counting the
   **whole section** (header + patch + marker + separator), not just the patch body.
4. Reserve `tailReserveChars` (1,200) for the "files not shown in full" list, itself capped at
   `maxOmittedFilesListed` (20) names plus a "…and N more" summary.
5. The returned text is hard-bounded by `maxTotalChars` as a final guarantee.

Steps 3-4 exist because the first implementation budgeted only patch bodies: headers, markers and an
unbounded omitted-file list pushed a 40-file change to 10,400 characters against an 8,000 budget. On
a 300-file PR that overflow would have evicted the JSON-output instruction from the prompt.
Verified live against a real 186,125-character diff (34 files).

## Explicit error handling

Every failure mode has its own class in [`utils/errors.js`](backend/src/utils/errors.js) with a fixed
status + `errorCode`, and [`errorMessages.js`](frontend/src/errorMessages.js) maps each code to a
plain-English banner.

| Case | Status | Code |
|---|---|---|
| Bad `owner/repo` format, bad `commitLimit`/`prLimit`, bad `risk`/`sort` | 400 | `VALIDATION_ERROR` |
| Unparseable JSON body | 400 | `MALFORMED_JSON` |
| Missing/invalid API key (when enabled) | 401 | `UNAUTHORIZED` |
| Repo doesn't exist, or is private and the token can't see it | 404 | `REPO_NOT_FOUND_OR_PRIVATE` |
| Request body too large | 413 | `PAYLOAD_TOO_LARGE` |
| Repo exists but has no commits | 422 | `REPO_EMPTY` |
| GitHub rate limit (primary 403, secondary 403/429, bare 429) | 429 | `GITHUB_RATE_LIMITED` |
| Other GitHub API error | 502 | `GITHUB_API_ERROR` |
| Ollama unreachable | 503 | `OLLAMA_UNAVAILABLE` |
| Ollama timed out | 504 | `OLLAMA_TIMEOUT` |

**Why "not found" and "private" share one error**: GitHub returns 404 for both and deliberately does
not distinguish them, so an unauthenticated caller can't probe for private repos. There is no way to
tell them apart from the response, so the message says so rather than guessing.

**How empty repos are detected**: from the 409 `Git Repository is empty` that `listCommits` returns —
GitHub's documented, authoritative signal. An earlier version inferred it from `size === 0`, which
measured wrong on **all 15** sampled public repos that report size 0 (`jsplumb/jsplumb`,
`bincode-org/bincode`, `angrave/SystemProgramming` among them). `size` is stale disk usage, not a
commit count, and using it caused real repos to be rejected as empty and never analyzed.

**Malformed LLM output** never throws. `parseAnalysisResponse()` tries strict JSON, then an extracted
JSON block, then field regexes, and only then falls back to raw text flagged
`llmOutputMalformed: true`. A bad summary degrades; it never fails the analysis.

**Duplicate analysis**: re-analyzing a commit/PR **upserts** on `(repo, type, externalId)`, enforced
by a unique index. Risk and summary can legitimately change as a PR gains commits, and duplicate
dashboard rows for one PR would be confusing, so one row is kept current. `firstAnalyzedAt` and
`lastAnalyzedAt` preserve both timestamps.

**Per-item isolation, two tiers**: repo-scoped failures (not found, private, empty, rate limited)
fail the whole request, because nothing downstream can proceed. Item-scoped failures (GitHub can't
generate one diff, Ollama times out on one item, one DB write fails) are captured per item so the
rest of the batch completes. A rate limit encountered mid-run is deliberately *not* demoted to a
skipped item — it affects every remaining call, and swallowing it would silently produce a partial
analysis presented as complete.

## API authentication

`POST /api/analyze` is the only endpoint that spends the operator's GitHub quota, drives local GPU
work, and writes to their database. Left open on a routable interface it is a free resource-abuse
proxy.

The decision: **opt-in shared-secret auth, on by setting `API_KEY`.** When set, the endpoint requires
a matching `x-api-key` header (compared in constant time). When unset the guard is disabled and the
server *says so at startup* rather than failing silently. The server also binds to `127.0.0.1` by
default, so the unauthenticated configuration is not reachable off-box without deliberately setting
`HOST`.

Read endpoints stay open by design: they expose only public-repo analysis results, and gating them
would add friction to the dashboard for no meaningful protection.

## Setup

### Prerequisites
- Node.js 20+
- MongoDB (local `mongod` or Atlas — any connection string)
- [Ollama](https://ollama.com) running locally: `ollama pull llama3.2:3b`
- A GitHub personal access token (optional for public repos, but the unauthenticated limit is
  60 req/hr vs 5,000 with a token)

Talking to a GitHub Enterprise instance instead of github.com? Set `GITHUB_API_BASE_URL` in
`backend/.env` to your instance's API base URL (see `backend/.env.example`).

### Backend
```bash
cd backend
npm install
cp .env.example .env   # fill in GITHUB_TOKEN, MONGODB_URI, OLLAMA_MODEL
npm run dev             # http://localhost:5001, restarts on file changes
npm start                # same server without the file watcher, for production
```

### Frontend
```bash
cd frontend
npm install
cp .env.example .env    # VITE_API_URL, defaults to http://localhost:5001
npm run dev              # http://localhost:5173
npm run build             # production bundle in frontend/dist, talks to a real backend
npm run preview            # serve that bundle locally to sanity-check it
```

### Demo mode

```bash
cd frontend
npm run build:demo   # outputs frontend/dist, base path set for GitHub Pages
```

Builds the same app with every backend call swapped for a fixed sample dataset
([`demoData.js`](frontend/src/demoData.js) — mostly real output captured while testing this
project against live repos), so it runs on static hosting with no server at all. A banner in the
UI makes clear it's sample data, not a live connection. This is what's deployed to the
[live demo](https://ritk7.github.io/ai-pr-analyzer/) via the `gh-pages` branch.

### Tests
```bash
cd backend
npm test
```
40 tests covering the risk formula, the truncation budget, the LLM response parser, and the GitHub
error paths. The GitHub tests run against a local stub server that returns the exact HTTP responses
GitHub documents for rate limiting, empty repos and 404s — those cases are impractical to trigger
live (you would have to burn 5,000 requests) but are fully exercised here.

## API

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/analyze` | Body `{ repo, commitLimit?, prLimit? }`. Fetches recent commits + PRs, scores + summarizes each, upserts. Limits are 1-25, defaulting to 10 each when omitted. |
| `GET` | `/api/analyses?risk=&repo=&sort=&page=&limit=` | List. `sort` is `recent` \| `risk-desc` \| `risk-asc`. |
| `GET` | `/api/analyses/stats?repo=` | Total count + risk-level distribution. |
| `GET` | `/api/analyses/:id` | Single record detail. |

Sorting and pagination are both **server-side**. Sorting in the client would order only the visible
page, so a "highest risk first" view could leave the genuinely riskiest change unseen on page 2.
Ordering uses the numeric `riskScore`, never the level string — `"high" < "low" < "medium"`
alphabetically, so a lexical sort would rank results almost exactly backwards. Each sort carries a
deterministic `_id` tiebreak so pages cannot repeat or drop rows.

Read parameters are **clamped**; write parameters are **rejected**. Reads are cheap and idempotent so
forgiveness costs nothing, while an analyze run is expensive enough that silently honouring something
other than what was asked would be the wrong trade.

## Known limitations

- **A single analyze run is a long synchronous request.** 10 commits + 10 PRs at 10-30s of local LLM
  time each can exceed five minutes. A production version would make this a background job with a
  polling or streaming status endpoint; it is capped at 25 items per run rather than solved.
- **Ollama calls are sequential by design.** A local single-GPU Ollama serves one generation at a
  time, so concurrency would add latency and timeout risk without improving throughput.
- **Commits with >300 changed files are inherently partial** — GitHub's commit endpoint caps there
  and offers no pagination. Flagged via `fileListComplete`, not worked around.
- **Risk scoring is heuristic, not semantic.** It reads paths and line counts, not code. A one-line
  change to an auth check and a one-line comment fix in the same file score identically.
- **No automated frontend tests.** The 40-test suite (`cd backend && npm test`) covers the risk
  formula, truncation budget, LLM response parser and GitHub error paths; the dashboard is verified
  manually against a live backend and via the demo-mode build.

## Status

40 backend tests passing (`node:test`). Last verified end-to-end — live GitHub repo, local Ollama,
MongoDB Atlas — on 2026-09-17.

## License

[MIT](LICENSE)
