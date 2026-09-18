import { queryDemoAnalyses, demoStatsFor } from './demoStore.js';
import { analyzeRepoLive } from './liveAnalysis.js';

// Static GitHub Pages hosting has no backend — VITE_DEMO_MODE (set by `npm run build:demo`)
// switches reads to the in-memory demoStore and "Analyze repo" to a real, live fetch against
// GitHub's public API (see liveAnalysis.js) instead of calling this non-existent backend.
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';
const DEMO_READ_DELAY_MS = 300;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

async function request(path, options) {
  let res;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
  } catch {
    const error = new Error(`Could not reach the API server at ${API_BASE_URL}. Is the backend running?`);
    error.code = 'NETWORK_ERROR';
    throw error;
  }

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const error = new Error(data?.error?.message || `Request failed with status ${res.status}`);
    error.code = data?.error?.code || 'UNKNOWN_ERROR';
    error.status = res.status;
    throw error;
  }

  return data;
}

export function analyzeRepo(repo) {
  if (DEMO_MODE) {
    return analyzeRepoLive(repo);
  }
  return request('/api/analyze', { method: 'POST', body: JSON.stringify({ repo }) });
}

export async function fetchAnalyses({ risk, repo, page, limit, sort } = {}) {
  if (DEMO_MODE) {
    await delay(DEMO_READ_DELAY_MS);
    return queryDemoAnalyses({ risk, repo, sort, page, limit });
  }
  const params = new URLSearchParams();
  if (risk) params.set('risk', risk);
  if (repo) params.set('repo', repo);
  if (page) params.set('page', String(page));
  if (limit) params.set('limit', String(limit));
  if (sort) params.set('sort', sort);
  const qs = params.toString();
  return request(`/api/analyses${qs ? `?${qs}` : ''}`);
}

export async function fetchStats(repo) {
  if (DEMO_MODE) {
    await delay(DEMO_READ_DELAY_MS);
    return demoStatsFor(repo);
  }
  const qs = repo ? `?repo=${encodeURIComponent(repo)}` : '';
  return request(`/api/analyses/stats${qs}`);
}

export { DEMO_MODE };
