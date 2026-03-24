'use strict';

/**
 * Telemetry routes
 *
 * GET  /telemetry/fleet  aggregated fleet-wide telemetry
 * GET  /telemetry/live   current status snapshot of all robots
 * POST /telemetry        ingest a telemetry reading (robot agent endpoint)
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { authenticate, tenantIsolation } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, tenantIsolation);

function parseJson(str, fallback = null) {
  try { return str ? JSON.parse(str) : fallback; } catch { return fallback; }
}

// ── GET /telemetry/fleet ───────────────────────────────────────────────────
router.get('/fleet', (req, res) => {
  const db = getDb();
  const { from, to, robot_id } = req.query;

  // Tenant filter clause
  const tenantClause = req.user.role !== 'super_admin'
    ? `AND r.tenant_id = '${req.tenantId}'`
    : '';

  let timeClause = '';
  const params = [];
  if (from) { timeClause += ' AND t.timestamp >= ?'; params.push(from); }
  if (to)   { timeClause += ' AND t.timestamp <= ?'; params.push(to); }
  if (robot_id) { timeClause += ' AND t.robot_id = ?'; params.push(robot_id); }

  // Aggregated stats per robot
  const perRobot = db.prepare(`
    SELECT
      t.robot_id,
      r.name               as robot_name,
      COUNT(*)             as readings,
      ROUND(AVG(t.battery), 2)       as avg_battery,
      ROUND(AVG(t.cpu_usage), 2)     as avg_cpu,
      ROUND(AVG(t.memory_usage), 2)  as avg_memory,
      ROUND(AVG(t.temperature), 2)   as avg_temperature,
      ROUND(MAX(t.temperature), 2)   as max_temperature,
      ROUND(AVG(t.network_latency), 2) as avg_latency,
      MAX(t.timestamp)              as latest_reading
    FROM telemetry t
    JOIN robots r ON r.id = t.robot_id
    WHERE 1=1 ${tenantClause} ${timeClause}
    GROUP BY t.robot_id
    ORDER BY avg_battery ASC
  `).all(...params);

  // Fleet-wide averages
  const fleetAvg = db.prepare(`
    SELECT
      ROUND(AVG(t.battery), 2)       as avg_battery,
      ROUND(AVG(t.cpu_usage), 2)     as avg_cpu,
      ROUND(AVG(t.memory_usage), 2)  as avg_memory,
      ROUND(AVG(t.temperature), 2)   as avg_temperature,
      ROUND(AVG(t.network_latency), 2) as avg_latency,
      COUNT(*)                       as total_readings
    FROM telemetry t
    JOIN robots r ON r.id = t.robot_id
    WHERE 1=1 ${tenantClause} ${timeClause}
  `).get(...params);

  res.json({ fleet_averages: fleetAvg, per_robot: perRobot });
});

// ── GET /telemetry/live ────────────────────────────────────────────────────
router.get('/live', (req, res) => {
  const db = getDb();

  const tenantClause = req.user.role !== 'super_admin'
    ? `AND r.tenant_id = '${req.tenantId}'`
    : '';

  // Latest telemetry record for each robot using a subquery
  const live = db.prepare(`
    SELECT
      r.id            as robot_id,
      r.name          as robot_name,
      r.type          as robot_type,
      r.status        as robot_status,
      r.battery_level as robot_battery,
      r.location_name,
      r.last_seen,
      t.timestamp     as telemetry_timestamp,
      t.battery,
      t.cpu_usage,
      t.memory_usage,
      t.temperature,
      t.speed,
      t.network_latency,
      t.joint_temps,
      t.error_codes
    FROM robots r
    LEFT JOIN telemetry t ON t.id = (
      SELECT id FROM telemetry
      WHERE robot_id = r.id
      ORDER BY timestamp DESC LIMIT 1
    )
    WHERE 1=1 ${tenantClause}
    ORDER BY r.name
  `).all().map(row => ({
    ...row,
    joint_temps: parseJson(row.joint_temps, []),
    error_codes: parseJson(row.error_codes, []),
  }));

  res.json({ robots: live, timestamp: new Date().toISOString() });
});

// ── POST /telemetry ────────────────────────────────────────────────────────
/**
 * Ingest a telemetry reading from a robot agent.
 * The robot authenticates using the same JWT mechanism.
 * Expected body: { robot_id, battery, cpu_usage, memory_usage, temperature,
 *                  speed, payload_weight, joint_temps, network_latency, error_codes }
 */
router.post('/', (req, res) => {
  const {
    robot_id, battery, cpu_usage, memory_usage, temperature,
    speed, payload_weight, joint_temps, network_latency, error_codes,
  } = req.body;

  if (!robot_id) return res.status(400).json({ error: 'robot_id is required.' });

  const db    = getDb();
  const robot = db.prepare('SELECT * FROM robots WHERE id = ?').get(robot_id);
  if (!robot) return res.status(404).json({ error: 'Robot not found.' });

  if (req.user.role !== 'super_admin' && robot.tenant_id !== req.tenantId) {
    return res.status(403).json({ error: 'Access denied.' });
  }

  const telId = uuidv4();
  db.prepare(`
    INSERT INTO telemetry
      (id, robot_id, timestamp, battery, cpu_usage, memory_usage, temperature,
       speed, payload_weight, joint_temps, network_latency, error_codes)
    VALUES (?, ?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    telId, robot_id,
    battery        ?? null,
    cpu_usage      ?? null,
    memory_usage   ?? null,
    temperature    ?? null,
    speed          ?? null,
    payload_weight ?? null,
    joint_temps  ? JSON.stringify(joint_temps)  : null,
    network_latency ?? null,
    error_codes  ? JSON.stringify(error_codes)  : null
  );

  // Keep battery_level on robots table current
  if (battery !== undefined) {
    db.prepare("UPDATE robots SET battery_level = ?, last_seen = datetime('now') WHERE id = ?")
      .run(battery, robot_id);
  }

  res.status(201).json({ id: telId, message: 'Telemetry recorded.' });
});

module.exports = router;
