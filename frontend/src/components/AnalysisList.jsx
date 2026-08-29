import AnalysisCard from './AnalysisCard.jsx';

export default function AnalysisList({ items, loading, error }) {
  if (loading) {
    return (
      <div className="analysis-list">
        {[1, 2, 3].map((i) => (
          <div className="analysis-card analysis-card-skeleton" key={i}>
            <div className="skeleton skeleton-text" style={{ width: '30%' }} />
            <div className="skeleton skeleton-text" style={{ width: '70%' }} />
            <div className="skeleton skeleton-text" style={{ width: '90%' }} />
          </div>
        ))}
      </div>
    );
  }

  if (error) return null; // ErrorBanner is rendered by the parent for this case

  if (items.length === 0) {
    return (
      <div className="empty-state">
        <p>No analyses yet. Add a repo above to get started.</p>
      </div>
    );
  }

  return (
    <div className="analysis-list">
      {items.map((item) => (
        <AnalysisCard key={item._id} item={item} />
      ))}
    </div>
  );
}
