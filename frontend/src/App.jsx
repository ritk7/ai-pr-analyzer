import { useEffect, useState, useCallback } from 'react';
import RepoInput from './components/RepoInput.jsx';
import StatsPanel from './components/StatsPanel.jsx';
import FilterBar from './components/FilterBar.jsx';
import AnalysisList from './components/AnalysisList.jsx';
import Pagination from './components/Pagination.jsx';
import ErrorBanner from './components/ErrorBanner.jsx';
import { analyzeRepo, fetchAnalyses, fetchStats } from './api.js';

const PAGE_SIZE = 10;

export default function App() {
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [analyzeError, setAnalyzeError] = useState(null);
  const [lastRunSummary, setLastRunSummary] = useState(null);

  const [page, setPage] = useState(1);
  const [pageData, setPageData] = useState({ items: [], total: 0, totalPages: 1 });
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(null);

  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const [riskFilter, setRiskFilter] = useState('');
  const [sortBy, setSortBy] = useState('recent');
  const [repoFilter, setRepoFilter] = useState('');

  // Sorting and pagination are both server-side: the client holds one page at a time, so
  // ordering here would only sort the visible slice and could hide the highest-risk item
  // on a later page.
  const loadList = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const data = await fetchAnalyses({
        risk: riskFilter || undefined,
        repo: repoFilter || undefined,
        sort: sortBy,
        page,
        limit: PAGE_SIZE,
      });
      setPageData({ items: data.items, total: data.total, totalPages: data.totalPages });
    } catch (err) {
      setListError(err);
      setPageData({ items: [], total: 0, totalPages: 1 });
    } finally {
      setListLoading(false);
    }
  }, [riskFilter, repoFilter, sortBy, page]);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      setStats(await fetchStats(repoFilter || undefined));
    } catch {
      setStats(null);
    } finally {
      setStatsLoading(false);
    }
  }, [repoFilter]);

  // Any change to a filter or sort invalidates the current page number — showing page 4 of
  // a result set that now has 2 pages would render an empty list with no explanation.
  useEffect(() => {
    setPage(1);
  }, [riskFilter, repoFilter, sortBy]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      loadList();
      loadStats();
    }, repoFilter ? 300 : 0); // debounce only while typing a repo filter
    return () => clearTimeout(timeout);
  }, [loadList, loadStats, repoFilter]);

  async function handleAnalyze(repo) {
    setAnalyzeLoading(true);
    setAnalyzeError(null);
    setLastRunSummary(null);
    try {
      const result = await analyzeRepo(repo);
      setLastRunSummary(result);
      setPage(1);
      await Promise.all([loadList(), loadStats()]);
    } catch (err) {
      setAnalyzeError(err);
    } finally {
      setAnalyzeLoading(false);
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>AI PR &amp; Code Review Assistant</h1>
        <p className="app-subtitle">Pull recent commits &amp; PRs, get an explainable risk score and an AI summary.</p>
      </header>

      <RepoInput onAnalyze={handleAnalyze} loading={analyzeLoading} />

      {analyzeError && <ErrorBanner error={analyzeError} onDismiss={() => setAnalyzeError(null)} />}

      {lastRunSummary && !analyzeError && (
        <div className="run-summary">
          Analyzed <strong>{lastRunSummary.repo}</strong>: {lastRunSummary.succeeded} saved
          {lastRunSummary.failed > 0 && `, ${lastRunSummary.failed} skipped`}
          {' '}({lastRunSummary.commitsFetched} commits, {lastRunSummary.pullRequestsFetched} PRs fetched).
        </div>
      )}

      <StatsPanel stats={stats} loading={statsLoading} />

      <FilterBar
        riskFilter={riskFilter}
        onRiskFilterChange={setRiskFilter}
        sortBy={sortBy}
        onSortByChange={setSortBy}
        repoFilter={repoFilter}
        onRepoFilterChange={setRepoFilter}
      />

      {listError && <ErrorBanner error={listError} onDismiss={() => setListError(null)} />}

      <AnalysisList items={pageData.items} loading={listLoading} error={listError} />

      <Pagination
        page={page}
        totalPages={pageData.totalPages}
        total={pageData.total}
        onPageChange={setPage}
        disabled={listLoading}
      />
    </div>
  );
}
