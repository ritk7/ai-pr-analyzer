import { timingSafeEqual } from 'node:crypto';
import { config } from '../config/index.js';
import { AppError } from '../utils/errors.js';

class UnauthorizedError extends AppError {
  constructor(message) {
    super(message, { statusCode: 401, errorCode: 'UNAUTHORIZED' });
  }
}

/** Constant-time compare so a wrong key can't be recovered by timing the response. */
function secretsMatch(provided, expected) {
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Opt-in shared-secret guard for state-changing endpoints.
 *
 * Threat model this addresses: POST /api/analyze is the only endpoint that consumes the
 * operator's GitHub token quota, drives local GPU work, and writes to their database. Left
 * open on a non-loopback interface it is a free resource-abuse proxy for anyone who can
 * reach the port.
 *
 * When API_KEY is unset the guard is disabled and the server logs that fact at startup —
 * appropriate for the intended loopback-only development use, and deliberately explicit
 * rather than silent. Setting API_KEY is what a deployment beyond localhost must do.
 *
 * Read endpoints are intentionally left open: they expose only public-repo analysis results,
 * and gating them would add friction to the dashboard for no meaningful protection.
 */
export function requireApiKey(req, res, next) {
  if (!config.apiKey) return next();

  const provided = req.get('x-api-key');
  if (!provided) {
    throw new UnauthorizedError('Missing x-api-key header. This endpoint requires an API key.');
  }
  if (!secretsMatch(provided, config.apiKey)) {
    throw new UnauthorizedError('Invalid API key.');
  }
  return next();
}
