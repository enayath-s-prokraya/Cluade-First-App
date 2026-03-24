'use strict';

/**
 * Robots routes — full CRUD + sub-resources
 *
 * GET    /robots                      list robots for tenant (filters: status, type, search)
 * POST   /robots                      register new robot
 * GET    /robots/:id                  robot detail
 * PUT    /robots/:id                  update robot
 * DELETE /robots/:id                  deregister
 * GET    /robots/:id/telemetry        telemetry history (query: from, to, limit)
 * GET    /robots/:id/commands         command history
 * GET    /robots/:id/alerts           robot alerts
 * GET    /robots/:id/stats            aggregated stats
 * POST   /robots/:id/maintenance      schedule maintenance
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { authenticate, authorize, tenantIsolation } = require('../middleware/auth');

const router = express.Router();

// All robot routes require auth + tenant isolation
router.use(authenticate, tenantIsolation);

// ── Helpers ────────────────────────────────────────────────────────────────

function parseJson(str, fallback = null) {
  try { return str ? JSON.parse(str) : fallback; } catch { return fallback; }
}

function enrichRobot(robot) {
  return {
    ...robot,
    metadata: parseJson(robot.metadata, {}),
    tags: robot.tags ? robot.tags.split(',').map(t => t.trim()) : [],
  };
}

function writeAuditLog(db, { tenantId, userId, action, resourceType, resourceId, details, ip }) {
  db.prepare(`
    INSERT INTO audit_logs (id, tenant_id, user_id, action, resource_type, resource_id, details, ip_address, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(uuidv4(), tenantId || null, userId || null, action, resourceType || null, resourceId || null, JSON.stringify(details || {}), ip || null);
}

function requireRobot(db, robotId, tenantId, userRole) {
  const robot = db.prepare('SELECT * FROM robots WHERE id = ?').get(robotId);
  if (!robot) return { error: 'Robot not found.', status: 404 };
  if (userRole !== 'super_admin' && robot.tenant_id !== tenantId) {
    return { error: 'Access denied.', status: 403 };
  }
  return { robot };
}

// ── GET /robots ────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const db = getDb();
  const { status, type, search, limit = 100, offset = 0 } = req.query;

  let query = 'SELECT * FROM robots WHERE 1=1';
  const params = [];

  if (req.user.role !== 'super_admin') {
    query += ' AND tenant_id = ?';
    params.push(req.tenantId);
  }
  if (status) { query += ' AND status = ?'; params.push(status); }
  if (type)   { query += ' AND type = ?';   params.push(type); }
  if (search) {
    query += ' AND (name LIKE ? OR model LIKE ? OR serial_number LIKE ? OR location_name LIKE ?)';
    const term = `%${search}%`;
    params.push(term, term, term, term);
  }

  query += ' ORDER BY registered_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  const robots = db.prepare(query).all(...params);
  const total  = db.prepare(
    `SELECT COUNT(*) as c FROM robots WHERE 1=1${req.user.role !== 'super_admin' ? ' AND tenant_id = ?' : ''}`
  ).get(...(req.user.role !== 'super_admin' ? [req.tenantId] : []));

  res.json({
    robots: robots.map(enrichRobot),
    total:  total.c,
    limit:  parseInt(limit),
    offset: parseInt(offset),
  });
});

// ── POST /robots ───────────────────────────────────────────────────────────
router.post('/', authorize('super_admin', 'tenant_admin', 'fleet_manager'), (req, res) => {
  const { name, type, model, serial_number, location_name, firmware_version, ip_address, tags, metadata } = req.body;

  if (!name || !type || !model || !serial_number) {
    return res.status(400).json({ error: 'name, type, model, serial_number are required.' });
  }

  const validTypes = ['humanoid', 'wheeled', 'drone', 'arm', 'mobile'];
  if (!validTypes.includes(type)) {
    return res.status(400).json({ error: `type must be one of: ${validTypes.join(', ')}` });
  }

  const db = getDb();

  // Respect tenant robot limit
  const tenant = db.prepare('SELECT max_robots FROM tenants WHERE id = ?').get(req.tenantId);
  if (tenant) {
    const count = db.prepare('SELECT COUNT(*) as c FROM robots WHERE tenant_id = ?').get(req.tenantId);
    if (count.c >= tenant.max_robots) {
      return res.status(403).json({ error: `Robot limit reached for your plan (${tenant.max_robots} max).` });
    }
  }

  // Check serial uniqueness
  const dup = db.prepare('SELECT id FROM robots WHERE serial_number = ?').get(serial_number);
  if (dup) return res.status(409).json({ error: 'Serial number already registered.' });

  const robotId = uuidv4();
  db.prepare(`
    INSERT INTO robots
      (id, tenant_id, name, type, model, serial_number, status, battery_level,
       location_name, firmware_version, ip_address, tags, metadata, registered_at)
    VALUES (?, ?, ?, ?, ?, ?, 'offline', 100.0, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    robotId, req.tenantId, name, type, model, serial_number,
    location_name || null, firmware_version || null, ip_address || null,
    Array.isArray(tags) ? tags.join(',') : (tags || null),
    metadata ? JSON.stringify(metadata) : null
  );

  writeAuditLog(db, {
    tenantId: req.tenantId, userId: req.user.id,
    action: 'ROBOT_REGISTERED', resourceType: 'robot', resourceId: robotId,
    details: { name, type, model, serial_number }, ip: req.ip,
  });

  const robot = db.prepare('SELECT * FROM robots WHERE id = ?').get(robotId);
  res.status(201).json({ robot: enrichRobot(robot) });
});

// ── GET /robots/:id ────────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const db = getDb();
  const { robot, error, status } = requireRobot(db, req.params.id, req.tenantId, req.user.role);
  if (error) return res.status(status).json({ error });
  res.json({ robot: enrichRobot(robot) });
});

// ── PUT /robots/:id ────────────────────────────────────────────────────────
router.put('/:id', authorize('super_admin', 'tenant_admin', 'fleet_manager', 'operator'), (req, res) => {
  const db = getDb();
  const { robot, error, status } = requireRobot(db, req.params.id, req.tenantId, req.user.role);
  if (error) return res.status(status).json({ error });

  const allowed  = ['name', 'status', 'location_name', 'location_lat', 'location_lng',
                     'firmware_version', 'ip_address', 'tags', 'battery_level', 'metadata'];
  const updates  = [];
  const values   = [];

  for (const field of allowed) {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = ?`);
      let val = req.body[field];
      if (field === 'tags' && Array.isArray(val)) val = val.join(',');
      if (field === 'metadata' && typeof val === 'object') val = JSON.stringify(val);
      values.push(val);
    }
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No updatable fields provided.' });
  }

  // Update last_seen when status changes to online
  if (req.body.status === 'online') {
    updates.push("last_seen = datetime('now')");
  }

  values.push(robot.id);
  db.prepare(`UPDATE robots SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  writeAuditLog(db, {
    tenantId: req.tenantId, userId: req.user.id,
    action: 'ROBOT_UPDATED', resourceType: 'robot', resourceId: robot.id,
    details: req.body, ip: req.ip,
  });

  const updated = db.prepare('SELECT * FROM robots WHERE id = ?').get(robot.id);
  res.json({ robot: enrichRobot(updated) });
});

// ── DELETE /robots/:id ─────────────────────────────────────────────────────
router.delete('/:id', authorize('super_admin', 'tenant_admin'), (req, res) => {
  const db = getDb();
  const { robot, error, status } = requireRobot(db, req.params.id, req.tenantId, req.user.role);
  if (error) return res.status(status).json({ error });

  db.prepare('DELETE FROM robots WHERE id = ?').run(robot.id);

  writeAuditLog(db, {
    tenantId: req.tenantId, userId: req.user.id,
    action: 'ROBOT_DEREGISTERED', resourceType: 'robot', resourceId: robot.id,
    details: { name: robot.name }, ip: req.ip,
  });

  res.json({ message: `Robot "${robot.name}" deregistered successfully.` });
});

// ── GET /robots/:id/telemetry ──────────────────────────────────────────────
router.get('/:id/telemetry', (req, res) => {
  const db = getDb();
  const { robot, error, status } = requireRobot(db, req.params.id, req.tenantId, req.user.role);
  if (error) return res.status(status).json({ error });

  const { from, to, limit = 100 } = req.query;

  let query = 'SELECT * FROM telemetry WHERE robot_id = ?';
  const params = [robot.id];

  if (from) { query += ' AND timestamp >= ?'; params.push(from); }
  if (to)   { query += ' AND timestamp <= ?'; params.push(to); }

  query += ' ORDER BY timestamp DESC LIMIT ?';
  params.push(parseInt(limit));

  const telemetry = db.prepare(query).all(...params).map(t => ({
    ...t,
    joint_temps: parseJson(t.joint_temps, []),
    error_codes: parseJson(t.error_codes, []),
  }));

  res.json({ robot_id: robot.id, telemetry });
});

// ── GET /robots/:id/commands ───────────────────────────────────────────────
router.get('/:id/commands', (req, res) => {
  const db = getDb();
  const { robot, error, status } = requireRobot(db, req.params.id, req.tenantId, req.user.role);
  if (error) return res.status(status).json({ error });

  const { limit = 50, status: cmdStatus } = req.query;
  let query = 'SELECT * FROM commands WHERE robot_id = ?';
  const params = [robot.id];
  if (cmdStatus) { query += ' AND status = ?'; params.push(cmdStatus); }
  query += ' ORDER BY sent_at DESC LIMIT ?';
  params.push(parseInt(limit));

  const commands = db.prepare(query).all(...params).map(c => ({
    ...c,
    payload: parseJson(c.payload, {}),
    result:  parseJson(c.result, null),
  }));

  res.json({ robot_id: robot.id, commands });
});

// ── GET /robots/:id/alerts ─────────────────────────────────────────────────
router.get('/:id/alerts', (req, res) => {
  const db = getDb();
  const { robot, error, status } = requireRobot(db, req.params.id, req.tenantId, req.user.role);
  if (error) return res.status(status).json({ error });

  const { alertStatus, severity, limit = 50 } = req.query;
  let query = 'SELECT * FROM alerts WHERE robot_id = ?';
  const params = [robot.id];
  if (alertStatus) { query += ' AND status = ?';   params.push(alertStatus); }
  if (severity)    { query += ' AND severity = ?'; params.push(severity); }
  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(parseInt(limit));

  res.json({ robot_id: robot.id, alerts: db.prepare(query).all(...params) });
});

// ── GET /robots/:id/stats ─────────────────────────────────────────────────
router.get('/:id/stats', (req, res) => {
  const db = getDb();
  const { robot, error, status } = requireRobot(db, req.params.id, req.tenantId, req.user.role);
  if (error) return res.status(status).json({ error });

  const telStats = db.prepare(`
    SELECT
      COUNT(*)           as total_readings,
      ROUND(AVG(battery), 2)      as avg_battery,
      ROUND(MIN(battery), 2)      as min_battery,
      ROUND(AVG(cpu_usage), 2)    as avg_cpu,
      ROUND(AVG(memory_usage), 2) as avg_memory,
      ROUND(AVG(temperature), 2)  as avg_temperature,
      ROUND(MAX(temperature), 2)  as max_temperature,
      ROUND(AVG(network_latency), 2) as avg_latency
    FROM telemetry WHERE robot_id = ?
  `).get(robot.id);

  const cmdStats = db.prepare(`
    SELECT status, COUNT(*) as count
    FROM commands WHERE robot_id = ?
    GROUP BY status
  `).all(robot.id);

  const alertStats = db.prepare(`
    SELECT severity, COUNT(*) as count
    FROM alerts WHERE robot_id = ?
    GROUP BY severity
  `).all(robot.id);

  const taskStats = db.prepare(`
    SELECT status, COUNT(*) as count
    FROM tasks WHERE robot_id = ?
    GROUP BY status
  `).all(robot.id);

  const openAlerts = db.prepare("SELECT COUNT(*) as c FROM alerts WHERE robot_id = ? AND status = 'open'").get(robot.id);

  res.json({
    robot_id:        robot.id,
    current_status:  robot.status,
    current_battery: robot.battery_level,
    last_seen:       robot.last_seen,
    telemetry:       telStats,
    commands:        cmdStats,
    alerts:          alertStats,
    tasks:           taskStats,
    open_alerts:     openAlerts.c,
  });
});

// ── POST /robots/:id/maintenance ───────────────────────────────────────────
router.post('/:id/maintenance',
  authorize('super_admin', 'tenant_admin', 'fleet_manager'),
  (req, res) => {
    const db = getDb();
    const { robot, error, status } = requireRobot(db, req.params.id, req.tenantId, req.user.role);
    if (error) return res.status(status).json({ error });

    const { type = 'scheduled', description, scheduled_date, technician, notes } = req.body;

    const validTypes = ['scheduled', 'predictive', 'emergency'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: `type must be one of: ${validTypes.join(', ')}` });
    }

    const maintId = uuidv4();
    db.prepare(`
      INSERT INTO maintenance (id, robot_id, tenant_id, type, description, status, scheduled_date, technician, notes)
      VALUES (?, ?, ?, ?, ?, 'scheduled', ?, ?, ?)
    `).run(maintId, robot.id, req.tenantId, type, description || null, scheduled_date || null, technician || null, notes || null);

    // Optionally move robot to maintenance status
    if (type === 'emergency') {
      db.prepare("UPDATE robots SET status = 'maintenance' WHERE id = ?").run(robot.id);
    }

    const record = db.prepare('SELECT * FROM maintenance WHERE id = ?').get(maintId);
    res.status(201).json({ maintenance: record });
  }
);

module.exports = router;
