import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAnalysisResponse } from '../src/services/ollama.js';

// These cases are the observed failure modes of a small local model asked for strict JSON.
// The contract under test: parseAnalysisResponse ALWAYS returns a usable
// {summary, qualityNote, llmOutputMalformed} and never throws, however bad the input.

test('clean JSON is parsed with both fields', () => {
  const result = parseAnalysisResponse('{"summary": "Adds caching.", "qualityNote": "Looks fine."}');

  assert.equal(result.summary, 'Adds caching.');
  assert.equal(result.qualityNote, 'Looks fine.');
  assert.equal(result.llmOutputMalformed, false);
});

test('JSON wrapped in markdown fences and prose is recovered', () => {
  const raw = 'Sure! Here is the analysis:\n```json\n{"summary": "Refactors auth.", "qualityNote": "Clean."}\n```\nHope that helps!';
  const result = parseAnalysisResponse(raw);

  assert.equal(result.summary, 'Refactors auth.');
  assert.equal(result.qualityNote, 'Clean.');
  assert.equal(result.llmOutputMalformed, false);
});

test('missing qualityNote falls back to a neutral note without flagging malformed', () => {
  const result = parseAnalysisResponse('{"summary": "Adds a caching layer."}');

  assert.equal(result.summary, 'Adds a caching layer.');
  assert.equal(result.qualityNote, 'No specific concerns noted.');
  assert.equal(result.llmOutputMalformed, false);
});

test('empty qualityNote string falls back rather than surfacing a blank note', () => {
  const result = parseAnalysisResponse('{"summary": "Does a thing.", "qualityNote": "   "}');

  assert.equal(result.qualityNote, 'No specific concerns noted.');
});

test('prose with no JSON at all is surfaced as-is and flagged malformed', () => {
  const raw = "I'm sorry, I cannot analyze this diff as it appears to be truncated.";
  const result = parseAnalysisResponse(raw);

  assert.equal(result.summary, raw);
  assert.equal(result.llmOutputMalformed, true);
  assert.match(result.qualityNote, /not in the expected format/i);
});

test('empty response yields a placeholder summary and is flagged malformed', () => {
  const result = parseAnalysisResponse('');

  assert.equal(result.llmOutputMalformed, true);
  assert.ok(result.summary.length > 0, 'must not return an empty summary');
});

test('very long prose response is truncated rather than stored unbounded', () => {
  const result = parseAnalysisResponse('z'.repeat(5000));

  assert.equal(result.llmOutputMalformed, true);
  assert.ok(result.summary.length <= 500, `summary length ${result.summary.length} should be capped`);
});

test('malformed JSON that still contains the fields is recovered by regex fallback', () => {
  // Trailing comma makes this invalid JSON; the field-regex path should still find summary.
  const raw = '{"summary": "Bumps the dependency.", "qualityNote": "Pin the version.",}';
  const result = parseAnalysisResponse(raw);

  assert.equal(result.summary, 'Bumps the dependency.');
  assert.equal(result.qualityNote, 'Pin the version.');
});

test('JSON object embedded mid-sentence is extracted', () => {
  const raw = 'Based on the diff {"summary": "Removes dead code.", "qualityNote": "Good."} is my answer.';
  const result = parseAnalysisResponse(raw);

  assert.equal(result.summary, 'Removes dead code.');
  assert.equal(result.llmOutputMalformed, false);
});

test('non-string summary field is rejected rather than stored as an object', () => {
  const result = parseAnalysisResponse('{"summary": {"nested": "object"}, "qualityNote": "x"}');

  // Must not return a non-string summary — falls through to the malformed path.
  assert.equal(typeof result.summary, 'string');
  assert.equal(result.llmOutputMalformed, true);
});
