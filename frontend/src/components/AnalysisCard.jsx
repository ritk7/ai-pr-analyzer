import { useState } from 'react';
import { WEIGHTS, MAX_SCORE } from '../riskFormula.js';

function timeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/**
 * Splits a stored score back into its three contributing factors so the card can show the
 * arithmetic at a glance. The stored record keeps the inputs (sensitive files, test files,
 * line counts) but not the per-factor points, so they're re-derived from the same weights.
 */
function scoreSegments(item) {
  const { additions = 0, deletions = 0, sensitiveFiles = [] } = item.diffStats;
  const lines = additions + deletions;

  let sizePoints = WEIGHTS.sizeSmall;
  if (lines > 300) sizePoints = WEIGHTS.sizeLarge;
  else if (lines > 50) sizePoints = WEIGHTS.sizeMedium;

  const sensitivePoints = sensitiveFiles.length > 0 ? WEIGHTS.sensitiveFileTouched : 0;
  // The stored score is exactly the sum of the three factors, so whatever the first two
  // don't account for is the missing-tests penalty.
  const testPoints = Math.max(0, item.riskScore - sizePoints - sensitivePoints);

  return [
    { key: 'size', className: 'score-seg-size', points: sizePoints },
    { key: 'sensitive', className: 'score-seg-sensitive', points: sensitivePoints },
    { key: 'tests', className: 'score-seg-tests', points: testPoints },
  ].filter((seg) => seg.points > 0);
}

export default function AnalysisCard({ item }) {
  const [expanded, setExpanded] = useState(false);
  const { diffStats } = item;
  const segments = scoreSegments(item);

  return (
    <article className="analysis-card">
      <div className="analysis-card-header">
        <span className={`badge risk-badge-${item.riskLevel}`}>{item.riskLevel}</span>
        <span className="analysis-card-type">{item.type === 'pull_request' ? 'pull request' : 'commit'}</span>
        <a href={item.url} target="_blank" rel="noreferrer" className="analysis-card-title">
          {item.title}
        </a>
      </div>

      <div className="analysis-card-meta">
        <span>{item.repo}</span>
        <span className="analysis-card-dot">·</span>
        <span>{item.author}</span>
        <span className="analysis-card-dot">·</span>
        <span>+{diffStats.additions}/-{diffStats.deletions}</span>
        <span className="analysis-card-dot">·</span>
        <span title={item.lastAnalyzedAt}>{timeAgo(item.lastAnalyzedAt)}</span>
      </div>

      <div className="score-strip">
        <div
          className="score-bar"
          role="img"
          aria-label={`Risk score ${item.riskScore} of ${MAX_SCORE}`}
        >
          {segments.map((seg) => (
            <span
              key={seg.key}
              className={`score-seg ${seg.className}`}
              style={{ width: `${(seg.points / MAX_SCORE) * 100}%` }}
            />
          ))}
        </div>
        <span className="score-value">
          {item.riskScore}/{MAX_SCORE}
        </span>
      </div>

      <p className="analysis-card-summary">{item.summary}</p>

      <p className="analysis-card-quality">{item.qualityNote}</p>

      {(item.llmAnalysisFailed || item.llmOutputMalformed) && (
        <p className="analysis-card-flag">
          {item.llmAnalysisFailed
            ? 'AI analysis failed for this item — showing risk score only.'
            : 'AI response may be malformed — summary shown as-is.'}
        </p>
      )}

      <button className="analysis-card-expand" onClick={() => setExpanded((v) => !v)}>
        {expanded ? 'Hide reasoning' : 'Why this score?'}
      </button>

      {expanded && (
        <div className="analysis-card-details">
          <strong>Risk reasoning</strong>
          <ul>
            {item.riskReasoning.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
          <div className="analysis-card-diffstats">
            <span>{diffStats.changedFiles} files</span>
            {diffStats.sensitiveFiles.length > 0 && (
              <span>sensitive: {diffStats.sensitiveFiles.join(', ')}</span>
            )}
            {diffStats.testFilesIncluded.length > 0 && (
              <span>tests: {diffStats.testFilesIncluded.length}</span>
            )}
            {diffStats.diffTruncatedForLLM && <span>diff truncated for LLM</span>}
            {diffStats.fileListComplete === false && (
              <span className="analysis-card-warn">partial file list — findings are a lower bound</span>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
