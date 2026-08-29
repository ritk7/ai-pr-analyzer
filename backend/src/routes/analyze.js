import { Router } from 'express';
import { analyzeRepo } from '../controllers/analyzeController.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireApiKey } from '../middleware/apiKeyAuth.js';

export const analyzeRouter = Router();

analyzeRouter.post('/analyze', requireApiKey, asyncHandler(analyzeRepo));
