import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreRisk } from '../src/services/riskScoring.js';

test('tiny safe diff (README typo fix) -> low risk', () => {
  const result = scoreRisk({
    files: [{ filename: 'README.md', additions: 3, deletions: 1 }],
  });
  assert.equal(result.level, 'low');
  assert.equal(result.breakdown.sensitiveFiles.length, 0);
});

test('huge diff across many files, no tests -> high risk', () => {
  const files = Array.from({ length: 20 }, (_, i) => ({
    filename: `src/module${i}.js`,
    additions: 50,
    deletions: 25,
  }));
  const result = scoreRisk({ files });
  assert.equal(result.level, 'high');
  assert.equal(result.breakdown.missingTests, true);
});

test('tiny diff touching only a sensitive file (package.json) -> escalated risk', () => {
  const result = scoreRisk({
    files: [{ filename: 'package.json', additions: 2, deletions: 1 }],
  });
  // Small in size alone would be "low", but the sensitive-file weight must push it up.
  assert.notEqual(result.level, 'low');
  assert.ok(result.breakdown.sensitiveFiles.includes('package.json'));
});

test('moderate diff WITH matching tests included -> lower score than without', () => {
  const withTests = scoreRisk({
    files: [
      { filename: 'src/services/payment.js', additions: 80, deletions: 20 },
      { filename: 'src/services/payment.test.js', additions: 60, deletions: 0 },
    ],
  });
  assert.equal(withTests.breakdown.missingTests, false);
});

// Regression: these conventions were previously unrecognized, so every Go/Ruby/JVM/.NET
// change that DID ship tests was still penalized +2 for "no tests". Filenames below are
// real paths taken from kubernetes/kubernetes diffs.
test('recognizes test-file conventions across ecosystems, not just JS/Python', () => {
  const cases = [
    'pkg/apis/scheduling/validation/validation_test.go',
    'staging/src/k8s.io/endpointslice/reconciler_test.go',
    'lib/parser_spec.rb',
    'src/main/java/com/example/UserServiceTest.java',
    'Services/PaymentServiceTests.cs',
    'lib/widget_test.dart',
  ];

  for (const testFile of cases) {
    const result = scoreRisk({
      files: [
        { filename: 'src/service.js', additions: 40, deletions: 10 },
        { filename: testFile, additions: 30, deletions: 0 },
      ],
    });
    assert.equal(result.breakdown.missingTests, false, `${testFile} should count as a test file`);
    assert.ok(result.breakdown.testFilesIncluded.includes(testFile));
  }
});

test('does NOT treat a spec/ directory as tests (rust target-spec false positive)', () => {
  // rust-lang/rust has compiler/rustc_target/src/spec/ meaning "target specification".
  // Treating that as tests would wrongly suppress the missing-tests signal on real code.
  const result = scoreRisk({
    files: [{ filename: 'compiler/rustc_target/src/spec/targets/sparc_unknown_linux_gnu.rs', additions: 20, deletions: 2 }],
  });

  assert.equal(result.breakdown.missingTests, true);
  assert.deepEqual(result.breakdown.testFilesIncluded, []);
});

// Regression: paths like pkg/kubelet/apis/config/helpers_test.go matched the `config/`
// sensitive rule, so an ordinary Go test change reported "touches 12 sensitive file(s)".
test('test files under a config/ path are not counted as sensitive', () => {
  const result = scoreRisk({
    files: [
      { filename: 'pkg/kubelet/apis/config/helpers_test.go', additions: 20, deletions: 4 },
      { filename: 'pkg/kubelet/apis/config/scheme/testdata/Kubelet.yaml', additions: 3, deletions: 0 },
    ],
  });

  assert.deepEqual(result.breakdown.sensitiveFiles, [], 'test fixtures must not be flagged sensitive');
  assert.equal(result.breakdown.missingTests, false, 'a test-only change is not missing tests');
  assert.equal(result.level, 'low');
});

test('a real config file IS still flagged sensitive', () => {
  // Guard against the exclusion above over-correcting into missing genuine config changes.
  const result = scoreRisk({
    files: [{ filename: 'config/database.yml', additions: 5, deletions: 2 }],
  });

  assert.deepEqual(result.breakdown.sensitiveFiles, ['config/database.yml']);
  assert.notEqual(result.level, 'low');
});

test('incomplete file list is disclosed in reasoning without inflating the score', () => {
  const files = Array.from({ length: 300 }, (_, i) => ({
    filename: `src/module${i}.js`,
    additions: 20,
    deletions: 5,
  }));

  const complete = scoreRisk({ files, fileListComplete: true });
  const incomplete = scoreRisk({ files, fileListComplete: false });

  assert.equal(incomplete.score, complete.score, 'disclosure must not change the score');
  assert.equal(incomplete.breakdown.fileListComplete, false);
  assert.ok(
    incomplete.reasoning.some((line) => /may be incomplete/i.test(line)),
    'reasoning must disclose that file-based findings are a lower bound',
  );
  assert.ok(!complete.reasoning.some((line) => /may be incomplete/i.test(line)));
});

test('reasoning names a bounded number of sensitive files rather than all of them', () => {
  const files = Array.from({ length: 40 }, (_, i) => ({
    filename: `config/service${i}/settings.yml`,
    additions: 3,
    deletions: 1,
  }));
  const result = scoreRisk({ files });

  const sensitiveLine = result.reasoning.find((l) => l.includes('sensitive file'));
  assert.ok(sensitiveLine.includes('more'), 'should summarize the remainder instead of listing all 40');
  assert.ok(sensitiveLine.length < 500, `reasoning line was ${sensitiveLine.length} chars — too long to read`);
  assert.equal(result.breakdown.sensitiveFiles.length, 40, 'breakdown still carries the full list');
});

test('same moderate diff WITHOUT tests -> higher score than the tests-included version', () => {
  const withoutTests = scoreRisk({
    files: [{ filename: 'src/services/payment.js', additions: 80, deletions: 20 }],
  });

  const withTests = scoreRisk({
    files: [
      { filename: 'src/services/payment.js', additions: 80, deletions: 20 },
      { filename: 'src/services/payment.test.js', additions: 60, deletions: 0 },
    ],
  });

  assert.equal(withoutTests.breakdown.missingTests, true);
  assert.ok(
    withoutTests.score > withTests.score,
    `expected no-tests score (${withoutTests.score}) > with-tests score (${withTests.score})`,
  );
});
