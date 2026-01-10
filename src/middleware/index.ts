/**
 * Middleware Index
 * Exports all middleware functions
 */

export {
  verifyJWT,
  optionalJWT,
  createAuthDecorator,
  requireRoles,
} from './auth.middleware.js';

export {
  validateSession,
  optionalSession,
  validateAuthOrSession,
} from './session.middleware.js';

export {
  createRateLimiter,
  defaultRateLimiter,
  authRateLimiter,
  heavyRateLimiter,
  uploadRateLimiter,
  rateLimitConfigs,
} from './rate-limit.middleware.js';

export {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  AppError,
  Errors,
} from './error.middleware.js';
