import { useState } from 'react';

function timeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function AnalysisCard({ item }) {
  const [expanded, setExpanded] = useState(false);
  const { diffStats } = item;

  return (
    <div className="analysis-card">
      <div className="analysis-card-header">
        <span className={`risk-badge risk-badge-${item.riskLevel}`}>{item.riskLevel}</span>
        <span className="analysis-card-type">{item.type === 'pull_request' ? 'PR' : 'commit'}</span>
        <a href={item.url} target="_blank" rel="noreferrer" className="analysis-card-title">
          {item.title}
        </a>
      </div>

      <div className="analysis-card-meta">
        <span className="analysis-card-repo">{item.repo}</span>
        <span className="analysis-card-dot">·</span>
        <span>{item.author}</span>
        <span className="analysis-card-dot">·</span>
        <span title={item.lastAnalyzedAt}>{timeAgo(item.lastAnalyzedAt)}</span>
      </div>

      <p className="analysis-card-summary">{item.summary}</p>

      <p className="analysis-card-quality">
        <strong>Quality note:</strong> {item.qualityNote}
      </p>

      {(item.llmAnalysisFailed || item.llmOutputMalformed) && (
        <p className="analysis-card-flag">
          {item.llmAnalysisFailed
            ? 'AI analysis failed for this item — showing risk score only.'
            : 'AI response may be malformed — summary shown as-is.'}
        </p>
      )}

      <button className="analysis-card-expand" onClick={() => setExpanded((v) => !v)}>
        {expanded ? 'Hide details' : 'Show risk reasoning & diff stats'}
      </button>

      {expanded && (
        <div className="analysis-card-details">
          <div>
            <strong>Risk reasoning (score {item.riskScore}):</strong>
            <ul>
              {item.riskReasoning.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
          <div className="analysis-card-diffstats">
            <span>+{diffStats.additions} / -{diffStats.deletions}</span>
            <span>{diffStats.changedFiles} file(s) changed</span>
            {diffStats.sensitiveFiles.length > 0 && (
              <span>Sensitive: {diffStats.sensitiveFiles.join(', ')}</span>
            )}
            {diffStats.testFilesIncluded.length > 0 && (
              <span>Tests: {diffStats.testFilesIncluded.join(', ')}</span>
            )}
            {diffStats.diffTruncatedForLLM && <span>Diff truncated for AI analysis</span>}
            {diffStats.fileListComplete === false && (
              <span className="analysis-card-warn">
                Partial file list — sensitive/test findings are a lower bound
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
