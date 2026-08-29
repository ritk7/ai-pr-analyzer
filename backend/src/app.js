import express from 'express';
import cors from 'cors';
import { analyzeRouter } from './routes/analyze.js';
import { analysesRouter } from './routes/analyses.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  app.get('/health', (req, res) => res.json({ ok: true }));

  app.use('/api', analyzeRouter);
  app.use('/api', analysesRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
