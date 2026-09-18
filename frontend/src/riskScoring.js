// Full port of backend/src/services/riskScoring.js, for the live GitHub Pages demo where
// there is no backend to call. This must stay behaviorally identical to the server version —
// same weights, same file patterns (from riskFormula.js), same reasoning strings — so a
// visitor typing a real repo sees the exact score the real app would have produced.
import {
  WEIGHTS,
  SIZE_THRESHOLDS,
  LEVEL_THRESHOLDS,
  MAX_FILES_NAMED_IN_REASONING,
  SENSITIVE_FILE_PATTERNS,
  TEST_FILE_PATTERNS,
  NON_CODE_FILE_PATTERNS,
} from './riskFormula.js';

const sensitiveFileRegexes = SENSITIVE_FILE_PATTERNS.map((p) => new RegExp(p, 'i'));
const testFileRegexes = TEST_FILE_PATTERNS.map((p) => new RegExp(p, 'i'));
const nonCodeFileRegexes = NON_CODE_FILE_PATTERNS.map((p) => new RegExp(p, 'i'));

const isSensitiveFile = (filename) => sensitiveFileRegexes.some((re) => re.test(filename));
const isTestFile = (filename) => testFileRegexes.some((re) => re.test(filename));
const isNonCodeFile = (filename) => nonCodeFileRegexes.some((re) => re.test(filename));

function formatFileList(filenames, limit) {
  if (filenames.length <= limit) return filenames.join(', ');
  return `${filenames.slice(0, limit).join(', ')}, and ${filenames.length - limit} more`;
}

export function scoreRisk({ files = [], additions, deletions, fileListComplete = true } = {}) {
  const totalAdditions = additions ?? files.reduce((sum, f) => sum + (f.additions ?? 0), 0);
  const totalDeletions = deletions ?? files.reduce((sum, f) => sum + (f.deletions ?? 0), 0);
  const linesChanged = totalAdditions + totalDeletions;

  const reasoning = [];
  let score = 0;

  let sizeBucket;
  let sizeWeight;
  if (linesChanged <= SIZE_THRESHOLDS.smallMaxLines) {
    sizeBucket = 'small';
    sizeWeight = WEIGHTS.sizeSmall;
  } else if (linesChanged <= SIZE_THRESHOLDS.mediumMaxLines) {
    sizeBucket = 'medium';
    sizeWeight = WEIGHTS.sizeMedium;
  } else {
    sizeBucket = 'large';
    sizeWeight = WEIGHTS.sizeLarge;
  }
  score += sizeWeight;
  reasoning.push(
    `Diff size is ${sizeBucket} (${linesChanged} lines changed: +${totalAdditions}/-${totalDeletions}), contributing +${sizeWeight}.`,
  );

  const sensitiveFiles = files
    .map((f) => f.filename)
    .filter((filename) => isSensitiveFile(filename) && !isTestFile(filename));
  if (sensitiveFiles.length > 0) {
    score += WEIGHTS.sensitiveFileTouched;
    reasoning.push(
      `Touches ${sensitiveFiles.length} sensitive file(s) (${formatFileList(sensitiveFiles, MAX_FILES_NAMED_IN_REASONING)}), contributing +${WEIGHTS.sensitiveFileTouched}.`,
    );
  } else {
    reasoning.push('No sensitive files (config/auth/manifests/CI) touched, contributing +0.');
  }

  const testFiles = files.filter((f) => isTestFile(f.filename));
  const codeFiles = files.filter((f) => !isTestFile(f.filename) && !isNonCodeFile(f.filename));
  const missingTests = codeFiles.length > 0 && testFiles.length === 0;
  if (missingTests) {
    score += WEIGHTS.noTestsIncluded;
    reasoning.push(
      `Changes ${codeFiles.length} code file(s) with no accompanying test file changes, contributing +${WEIGHTS.noTestsIncluded}.`,
    );
  } else if (testFiles.length > 0) {
    reasoning.push(`Includes ${testFiles.length} test file(s), contributing +0.`);
  } else {
    reasoning.push('No code files requiring test coverage were changed (docs/assets only, or no files), contributing +0.');
  }

  if (!fileListComplete) {
    reasoning.push(
      `Note: GitHub returned only ${files.length} file(s) for this change, so sensitive-file and test detection above may be incomplete. Treat the file-based findings as a lower bound.`,
    );
  }

  let level;
  if (score <= LEVEL_THRESHOLDS.lowMax) level = 'low';
  else if (score <= LEVEL_THRESHOLDS.mediumMax) level = 'medium';
  else level = 'high';

  return {
    level,
    score,
    reasoning,
    breakdown: {
      linesChanged,
      additions: totalAdditions,
      deletions: totalDeletions,
      sizeBucket,
      sensitiveFiles,
      testFilesIncluded: testFiles.map((f) => f.filename),
      missingTests,
      fileListComplete,
    },
  };
}
