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
export const MAX_FILES_NAMED_IN_REASONING = 5;

// File-path patterns, copied verbatim from backend/src/config/index.js, for the full-repo
// formula in riskScoring.js. Not used by the two-toggle calculator above.
export const SENSITIVE_FILE_PATTERNS = [
  '(^|/)\\.env(\\..*)?$',
  '(^|/)package(-lock)?\\.json$',
  '(^|/)yarn\\.lock$',
  '(^|/)pnpm-lock\\.yaml$',
  '(^|/)requirements\\.txt$',
  '(^|/)pipfile(\\.lock)?$',
  '(^|/)pyproject\\.toml$',
  '(^|/)go\\.(mod|sum)$',
  '(^|/)gemfile(\\.lock)?$',
  '(^|/)composer\\.(json|lock)$',
  '(^|/)dockerfile$',
  '(^|/)docker-compose\\.ya?ml$',
  '(^|/)config(s)?/',
  '(^|/)(auth|authentication|authorization)(/|\\.)',
  '\\.github/workflows/',
  '(secret|credential|apikey|api_key)',
];

export const TEST_FILE_PATTERNS = [
  '\\.(test|spec)\\.[jt]sx?$',
  '(^|/)__tests__/',
  '(^|/)tests?/',
  '(^|/)[^/]*_test\\.(go|py|rb|rs|ts|tsx|js|jsx|dart|ex|exs)$',
  '(^|/)[^/]*_spec\\.(rb|js|jsx|ts|tsx)$',
  '(^|/)[^/]*Tests?\\.(cs|java|kt|kts|swift|php|scala)$',
  '(^|/)test_[^/]+\\.py$',
  '(^|/)testdata/',
];

export const NON_CODE_FILE_PATTERNS = [
  '\\.mdx?$',
  '\\.txt$',
  '\\.rst$',
  '(^|/)LICENSE([.-].*)?$',
  '(^|/)CHANGELOG([.-].*)?$',
  '(^|/)README([.-].*)?$',
  '\\.(png|jpe?g|gif|svg|ico|webp)$',
];

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
