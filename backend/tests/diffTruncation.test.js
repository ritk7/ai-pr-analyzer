import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDiffTextForLLM } from '../src/services/diffTruncation.js';

const LIMITS = {
  maxTotalChars: 8000,
  maxCharsPerFile: 1500,
  maxFilesWithPatch: 12,
  tailReserveChars: 1200,
  maxOmittedFilesListed: 20,
};
const SENSITIVE = [/(^|\/)\.env(\..*)?$/i, /(^|\/)package\.json$/i];

function file(filename, { patchLength = 100, additions = 10, deletions = 5 } = {}) {
  return {
    filename,
    status: 'modified',
    additions,
    deletions,
    changes: additions + deletions,
    patch: 'x'.repeat(patchLength),
  };
}

test('small diff passes through untruncated', () => {
  const result = buildDiffTextForLLM([file('src/a.js'), file('src/b.js')], LIMITS, SENSITIVE);

  assert.equal(result.wasTruncated, false);
  assert.equal(result.includedFiles.length, 2);
  assert.equal(result.omittedFiles.length, 0);
  assert.ok(result.text.includes('src/a.js'));
});

test('a single oversized file patch is truncated and marked', () => {
  const result = buildDiffTextForLLM([file('src/huge.js', { patchLength: 50_000 })], LIMITS, SENSITIVE);

  assert.equal(result.wasTruncated, true);
  assert.ok(result.text.includes('[patch truncated]'));
  assert.ok(
    result.text.length <= LIMITS.maxTotalChars,
    `text length ${result.text.length} must not exceed the ${LIMITS.maxTotalChars} budget`,
  );
});

test('total character budget is never exceeded, headers and tail included', () => {
  const files = Array.from({ length: 40 }, (_, i) => file(`src/file${i}.js`, { patchLength: 1400 }));
  const result = buildDiffTextForLLM(files, LIMITS, SENSITIVE);

  assert.ok(
    result.text.length <= LIMITS.maxTotalChars,
    `assembled text (${result.text.length}) must not exceed the ${LIMITS.maxTotalChars} budget`,
  );
  assert.equal(result.wasTruncated, true);
  assert.ok(result.omittedFiles.length > 0, 'some files must be omitted');
});

test('budget holds even with hundreds of files (unbounded tail regression)', () => {
  // Regression: the omitted-files tail was previously unbudgeted, so a change of this size
  // appended ~300 filename lines after the patch budget was already spent.
  const files = Array.from({ length: 300 }, (_, i) => file(`src/module${i}/index.js`, { patchLength: 900 }));
  const result = buildDiffTextForLLM(files, LIMITS, SENSITIVE);

  assert.ok(
    result.text.length <= LIMITS.maxTotalChars,
    `assembled text (${result.text.length}) must not exceed the ${LIMITS.maxTotalChars} budget`,
  );
  assert.equal(result.includedFiles.length + result.omittedFiles.length, 300);
  assert.ok(result.text.includes('more file(s)'), 'tail should summarize the unlisted remainder');
});

test('maxFilesWithPatch caps how many files get patch bodies', () => {
  const files = Array.from({ length: 30 }, (_, i) => file(`src/file${i}.js`, { patchLength: 50 }));
  const result = buildDiffTextForLLM(files, LIMITS, SENSITIVE);

  assert.ok(
    result.includedFiles.length <= LIMITS.maxFilesWithPatch,
    `included ${result.includedFiles.length} files, cap is ${LIMITS.maxFilesWithPatch}`,
  );
  assert.equal(result.includedFiles.length + result.omittedFiles.length, 30);
});

test('sensitive files are prioritized into the included set over larger ordinary files', () => {
  // The .env change is tiny; without prioritization the 20 big files would crowd it out.
  const files = [
    ...Array.from({ length: 20 }, (_, i) => file(`src/big${i}.js`, { patchLength: 1400, additions: 500 })),
    file('.env', { patchLength: 40, additions: 1, deletions: 0 }),
  ];
  const result = buildDiffTextForLLM(files, LIMITS, SENSITIVE);

  assert.ok(result.includedFiles.includes('.env'), 'sensitive file must be included despite being smallest');
  assert.ok(result.text.indexOf('.env') < result.text.indexOf('src/big0.js'), '.env should be ranked first');
});

test('omitted files are still listed by name so the model knows they exist', () => {
  const files = Array.from({ length: 30 }, (_, i) => file(`src/file${i}.js`, { patchLength: 900 }));
  const result = buildDiffTextForLLM(files, LIMITS, SENSITIVE);

  assert.ok(result.omittedFiles.length > 0);
  assert.ok(result.text.includes('Additional files changed but not shown in full'));
  for (const name of result.omittedFiles.slice(0, 3)) {
    assert.ok(result.text.includes(name), `omitted file ${name} should still be named in the text`);
  }
});

test('files with no patch body (binary/too large) do not crash and are reported as omitted', () => {
  const files = [
    { filename: 'assets/logo.png', status: 'modified', additions: 0, deletions: 0, changes: 0 },
    file('src/a.js'),
  ];
  const result = buildDiffTextForLLM(files, LIMITS, SENSITIVE);

  assert.ok(result.omittedFiles.includes('assets/logo.png'));
  assert.ok(result.text.includes('assets/logo.png'));
});

test('empty file list produces empty output rather than throwing', () => {
  const result = buildDiffTextForLLM([], LIMITS, SENSITIVE);

  assert.equal(result.text, '');
  assert.equal(result.wasTruncated, false);
  assert.deepEqual(result.includedFiles, []);
});
