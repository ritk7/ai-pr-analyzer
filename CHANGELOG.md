# Changelog

All notable changes to this project are documented here. Format loosely
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Documentation

- Noted the lack of an automated frontend test suite in Known limitations.
- Documented production start/build commands alongside dev mode.
- Documented GitHub Enterprise support via `GITHUB_API_BASE_URL`.
- Documented default commit/PR limits in the API reference.
- Added missing demo-mode files to the frontend architecture listing.

## Demo mode

- Made the demo "Analyze repo" button actually analyze the repo you type.
- Redesigned the dashboard around the explainable risk formula.
- Added static demo mode for GitHub Pages hosting.

## Initial release

- Built the AI PR & Code Review Assistant (MERN): GitHub commit/PR
  ingestion, an explainable additive risk-scoring formula, local-LLM
  summaries via Ollama, diff truncation to fit the model's context budget,
  and typed per-endpoint error handling. Hardened after an adversarial
  audit and added the MIT license.
