// Client-side mirror of the backend risk formula, used only by the interactive explainer.
//
// Source of truth is backend/src/config/index.js — these constants are duplicated here on
// purpose so the explainer works on static hosting with no API. Keep them in sync; the
// backend remains authoritative for every score actually stored.
export const WEIGHTS = {
  sizeSmall: 0,
  sizeMedium: 2,
  sizeLarge: 4,
  sensitiveFileTouched: 4,
  noTestsIncluded: 2,
};

export const SIZE_THRESHOLDS = { smallMaxLines: 50, mediumMaxLines: 300 };
export const LEVEL_THRESHOLDS = { lowMax: 1, mediumMax: 5 };

// Highest score the three factors can sum to — used to scale the explainer's meter.
export const MAX_SCORE = WEIGHTS.sizeLarge + WEIGHTS.sensitiveFileTouched + WEIGHTS.noTestsIncluded;

export function levelFor(score) {
  if (score <= LEVEL_THRESHOLDS.lowMax) return 'low';
  if (score <= LEVEL_THRESHOLDS.mediumMax) return 'medium';
  return 'high';
}

/**
 * Same three additive factors as services/riskScoring.js, reduced to the inputs the
 * explainer exposes: a line count, whether a sensitive file is touched, whether tests ship.
 */
export function computeRisk({ linesChanged, touchesSensitive, includesTests }) {
  let sizePoints;
  let sizeBucket;
  if (linesChanged <= SIZE_THRESHOLDS.smallMaxLines) {
    sizeBucket = 'small';
    sizePoints = WEIGHTS.sizeSmall;
  } else if (linesChanged <= SIZE_THRESHOLDS.mediumMaxLines) {
    sizeBucket = 'medium';
    sizePoints = WEIGHTS.sizeMedium;
  } else {
    sizeBucket = 'large';
    sizePoints = WEIGHTS.sizeLarge;
  }

  const sensitivePoints = touchesSensitive ? WEIGHTS.sensitiveFileTouched : 0;
  const testPoints = includesTests ? 0 : WEIGHTS.noTestsIncluded;
  const score = sizePoints + sensitivePoints + testPoints;

  return {
    score,
    level: levelFor(score),
    terms: [
      {
        key: 'size',
        label: `Diff size — ${sizeBucket} (${linesChanged} lines)`,
        points: sizePoints,
      },
      {
        key: 'sensitive',
        label: touchesSensitive ? 'Sensitive file touched' : 'No sensitive files touched',
        points: sensitivePoints,
      },
      {
        key: 'tests',
        label: includesTests ? 'Tests included with the change' : 'No accompanying tests',
        points: testPoints,
      },
    ],
  };
}
