import { AppError } from '../utils/errors.js';

// Single place every route's errors funnel through. Every AppError subclass carries its
// own statusCode + errorCode, so this handler never has to sniff error messages to decide
// how to respond — it just serializes whatever the error already knows about itself.
// Anything that reaches here as a plain Error (a real bug, not an anticipated failure mode)
// is logged with its stack and reported as a generic 500 without leaking internals.
export function errorHandler(err, req, res, _next) {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.errorCode,
        message: err.message,
        details: err.details,
      },
    });
    return;
  }

  // express.json() rejects unparseable or oversized bodies with its own error shape rather
  // than one of ours. Without this branch a client sending malformed JSON gets a misleading
  // 500 (and it pollutes the logs as if it were a server bug) when it is plainly a 4xx.
  if (err.type === 'entity.parse.failed') {
    res.status(400).json({
      error: { code: 'MALFORMED_JSON', message: 'Request body is not valid JSON.' },
    });
    return;
  }
  if (err.type === 'entity.too.large') {
    res.status(413).json({
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large.' },
    });
    return;
  }

  console.error(`[unhandled error] ${req.method} ${req.originalUrl}:`, err);
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
    },
  });
}

export function notFoundHandler(req, res) {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `No route: ${req.method} ${req.originalUrl}`,
    },
  });
}

// Wraps an async route handler so a thrown/rejected error is forwarded to errorHandler
// instead of crashing the process (Express doesn't auto-catch async errors pre-v5).
export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}
