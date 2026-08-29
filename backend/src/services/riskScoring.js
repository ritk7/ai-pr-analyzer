import { config } from '../config/index.js';

const sensitiveFileRegexes = config.risk.sensitiveFilePatterns.map((p) => new RegExp(p, 'i'));
const testFileRegexes = config.risk.testFilePatterns.map((p) => new RegExp(p, 'i'));
const nonCodeFileRegexes = config.risk.nonCodeFilePatterns.map((p) => new RegExp(p, 'i'));

function isSensitiveFile(filename) {
  return sensitiveFileRegexes.some((re) => re.test(filename));
}

function isTestFile(filename) {
  return testFileRegexes.some((re) => re.test(filename));
}

function isNonCodeFile(filename) {
  return nonCodeFileRegexes.some((re) => re.test(filename));
}

/** Names up to `limit` files inline, summarizing the remainder so reasoning stays readable. */
function formatFileList(filenames, limit) {
  if (filenames.length <= limit) return filenames.join(', ');
  return `${filenames.slice(0, limit).join(', ')}, and ${filenames.length - limit} more`;
}

/**
 * Pure risk-scoring function. No I/O, no GitHub/Ollama/DB calls — takes normalized diff
 * stats and returns an explainable score. This is the formula, explained:
 *
 *   1. Diff size (lines changed = additions + deletions):
 *        <= smallMaxLines            -> +0  ("small")
 *        <= mediumMaxLines           -> +2  ("medium")
 *        >  mediumMaxLines           -> +4  ("large")
 *
 *   2. Sensitive files touched (config/auth paths, package manifests, lockfiles, Docker,
 *      CI workflows, anything that looks like a secret/credential file):
 *        any matched                 -> +4, and each matched file is named in the reasoning
 *
 *   3. Test coverage:
 *        diff touches non-test, non-docs/asset ("code") files but includes NO test file
 *        changes                     -> +2
 *        (tests included, diff is test-only, diff is docs/assets-only (e.g. README), or
 *        there are no files at all -> +0)
 *
 *   Total score -> level:
 *        score <= lowMax                    -> "low"
 *        lowMax < score <= mediumMax         -> "medium"
 *        score > mediumMax                   -> "high"
 *
 * All thresholds/weights live in config/index.js — nothing here is a magic number.
 *
 * @param {object} input
 * @param {Array<{filename: string, additions?: number, deletions?: number, changes?: number}>} input.files
 * @param {number} [input.additions] total additions (defaults to sum of files[].additions)
 * @param {number} [input.deletions] total deletions (defaults to sum of files[].deletions)
 * @returns {{level: 'low'|'medium'|'high', score: number, reasoning: string[], breakdown: object}}
 */
export function scoreRisk({ files = [], additions, deletions, fileListComplete = true } = {}) {
  const totalAdditions = additions ?? files.reduce((sum, f) => sum + (f.additions ?? 0), 0);
  const totalDeletions = deletions ?? files.reduce((sum, f) => sum + (f.deletions ?? 0), 0);
  const linesChanged = totalAdditions + totalDeletions;

  const { sizeThresholds, weights, levelThresholds, maxFilesNamedInReasoning } = config.risk;
  const reasoning = [];
  let score = 0;

  // 1. Size
  let sizeBucket;
  let sizeWeight;
  if (linesChanged <= sizeThresholds.smallMaxLines) {
    sizeBucket = 'small';
    sizeWeight = weights.sizeSmall;
  } else if (linesChanged <= sizeThresholds.mediumMaxLines) {
    sizeBucket = 'medium';
    sizeWeight = weights.sizeMedium;
  } else {
    sizeBucket = 'large';
    sizeWeight = weights.sizeLarge;
  }
  score += sizeWeight;
  reasoning.push(
    `Diff size is ${sizeBucket} (${linesChanged} lines changed: +${totalAdditions}/-${totalDeletions}), ` +
      `contributing +${sizeWeight}.`,
  );

  // 2. Sensitive files. Test files are excluded even when their path matches a sensitive
  // pattern: kubernetes has packages like pkg/kubelet/apis/config/ whose *_test.go files and
  // testdata/ fixtures matched the `config/` rule, so a routine test change was reported as
  // "touches 12 sensitive files". Test fixtures do not ship configuration, and diluting the
  // sensitive-file signal with them is what makes a "high risk" label stop being trusted.
  const sensitiveFiles = files
    .map((f) => f.filename)
    .filter((filename) => isSensitiveFile(filename) && !isTestFile(filename));
  if (sensitiveFiles.length > 0) {
    score += weights.sensitiveFileTouched;
    reasoning.push(
      `Touches ${sensitiveFiles.length} sensitive file(s) (${formatFileList(sensitiveFiles, maxFilesNamedInReasoning)}), ` +
        `contributing +${weights.sensitiveFileTouched}.`,
    );
  } else {
    reasoning.push('No sensitive files (config/auth/manifests/CI) touched, contributing +0.');
  }

  // 3. Test coverage. Docs/asset-only changes (README, images, ...) don't need tests, so
  // they're excluded from the "code files" set that this check applies to.
  const testFiles = files.filter((f) => isTestFile(f.filename));
  const codeFiles = files.filter((f) => !isTestFile(f.filename) && !isNonCodeFile(f.filename));
  const missingTests = codeFiles.length > 0 && testFiles.length === 0;
  if (missingTests) {
    score += weights.noTestsIncluded;
    reasoning.push(
      `Changes ${codeFiles.length} code file(s) with no accompanying test file changes, contributing +${weights.noTestsIncluded}.`,
    );
  } else if (testFiles.length > 0) {
    reasoning.push(`Includes ${testFiles.length} test file(s), contributing +0.`);
  } else {
    reasoning.push('No code files requiring test coverage were changed (docs/assets only, or no files), contributing +0.');
  }

  // 4. Honesty disclosure. GitHub caps how many file objects it will return per commit/PR,
  // so on very large changes the two file-based signals above were computed from a subset.
  // The score is deliberately NOT inflated for this — a change that large already scores
  // +4 on size — but the reader must be told the file-based findings may be incomplete.
  if (!fileListComplete) {
    reasoning.push(
      `Note: GitHub returned only ${files.length} file(s) for this change, so sensitive-file and ` +
        `test detection above may be incomplete. Treat the file-based findings as a lower bound.`,
    );
  }

  let level;
  if (score <= levelThresholds.lowMax) level = 'low';
  else if (score <= levelThresholds.mediumMax) level = 'medium';
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
