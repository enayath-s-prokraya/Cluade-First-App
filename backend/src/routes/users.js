'use strict';

/**
 * Users routes (tenant-scoped)
 *
 * GET    /users        list users in tenant
 * POST   /users        invite / create user
 * GET    /users/:id    user detail
 * PUT    /users/:id    update user
 * DELETE /users/:id    deactivate user
 */

const express = require('express');
const bcrypt  = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { authenticate, authorize, tenantIsolation } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, tenantIsolation);

function safeUser(user) {
  const { password_hash, ...safe } = user;
  return safe;
}

// ── GET /users ─────────────────────────────────────────────────────────────
router.get('/', authorize('super_admin', 'tenant_admin', 'fleet_manager'), (req, res) => {
  const db = getDb();

  let query  = 'SELECT * FROM users WHERE 1=1';
  const params = [];

  if (req.user.role !== 'super_admin') {
    query += ' AND tenant_id = ?'; params.push(req.tenantId);
  }

  const { status, role } = req.query;
  if (status) { query += ' AND status = ?'; params.push(status); }
  if (role)   { query += ' AND role = ?';   params.push(role); }

  query += ' ORDER BY created_at DESC';

  const users = db.prepare(query).all(...params).map(safeUser);
  res.json({ users });
});

// ── POST /users ────────────────────────────────────────────────────────────
router.post('/', authorize('super_admin', 'tenant_admin'), async (req, res) => {
  try {
    const { email, name, role, password } = req.body;

    if (!email || !name || !role) {
      return res.status(400).json({ error: 'email, name, and role are required.' });
    }

    const validRoles = ['tenant_admin', 'fleet_manager', 'operator', 'viewer'];
    // Only super_admin can create super_admin users
    if (role === 'super_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only super_admin can create super_admin users.' });
    }
    if (!['super_admin', ...validRoles].includes(role)) {
      return res.status(400).json({ error: `role must be one of: ${['super_admin', ...validRoles].join(', ')}` });
    }

    const db = getDb();

    const conflict = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
    if (conflict) return res.status(409).json({ error: 'Email already in use.' });

    // Default temp password if not provided
    const plainPassword = password || Math.random().toString(36).slice(-12);
    const hash = await bcrypt.hash(plainPassword, 10);

    const userId = uuidv4();
    db.prepare(`
      INSERT INTO users (id, tenant_id, email, password_hash, name, role, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'active', datetime('now'))
    `).run(userId, req.tenantId, email.toLowerCase().trim(), hash, name.trim(), role);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    res.status(201).json({
      user: safeUser(user),
      // Only include temp password in response if it was auto-generated
      ...(!password && { temp_password: plainPassword }),
    });
  } catch (err) {
    console.error('[users/POST]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── GET /users/:id ─────────────────────────────────────────────────────────
router.get('/:id', authorize('super_admin', 'tenant_admin', 'fleet_manager'), (req, res) => {
  const db   = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);

  if (!user) return res.status(404).json({ error: 'User not found.' });
  if (req.user.role !== 'super_admin' && user.tenant_id !== req.tenantId) {
    return res.status(403).json({ error: 'Access denied.' });
  }

  res.json({ user: safeUser(user) });
});

// ── PUT /users/:id ─────────────────────────────────────────────────────────
router.put('/:id', authorize('super_admin', 'tenant_admin'), async (req, res) => {
  try {
    const db   = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);

    if (!user) return res.status(404).json({ error: 'User not found.' });
    if (req.user.role !== 'super_admin' && user.tenant_id !== req.tenantId) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    // Protect super_admin from demotion by non-super_admin
    if (user.role === 'super_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Cannot modify a super_admin account.' });
    }

    const allowed  = ['name', 'email', 'role', 'status'];
    const updates  = [];
    const values   = [];

    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(field === 'email' ? req.body[field].toLowerCase().trim() : req.body[field]);
      }
    }

    if (req.body.password) {
      updates.push('password_hash = ?');
      values.push(await bcrypt.hash(req.body.password, 10));
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updatable fields provided.' });
    }

    // Check email uniqueness if updating
    if (req.body.email) {
      const conflict = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?')
        .get(req.body.email.toLowerCase().trim(), user.id);
      if (conflict) return res.status(409).json({ error: 'Email already in use.' });
    }

    values.push(user.id);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    res.json({ user: safeUser(updated) });
  } catch (err) {
    console.error('[users/PUT]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── DELETE /users/:id (soft-delete via status) ─────────────────────────────
router.delete('/:id', authorize('super_admin', 'tenant_admin'), (req, res) => {
  const db   = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);

  if (!user) return res.status(404).json({ error: 'User not found.' });
  if (req.user.role !== 'super_admin' && user.tenant_id !== req.tenantId) {
    return res.status(403).json({ error: 'Access denied.' });
  }
  if (user.id === req.user.id) {
    return res.status(409).json({ error: 'Cannot deactivate your own account.' });
  }
  if (user.role === 'super_admin' && req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Cannot deactivate a super_admin account.' });
  }

  db.prepare("UPDATE users SET status = 'inactive' WHERE id = ?").run(user.id);
  res.json({ message: `User "${user.name}" deactivated.` });
});

module.exports = router;
