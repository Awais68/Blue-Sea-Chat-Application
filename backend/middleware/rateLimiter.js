const rateLimit = require("express-rate-limit");

/**
 * General API rate limiter
 * 100 requests per 15 minutes per IP
 */
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { message: "Too many requests from this IP, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health check
    return req.path === "/health";
  },
});

/**
 * Auth endpoint limiter (stricter than the general one, but still usable).
 * Only failed attempts count, so a legitimate user typing a wrong password a
 * couple of times does not get locked out of their own account.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: {
    message: "Too many failed login attempts. Please try again in 15 minutes.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

/**
 * Message sending limiter
 * 50 messages per minute per user
 * Uses authenticated user ID for tracking
 */
const messageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 50,
  message: { message: "Sending messages too quickly, please slow down." },
  skip: (req) => !req.userId, // Only apply to authenticated users
  // Use default store for consistency
});

module.exports = { generalLimiter, authLimiter, messageLimiter };
