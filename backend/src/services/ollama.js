import { config } from '../config/index.js';
import { buildDiffTextForLLM } from './diffTruncation.js';
import { OllamaUnavailableError, OllamaTimeoutError } from '../utils/errors.js';

const sensitiveRegexes = config.risk.sensitiveFilePatterns.map((p) => new RegExp(p, 'i'));

function buildPrompt(item, diffText) {
  return `You are a senior software engineer doing a quick code review triage pass.

Below is a ${item.type === 'pull_request' ? 'pull request' : 'commit'} titled "${item.title}".
It changes ${item.changedFiles} file(s), +${item.additions}/-${item.deletions} lines.

Respond with ONLY a single JSON object, no markdown fences, no extra text, in exactly this shape:
{"summary": "1-2 plain-English sentences describing what this change does and why it likely matters", "qualityNote": "one short sentence noting a concrete code quality observation or concern, or \\"No specific concerns noted.\\" if nothing stands out"}

Diff:
${diffText || '(no file patches available)'}`;
}

/**
 * Extracts {summary, qualityNote} from Ollama's raw text response. llama3.2:3b mostly
 * obeys "respond with only JSON", but not always — it can wrap the JSON in prose or
 * markdown fences, or occasionally drop a field. We try, in order: (1) strict JSON.parse,
 * (2) pull the first {...} block out of the text and parse that, (3) regex-extract the two
 * fields directly. If all three fail, we do NOT throw — a bad summary shouldn't fail the
 * whole analysis — we fall back to the raw text as the summary and flag it explicitly so
 * callers/UI can show "auto-generated summary may be malformed" instead of silently
 * pretending it's clean structured output.
 */
export function parseAnalysisResponse(rawText) {
  const attempts = [
    () => JSON.parse(rawText),
    () => {
      const match = rawText.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('no JSON object found');
      return JSON.parse(match[0]);
    },
  ];

  for (const attempt of attempts) {
    try {
      const parsed = attempt();
      if (parsed && typeof parsed.summary === 'string') {
        return {
          summary: parsed.summary.trim(),
          qualityNote:
            typeof parsed.qualityNote === 'string' && parsed.qualityNote.trim()
              ? parsed.qualityNote.trim()
              : 'No specific concerns noted.',
          llmOutputMalformed: false,
        };
      }
    } catch {
      // try next strategy
    }
  }

  const summaryMatch = rawText.match(/"summary"\s*:\s*"([^"]*)"/);
  const qualityMatch = rawText.match(/"qualityNote"\s*:\s*"([^"]*)"/);
  if (summaryMatch) {
    return {
      summary: summaryMatch[1].trim(),
      qualityNote: qualityMatch ? qualityMatch[1].trim() : 'No specific concerns noted.',
      llmOutputMalformed: !qualityMatch,
    };
  }

  return {
    summary: rawText.trim().slice(0, 500) || 'The model did not return a usable summary.',
    qualityNote: 'Not available — the model response was not in the expected format.',
    llmOutputMalformed: true,
  };
}

async function callOllamaGenerate(prompt) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.ollama.requestTimeoutMs);

  let response;
  try {
    response = await fetch(`${config.ollama.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.ollama.model,
        prompt,
        stream: false,
        options: {
          num_ctx: config.ollama.numCtx,
          num_predict: config.ollama.maxOutputTokens,
        },
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new OllamaTimeoutError(config.ollama.requestTimeoutMs);
    }
    throw new OllamaUnavailableError(error);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new OllamaUnavailableError(new Error(`HTTP ${response.status}: ${body.slice(0, 300)}`));
  }

  const data = await response.json();
  return data.response ?? '';
}

/**
 * Full LLM analysis pipeline for one commit/PR: truncate the diff to fit the model's
 * context budget, prompt the model, and parse its response defensively.
 * @param {object} item normalized commit/PR object from services/github.js
 * @returns {Promise<{summary:string, qualityNote:string, llmOutputMalformed:boolean, diffTruncated:boolean, includedFileCount:number, omittedFileCount:number}>}
 */
export async function analyzeWithOllama(item) {
  const { text, wasTruncated, includedFiles, omittedFiles } = buildDiffTextForLLM(
    item.files,
    config.diffTruncation,
    sensitiveRegexes,
  );

  const prompt = buildPrompt(item, text);
  const rawResponse = await callOllamaGenerate(prompt);
  const parsed = parseAnalysisResponse(rawResponse);

  return {
    ...parsed,
    diffTruncated: wasTruncated,
    includedFileCount: includedFiles.length,
    omittedFileCount: omittedFiles.length,
  };
}
