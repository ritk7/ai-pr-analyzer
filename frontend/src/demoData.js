// Sample data for the static GitHub Pages demo (npm run build:demo). The real dashboard talks
// to a live backend — GitHub API, local Ollama, MongoDB — none of which exist on a static host,
// so this file stands in for that backend when VITE_DEMO_MODE=true (see api.js).
//
// Most entries are real captured output from testing this project against live repos during
// development (ritk7/AI-Knowledge-Document-Management-Platform, octocat/Hello-World); a few are
// synthetic but computed by hand against the exact same formula in riskScoring.js, for risk-level
// variety the real captures didn't happen to cover.

function iso(hoursAgo) {
  return new Date(Date.now() - hoursAgo * 3600_000).toISOString();
}

export const DEMO_ANALYSES = [
  {
    _id: 'demo0000000000000000001',
    repo: 'ritk7/AI-Knowledge-Document-Management-Platform',
    type: 'commit',
    externalId: '409f1265ef76a9288d81407efc6d22c11895dd9',
    title: 'Hybrid RAG document Q&A platform with measured retrieval pipeline',
    author: 'ritk7',
    url: 'https://github.com/ritk7/AI-Knowledge-Document-Management-Platform/commit/409f1265ef76a9288d81407efc6d22c11895dd9',
    lastAnalyzedAt: iso(2),
    summary:
      'This commit introduces a hybrid Q&A platform with a measured retrieval pipeline, allowing users to upload documents and retrieve relevant answers. The platform uses a combination of dense vector search, BM25 keyword search, weighted fusion, and cross-encoder re-ranking.',
    qualityNote: 'No specific concerns noted.',
    llmAnalysisFailed: false,
    llmOutputMalformed: false,
    riskLevel: 'high',
    riskScore: 10,
    riskReasoning: [
      'Diff size is large (9394 lines changed: +9394/-0), contributing +4.',
      'Touches 2 sensitive file(s) (.env.example, requirements.txt), contributing +4.',
      'Changes 26 code file(s) with no accompanying test file changes, contributing +2.',
    ],
    diffStats: {
      additions: 9394,
      deletions: 0,
      changedFiles: 34,
      sensitiveFiles: ['.env.example', 'requirements.txt'],
      testFilesIncluded: [],
      diffTruncatedForLLM: true,
      fileListComplete: true,
    },
  },
  {
    _id: 'demo0000000000000000002',
    repo: 'ritk7/AI-Knowledge-Document-Management-Platform',
    type: 'commit',
    externalId: '9fbe5cbede932a447d6ba8f3bf4a5139b2d058a',
    title: 'Switch generation to local Ollama; fix upload/retrieval bugs found by adversarial testing',
    author: 'ritk1806',
    url: 'https://github.com/ritk7/AI-Knowledge-Document-Management-Platform/commit/9fbe5cbede932a447d6ba8f3bf4a5139b2d058a',
    lastAnalyzedAt: iso(3),
    summary: 'Switched to local Ollama for answer generation, fixing upload/retrieval bugs discovered through adversarial testing.',
    qualityNote: 'Code formatting inconsistencies and missing whitespace around operators could improve code readability.',
    llmAnalysisFailed: false,
    llmOutputMalformed: false,
    riskLevel: 'high',
    riskScore: 10,
    riskReasoning: [
      'Diff size is large (777 lines changed: +680/-97), contributing +4.',
      'Touches 2 sensitive file(s) (.env.example, requirements.txt), contributing +4.',
      'Changes 15 code file(s) with no accompanying test file changes, contributing +2.',
    ],
    diffStats: {
      additions: 680,
      deletions: 97,
      changedFiles: 18,
      sensitiveFiles: ['.env.example', 'requirements.txt'],
      testFilesIncluded: [],
      diffTruncatedForLLM: true,
      fileListComplete: true,
    },
  },
  {
    _id: 'demo0000000000000000003',
    repo: 'ritk7/AI-Knowledge-Document-Management-Platform',
    type: 'pull_request',
    externalId: '14',
    title: 'Bump fastapi from 0.104.1 to 0.109.2',
    author: 'dependabot[bot]',
    url: 'https://github.com/ritk7/AI-Knowledge-Document-Management-Platform/pull/14',
    lastAnalyzedAt: iso(5),
    summary: 'Bumps the fastapi dependency to pick up upstream security fixes; no application code changes.',
    qualityNote: 'Manifest-only change — verify the app still boots against the new version before merging.',
    llmAnalysisFailed: false,
    llmOutputMalformed: false,
    riskLevel: 'high',
    riskScore: 6,
    riskReasoning: [
      'Diff size is small (5 lines changed: +3/-2), contributing +0.',
      'Touches 1 sensitive file(s) (requirements.txt), contributing +4.',
      'Changes 1 code file(s) with no accompanying test file changes, contributing +2.',
    ],
    diffStats: {
      additions: 3,
      deletions: 2,
      changedFiles: 1,
      sensitiveFiles: ['requirements.txt'],
      testFilesIncluded: [],
      diffTruncatedForLLM: false,
      fileListComplete: true,
    },
  },
  {
    _id: 'demo0000000000000000004',
    repo: 'ritk7/AI-Knowledge-Document-Management-Platform',
    type: 'pull_request',
    externalId: '9',
    title: 'Add in-memory cache for repeated retrieval queries',
    author: 'ritk7',
    url: 'https://github.com/ritk7/AI-Knowledge-Document-Management-Platform/pull/9',
    lastAnalyzedAt: iso(8),
    summary:
      'Introduces an in-memory cache keyed on the normalized query string to avoid redundant embedding lookups on repeated searches.',
    qualityNote: 'Consider a cache invalidation strategy and a test covering a stale-cache read before merging.',
    llmAnalysisFailed: false,
    llmOutputMalformed: false,
    riskLevel: 'medium',
    riskScore: 4,
    riskReasoning: [
      'Diff size is medium (160 lines changed: +140/-20), contributing +2.',
      'No sensitive files (config/auth/manifests/CI) touched, contributing +0.',
      'Changes 3 code file(s) with no accompanying test file changes, contributing +2.',
    ],
    diffStats: {
      additions: 140,
      deletions: 20,
      changedFiles: 3,
      sensitiveFiles: [],
      testFilesIncluded: [],
      diffTruncatedForLLM: false,
      fileListComplete: true,
    },
  },
  {
    _id: 'demo0000000000000000005',
    repo: 'kubernetes/kubernetes',
    type: 'pull_request',
    externalId: '139206',
    title: 'Improve node-labels flag validation in kubelet',
    author: 'liggitt',
    url: 'https://github.com/kubernetes/kubernetes/pull/139206',
    lastAnalyzedAt: iso(11),
    summary: 'Tightens validation on the --node-labels kubelet flag to reject a class of malformed label values earlier, with clearer error messages.',
    qualityNote: 'No specific concerns noted.',
    llmAnalysisFailed: false,
    llmOutputMalformed: false,
    riskLevel: 'medium',
    riskScore: 4,
    riskReasoning: [
      'Diff size is medium (384 lines changed: +291/-93), contributing +2.',
      'No sensitive files (config/auth/manifests/CI) touched, contributing +0.',
      'Changes 8 code file(s) with no accompanying test file changes, contributing +2.',
    ],
    diffStats: {
      additions: 291,
      deletions: 93,
      changedFiles: 12,
      sensitiveFiles: [],
      testFilesIncluded: [],
      diffTruncatedForLLM: true,
      fileListComplete: true,
    },
  },
  {
    _id: 'demo0000000000000000006',
    repo: 'octocat/Hello-World',
    type: 'pull_request',
    externalId: '10964',
    title: '   Update README with practice note',
    author: '192521306simats-beep',
    url: 'https://github.com/octocat/Hello-World/pull/10964',
    lastAnalyzedAt: iso(20),
    summary: 'Updated README with additional practice notes, providing context for users on how to use the repository.',
    qualityNote: 'Code is clean and concise, no formatting issues noted.',
    llmAnalysisFailed: false,
    llmOutputMalformed: false,
    riskLevel: 'low',
    riskScore: 0,
    riskReasoning: [
      'Diff size is small (2 lines changed: +2/-0), contributing +0.',
      'No sensitive files (config/auth/manifests/CI) touched, contributing +0.',
      'No code files requiring test coverage were changed (docs/assets only, or no files), contributing +0.',
    ],
    diffStats: {
      additions: 2,
      deletions: 0,
      changedFiles: 1,
      sensitiveFiles: [],
      testFilesIncluded: [],
      diffTruncatedForLLM: false,
      fileListComplete: true,
    },
  },
  {
    _id: 'demo0000000000000000007',
    repo: 'octocat/Hello-World',
    type: 'pull_request',
    externalId: '11005',
    title: 'Internal write-path probe',
    author: 'Tyagiquamar',
    url: 'https://github.com/octocat/Hello-World/pull/11005',
    lastAnalyzedAt: iso(26),
    summary: 'This pull request likely improves internal performance by probing the write path without introducing new code.',
    qualityNote: 'No specific concerns noted.',
    llmAnalysisFailed: false,
    llmOutputMalformed: false,
    riskLevel: 'low',
    riskScore: 0,
    riskReasoning: [
      'Diff size is small (1 lines changed: +1/-0), contributing +0.',
      'No sensitive files (config/auth/manifests/CI) touched, contributing +0.',
      'No code files requiring test coverage were changed (docs/assets only, or no files), contributing +0.',
    ],
    diffStats: {
      additions: 1,
      deletions: 0,
      changedFiles: 1,
      sensitiveFiles: [],
      testFilesIncluded: [],
      diffTruncatedForLLM: false,
      fileListComplete: true,
    },
  },
];

export function demoStats(repoFilter) {
  const items = repoFilter ? DEMO_ANALYSES.filter((a) => a.repo === repoFilter) : DEMO_ANALYSES;
  const riskDistribution = { low: 0, medium: 0, high: 0 };
  for (const item of items) riskDistribution[item.riskLevel]++;
  return { total: items.length, riskDistribution };
}

const SORTERS = {
  recent: (a, b) => new Date(b.lastAnalyzedAt) - new Date(a.lastAnalyzedAt),
  'risk-desc': (a, b) => b.riskScore - a.riskScore,
  'risk-asc': (a, b) => a.riskScore - b.riskScore,
};

export function demoAnalyses({ risk, repo, sort = 'recent', page = 1, limit = 10 }) {
  let items = DEMO_ANALYSES.filter((a) => (!risk || a.riskLevel === risk) && (!repo || a.repo === repo));
  items = [...items].sort(SORTERS[sort] ?? SORTERS.recent);

  const total = items.length;
  const totalPages = Math.ceil(total / limit) || 1;
  const start = (page - 1) * limit;

  return { items: items.slice(start, start + limit), total, page, limit, sort, totalPages };
}
