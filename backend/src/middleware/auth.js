'use strict';

/**
 * Authentication & authorization middleware for HCCP.
 *
 * Exports:
 *   authenticate        – verifies JWT, attaches req.user
 *   authorize(...roles) – role-based access control
 *   tenantIsolation     – enforces single-tenant data access
 *   authRateLimiter     – tight rate limit for /auth endpoints
 *   apiRateLimiter      – general API rate limit
 */

require('dotenv').config();
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { getDb } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'hccp_fallback_secret';

// ── Rate Limiters ──────────────────────────────────────────────────────────

/** Strict limiter for authentication endpoints (login, refresh) */
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again in 15 minutes.' },
  skipSuccessfulRequests: false,
});

/** General API rate limiter */
const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,        // 1 minute
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'API rate limit exceeded. Please slow down.' },
});

// ── authenticate ───────────────────────────────────────────────────────────

/**
 * Verifies the JWT in the Authorization header.
 * On success attaches the full user record to req.user.
 */
function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header.' });
  }

  const token = authHeader.slice(7);

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token has expired.', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid token.', code: 'TOKEN_INVALID' });
  }

  // Load fresh user data from DB (catches deleted / suspended users)
  const db = getDb();
  const user = db
    .prepare('SELECT id, tenant_id, email, name, role, status FROM users WHERE id = ?')
    .get(payload.sub);

  if (!user) {
    return res.status(401).json({ error: 'User no longer exists.', code: 'USER_NOT_FOUND' });
  }
  if (user.status !== 'active') {
    return res.status(403).json({ error: 'Account is suspended or inactive.', code: 'ACCOUNT_INACTIVE' });
  }

  req.user = user;
  next();
}

// ── authorize ──────────────────────────────────────────────────────────────

/**
 * Returns middleware that allows only the specified roles.
 * super_admin always bypasses role checks.
 *
 * Usage: router.get('/sensitive', authenticate, authorize('tenant_admin', 'fleet_manager'), handler)
 */
function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated.' });
    }
    if (req.user.role === 'super_admin') {
      return next(); // super_admin can do anything
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied. Required role(s): ${allowedRoles.join(', ')}.`,
        code: 'INSUFFICIENT_ROLE',
      });
    }
    next();
  };
}

// ── tenantIsolation ────────────────────────────────────────────────────────

/**
 * Ensures that non-super_admin users can only access data belonging to their
 * own tenant.
 *
 * Looks for a tenant identifier in (in priority order):
 *   1. req.params.tenantId
 *   2. req.query.tenant_id
 *   3. req.body.tenant_id
 *   4. req.targetTenantId (set by route handler before calling next())
 *
 * If none is found, attaches req.tenantId = req.user.tenant_id so downstream
 * handlers can use it without re-checking.
 */
function tenantIsolation(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }

  // super_admin can cross tenant boundaries
  if (req.user.role === 'super_admin') {
    // Still set tenantId for convenience (may be null for super_admin)
    req.tenantId = req.params.tenantId || req.query.tenant_id || req.user.tenant_id || null;
    return next();
  }

  const requestedTenantId =
    req.params.tenantId ||
    req.query.tenant_id ||
    (req.body && req.body.tenant_id) ||
    req.targetTenantId;

  // If a specific tenant is requested, verify it matches the user's tenant
  if (requestedTenantId && requestedTenantId !== req.user.tenant_id) {
    return res.status(403).json({
      error: 'Access denied. You can only access your own tenant\'s data.',
      code: 'TENANT_MISMATCH',
    });
  }

  // Attach the verified tenant ID to the request for handlers
  req.tenantId = req.user.tenant_id;
  next();
}

module.exports = {
  authenticate,
  authorize,
  tenantIsolation,
  authRateLimiter,
  apiRateLimiter,
};
