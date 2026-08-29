const RISK_ORDER = ['high', 'medium', 'low'];

export default function StatsPanel({ stats, loading }) {
  if (loading) {
    return (
      <div className="stats-panel stats-panel-loading">
        <div className="skeleton skeleton-text" style={{ width: '40%' }} />
        <div className="skeleton skeleton-bar" />
      </div>
    );
  }

  if (!stats) return null;

  const { total, riskDistribution } = stats;
  const max = Math.max(1, ...RISK_ORDER.map((level) => riskDistribution[level] ?? 0));

  return (
    <div className="stats-panel">
      <div className="stats-total">
        <span className="stats-total-number">{total}</span>
        <span className="stats-total-label">analyzed</span>
      </div>
      <div className="stats-distribution">
        {RISK_ORDER.map((level) => {
          const count = riskDistribution[level] ?? 0;
          const pct = total === 0 ? 0 : Math.round((count / max) * 100);
          return (
            <div className="stats-row" key={level}>
              <span className={`risk-dot risk-dot-${level}`} />
              <span className="stats-row-label">{level}</span>
              <div className="stats-row-track">
                <div className={`stats-row-fill stats-row-fill-${level}`} style={{ width: `${pct}%` }} />
              </div>
              <span className="stats-row-count">{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
