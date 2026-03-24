'use strict';

/**
 * Alerts routes
 *
 * GET /alerts              list alerts (filters: severity, status, robot_id, type)
 * GET /alerts/stats        alert statistics
 * GET /alerts/:id          alert detail
 * PUT /alerts/:id/acknowledge
 * PUT /alerts/:id/resolve
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { authenticate, authorize, tenantIsolation } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, tenantIsolation);

// ── GET /alerts/stats — MUST be before /:id ────────────────────────────────
router.get('/stats', (req, res) => {
  const db = getDb();

  const tenantFilter = req.user.role !== 'super_admin'
    ? `WHERE tenant_id = '${req.tenantId}'`
    : '';

  const bySeverity = db.prepare(`
    SELECT severity, COUNT(*) as count
    FROM alerts ${tenantFilter}
    GROUP BY severity
  `).all();

  const byStatus = db.prepare(`
    SELECT status, COUNT(*) as count
    FROM alerts ${tenantFilter}
    GROUP BY status
  `).all();

  const byType = db.prepare(`
    SELECT type, COUNT(*) as count
    FROM alerts ${tenantFilter}
    GROUP BY type ORDER BY count DESC
  `).all();

  const recent = db.prepare(`
    SELECT a.*, r.name as robot_name
    FROM alerts a
    JOIN robots r ON r.id = a.robot_id
    ${tenantFilter.replace('WHERE', 'WHERE a.')}
    ORDER BY a.created_at DESC LIMIT 5
  `).all();

  res.json({ by_severity: bySeverity, by_status: byStatus, by_type: byType, recent });
});

// ── GET /alerts ────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const db = getDb();
  const { severity, status, robot_id, type, limit = 100, offset = 0 } = req.query;

  let query = `
    SELECT a.*, r.name as robot_name
    FROM alerts a
    JOIN robots r ON r.id = a.robot_id
    WHERE 1=1
  `;
  const params = [];

  if (req.user.role !== 'super_admin') {
    query += ' AND a.tenant_id = ?'; params.push(req.tenantId);
  }
  if (severity) { query += ' AND a.severity = ?'; params.push(severity); }
  if (status)   { query += ' AND a.status = ?';   params.push(status); }
  if (robot_id) { query += ' AND a.robot_id = ?'; params.push(robot_id); }
  if (type)     { query += ' AND a.type = ?';     params.push(type); }

  query += ' ORDER BY a.created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  const alerts = db.prepare(query).all(...params);
  res.json({ alerts });
});

// ── GET /alerts/:id ────────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const db    = getDb();
  const alert = db.prepare(`
    SELECT a.*, r.name as robot_name
    FROM alerts a JOIN robots r ON r.id = a.robot_id
    WHERE a.id = ?
  `).get(req.params.id);

  if (!alert) return res.status(404).json({ error: 'Alert not found.' });
  if (req.user.role !== 'super_admin' && alert.tenant_id !== req.tenantId) {
    return res.status(403).json({ error: 'Access denied.' });
  }

  res.json({ alert });
});

// ── PUT /alerts/:id/acknowledge ────────────────────────────────────────────
router.put('/:id/acknowledge',
  authorize('super_admin', 'tenant_admin', 'fleet_manager', 'operator'),
  (req, res) => {
    const db    = getDb();
    const alert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(req.params.id);

    if (!alert) return res.status(404).json({ error: 'Alert not found.' });
    if (req.user.role !== 'super_admin' && alert.tenant_id !== req.tenantId) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    if (alert.status !== 'open') {
      return res.status(409).json({ error: `Alert is already "${alert.status}".` });
    }

    db.prepare(`
      UPDATE alerts SET status = 'acknowledged', acknowledged_by = ? WHERE id = ?
    `).run(req.user.id, alert.id);

    const updated = db.prepare('SELECT * FROM alerts WHERE id = ?').get(alert.id);
    res.json({ alert: updated });
  }
);

// ── PUT /alerts/:id/resolve ────────────────────────────────────────────────
router.put('/:id/resolve',
  authorize('super_admin', 'tenant_admin', 'fleet_manager', 'operator'),
  (req, res) => {
    const db    = getDb();
    const alert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(req.params.id);

    if (!alert) return res.status(404).json({ error: 'Alert not found.' });
    if (req.user.role !== 'super_admin' && alert.tenant_id !== req.tenantId) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    if (alert.status === 'resolved') {
      return res.status(409).json({ error: 'Alert is already resolved.' });
    }

    db.prepare(`
      UPDATE alerts SET status = 'resolved', resolved_at = datetime('now') WHERE id = ?
    `).run(alert.id);

    const updated = db.prepare('SELECT * FROM alerts WHERE id = ?').get(alert.id);
    res.json({ alert: updated });
  }
);

module.exports = router;
