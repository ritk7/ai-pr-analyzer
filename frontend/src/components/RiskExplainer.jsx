import { useState } from 'react';
import { computeRisk, MAX_SCORE, LEVEL_THRESHOLDS } from '../riskFormula.js';

// Slider positions are non-linear: most real diffs are small, but the interesting threshold
// (300 lines) sits low in a range that has to reach ~1200 to feel realistic. Stepping through
// named stops keeps every meaningful boundary one drag apart.
const LINE_STOPS = [5, 20, 50, 80, 150, 300, 420, 700, 1200];

export default function RiskExplainer() {
  const [stopIndex, setStopIndex] = useState(2);
  const [touchesSensitive, setTouchesSensitive] = useState(false);
  const [includesTests, setIncludesTests] = useState(false);

  const linesChanged = LINE_STOPS[stopIndex];
  const { score, level, terms } = computeRisk({ linesChanged, touchesSensitive, includesTests });

  // Marker position across the low|medium|high segments, which are sized by their score spans.
  const markerPercent = Math.min(100, (score / MAX_SCORE) * 100);

  return (
    <section className="explainer" aria-label="Interactive risk formula">
      <div className="explainer-head">
        <h2>How the score is built</h2>
        <p>Three additive factors — change the inputs, watch the arithmetic.</p>
      </div>

      <div className="explainer-body">
        <div>
          <div className="control">
            <div className="control-label">
              <label htmlFor="lines">Lines changed</label>
              <span className="control-value">
                {linesChanged} {linesChanged === 1 ? 'line' : 'lines'}
              </span>
            </div>
            <input
              id="lines"
              type="range"
              min="0"
              max={LINE_STOPS.length - 1}
              step="1"
              value={stopIndex}
              onChange={(e) => setStopIndex(Number(e.target.value))}
              aria-valuetext={`${linesChanged} lines changed`}
            />
          </div>

          <div className="control">
            <div className="control-label">
              <span>What the diff touches</span>
            </div>
            <div className="toggle-row">
              <button
                type="button"
                className="toggle"
                aria-pressed={touchesSensitive}
                onClick={() => setTouchesSensitive((v) => !v)}
              >
                <span className="toggle-dot" aria-hidden="true" />
                Sensitive file
              </button>
              <button
                type="button"
                className="toggle"
                aria-pressed={includesTests}
                onClick={() => setIncludesTests((v) => !v)}
              >
                <span className="toggle-dot" aria-hidden="true" />
                Ships tests
              </button>
            </div>
          </div>

          <div className="control">
            <div className="verdict-terms">
              {terms.map((term) => (
                <div className={`term ${term.points === 0 ? 'term-zero' : ''}`} key={term.key}>
                  <span>{term.label}</span>
                  <span className="term-points">+{term.points}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="verdict">
          <div>
            <div className="verdict-score">
              <span className={`verdict-number verdict-number-${level}`}>{score}</span>
              <span className="verdict-outof">/ {MAX_SCORE}</span>
            </div>
            <span className={`badge risk-badge-${level}`}>{level} risk</span>
          </div>

          <div className="scale">
            <div className="scale-track">
              <div className="scale-seg-low" />
              <div className="scale-seg-medium" />
              <div className="scale-seg-high" />
              <span className="scale-marker" style={{ left: `${markerPercent}%` }} aria-hidden="true" />
            </div>
            <div className="scale-labels">
              <span>low 0-{LEVEL_THRESHOLDS.lowMax}</span>
              <span>med {LEVEL_THRESHOLDS.lowMax + 1}-{LEVEL_THRESHOLDS.mediumMax}</span>
              <span>high {LEVEL_THRESHOLDS.mediumMax + 1}+</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
