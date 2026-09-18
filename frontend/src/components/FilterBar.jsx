const RISK_CHIPS = [
  { value: '', label: 'All' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

export default function FilterBar({
  riskFilter,
  onRiskFilterChange,
  sortBy,
  onSortByChange,
  repoFilter,
  onRepoFilterChange,
}) {
  return (
    <div className="filter-bar">
      <div className="filter-group">
        <span className="filter-legend">Risk</span>
        <div className="chip-row">
          {RISK_CHIPS.map((chip) => (
            <button
              key={chip.value || 'all'}
              type="button"
              className={`chip ${chip.value ? `chip-${chip.value}` : ''}`}
              aria-pressed={riskFilter === chip.value}
              onClick={() => onRiskFilterChange(chip.value)}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-group">
        <label className="filter-legend" htmlFor="sort">
          Sort
        </label>
        <select id="sort" value={sortBy} onChange={(e) => onSortByChange(e.target.value)}>
          <option value="recent">Most recent</option>
          <option value="risk-desc">Highest risk first</option>
          <option value="risk-asc">Lowest risk first</option>
        </select>
      </div>

      <div className="filter-group">
        <label className="filter-legend" htmlFor="repo-filter">
          Repo
        </label>
        <input
          id="repo-filter"
          type="text"
          placeholder="owner/repo"
          value={repoFilter}
          onChange={(e) => onRepoFilterChange(e.target.value)}
        />
      </div>
    </div>
  );
}
