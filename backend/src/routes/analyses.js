import { Router } from 'express';
import { listAnalyses, getStats, getAnalysisById } from '../controllers/analysesController.js';
import { asyncHandler } from '../middleware/errorHandler.js';

export const analysesRouter = Router();

// /stats must be registered before /:id, otherwise "stats" is matched as an :id param.
analysesRouter.get('/analyses/stats', asyncHandler(getStats));
analysesRouter.get('/analyses/:id', asyncHandler(getAnalysisById));
analysesRouter.get('/analyses', asyncHandler(listAnalyses));
