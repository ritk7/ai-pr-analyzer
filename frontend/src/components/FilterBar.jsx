export default function FilterBar({ riskFilter, onRiskFilterChange, sortBy, onSortByChange, repoFilter, onRepoFilterChange }) {
  return (
    <div className="filter-bar">
      <label>
        Risk
        <select value={riskFilter} onChange={(e) => onRiskFilterChange(e.target.value)}>
          <option value="">All</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </label>

      <label>
        Sort
        <select value={sortBy} onChange={(e) => onSortByChange(e.target.value)}>
          <option value="recent">Most recent</option>
          <option value="risk-desc">Highest risk first</option>
          <option value="risk-asc">Lowest risk first</option>
        </select>
      </label>

      <label>
        Repo
        <input
          type="text"
          placeholder="Filter by repo…"
          value={repoFilter}
          onChange={(e) => onRepoFilterChange(e.target.value)}
        />
      </label>
    </div>
  );
}
