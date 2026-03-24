'use strict';

/**
 * Authentication routes
 * POST /login          – email + password → JWT
 * POST /refresh        – refresh access token
 * POST /logout         – client-side logout (token blacklist not implemented here)
 * GET  /me             – current user profile
 * PUT  /me             – update name / email
 * POST /change-password
 */

require('dotenv').config();
const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { authenticate, authRateLimiter } = require('../middleware/auth');

const router = express.Router();

const JWT_SECRET     = process.env.JWT_SECRET     || 'hccp_fallback_secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// ── Helpers ────────────────────────────────────────────────────────────────

function generateToken(user) {
  return jwt.sign(
    {
      sub:       user.id,
      email:     user.email,
      role:      user.role,
      tenant_id: user.tenant_id,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function generateRefreshToken(userId) {
  return jwt.sign({ sub: userId, type: 'refresh' }, JWT_SECRET, { expiresIn: '7d' });
}

function safeUser(user) {
  const { password_hash, ...safe } = user;
  return safe;
}

function writeAuditLog(db, { tenantId, userId, action, resourceType, resourceId, details, ip }) {
  db.prepare(`
    INSERT INTO audit_logs (id, tenant_id, user_id, action, resource_type, resource_id, details, ip_address, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(uuidv4(), tenantId || null, userId || null, action, resourceType || null, resourceId || null, JSON.stringify(details || {}), ip || null);
}

// ── POST /login ────────────────────────────────────────────────────────────
router.post('/login', authRateLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());

    if (!user) {
      // Use consistent timing to prevent user enumeration
      await bcrypt.compare(password, '$2a$10$dummyhashtopreventtimingattack000000000000000');
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ error: 'Account is suspended or inactive.' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Update last_login
    db.prepare('UPDATE users SET last_login = datetime(\'now\') WHERE id = ?').run(user.id);

    const accessToken  = generateToken(user);
    const refreshToken = generateRefreshToken(user.id);

    // Load tenant info if present
    let tenant = null;
    if (user.tenant_id) {
      tenant = db.prepare('SELECT id, name, plan, status, max_robots FROM tenants WHERE id = ?').get(user.tenant_id);
    }

    writeAuditLog(db, {
      tenantId: user.tenant_id, userId: user.id,
      action: 'USER_LOGIN', resourceType: 'user', resourceId: user.id,
      details: { email: user.email }, ip: req.ip,
    });

    res.json({
      accessToken,
      refreshToken,
      expiresIn: JWT_EXPIRES_IN,
      user: safeUser(user),
      tenant,
    });
  } catch (err) {
    console.error('[auth/login]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── POST /refresh ──────────────────────────────────────────────────────────
router.post('/refresh', (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ error: 'refreshToken is required.' });
  }

  let payload;
  try {
    payload = jwt.verify(refreshToken, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired refresh token.' });
  }

  if (payload.type !== 'refresh') {
    return res.status(401).json({ error: 'Token is not a refresh token.' });
  }

  const db   = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub);

  if (!user || user.status !== 'active') {
    return res.status(401).json({ error: 'User not found or inactive.' });
  }

  const accessToken     = generateToken(user);
  const newRefreshToken = generateRefreshToken(user.id);

  res.json({ accessToken, refreshToken: newRefreshToken, expiresIn: JWT_EXPIRES_IN });
});

// ── POST /logout ───────────────────────────────────────────────────────────
router.post('/logout', authenticate, (req, res) => {
  const db = getDb();
  writeAuditLog(db, {
    tenantId: req.user.tenant_id, userId: req.user.id,
    action: 'USER_LOGOUT', resourceType: 'user', resourceId: req.user.id,
    ip: req.ip,
  });
  // In a stateless JWT setup the client simply discards the token.
  // A production system would maintain a token blocklist in Redis.
  res.json({ message: 'Logged out successfully.' });
});

// ── GET /me ────────────────────────────────────────────────────────────────
router.get('/me', authenticate, (req, res) => {
  const db   = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  let tenant = null;
  if (user.tenant_id) {
    tenant = db.prepare('SELECT id, name, plan, status, max_robots FROM tenants WHERE id = ?').get(user.tenant_id);
  }

  res.json({ user: safeUser(user), tenant });
});

// ── PUT /me ────────────────────────────────────────────────────────────────
router.put('/me', authenticate, (req, res) => {
  const { name, email } = req.body;

  if (!name && !email) {
    return res.status(400).json({ error: 'At least one field (name, email) is required.' });
  }

  const db = getDb();

  // Check email uniqueness if updating
  if (email) {
    const conflict = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email.toLowerCase().trim(), req.user.id);
    if (conflict) {
      return res.status(409).json({ error: 'Email already in use.' });
    }
  }

  const updates = [];
  const values  = [];

  if (name)  { updates.push('name = ?');  values.push(name.trim()); }
  if (email) { updates.push('email = ?'); values.push(email.toLowerCase().trim()); }

  values.push(req.user.id);
  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: safeUser(updated) });
});

// ── POST /change-password ──────────────────────────────────────────────────
router.post('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'currentPassword and newPassword are required.' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    }

    const db   = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, user.id);

    writeAuditLog(db, {
      tenantId: user.tenant_id, userId: user.id,
      action: 'PASSWORD_CHANGED', resourceType: 'user', resourceId: user.id,
      ip: req.ip,
    });

    res.json({ message: 'Password updated successfully.' });
  } catch (err) {
    console.error('[auth/change-password]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
