'use strict';

/**
 * Dashboard routes
 *
 * GET /dashboard/stats     high-level KPIs for the tenant
 * GET /dashboard/activity  recent activity feed
 */

const express = require('express');
const { getDb } = require('../db');
const { authenticate, tenantIsolation } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, tenantIsolation);

// ── GET /dashboard/stats ───────────────────────────────────────────────────
router.get('/stats', (req, res) => {
  const db = getDb();

  const tf  = req.user.role !== 'super_admin' ? `AND tenant_id = '${req.tenantId}'` : '';
  const tfc = req.user.role !== 'super_admin' ? `WHERE tenant_id = '${req.tenantId}'` : '';
  // For joins we need table-aliased tenant filter
  const tfr = req.user.role !== 'super_admin' ? `AND r.tenant_id = '${req.tenantId}'` : '';

  // Robot counts by status
  const robotsByStatus = db.prepare(`
    SELECT status, COUNT(*) as count FROM robots WHERE 1=1 ${tf} GROUP BY status
  `).all();

  const totalRobots  = robotsByStatus.reduce((s, r) => s + r.count, 0);
  const onlineCount  = (robotsByStatus.find(r => r.status === 'online')       || { count: 0 }).count;
  const idleCount    = (robotsByStatus.find(r => r.status === 'idle')         || { count: 0 }).count;
  const errorCount   = (robotsByStatus.find(r => r.status === 'error')        || { count: 0 }).count;
  const maintCount   = (robotsByStatus.find(r => r.status === 'maintenance')  || { count: 0 }).count;
  const offlineCount = (robotsByStatus.find(r => r.status === 'offline')      || { count: 0 }).count;

  // Active tasks (executing + assigned)
  const activeTasks = db.prepare(`
    SELECT COUNT(*) as c FROM tasks WHERE status IN ('executing','assigned') ${tf}
  `).get().c;

  const queuedTasks = db.prepare(`
    SELECT COUNT(*) as c FROM tasks WHERE status = 'queued' ${tf}
  `).get().c;

  // Open alerts by severity
  const openAlerts = db.prepare(`
    SELECT severity, COUNT(*) as count FROM alerts WHERE status = 'open' ${tf} GROUP BY severity
  `).all();

  const totalOpenAlerts    = openAlerts.reduce((s, a) => s + a.count, 0);
  const criticalAlertCount = (openAlerts.find(a => a.severity === 'critical') || { count: 0 }).count;

  // Pending / executing commands
  const pendingCmds = db.prepare(`
    SELECT COUNT(*) as c FROM commands WHERE status IN ('pending','sent','executing') ${tf}
  `).get().c;

  // Fleet average battery (online robots only)
  const avgBattery = db.prepare(`
    SELECT ROUND(AVG(battery_level), 1) as avg FROM robots WHERE status IN ('online','idle') ${tf}
  `).get().avg;

  // Today's completed tasks
  const completedToday = db.prepare(`
    SELECT COUNT(*) as c FROM tasks WHERE status = 'completed' AND DATE(completed_at) = DATE('now') ${tf}
  `).get().c;

  // Today's new alerts
  const alertsToday = db.prepare(`
    SELECT COUNT(*) as c FROM alerts WHERE DATE(created_at) = DATE('now') ${tf}
  `).get().c;

  // Robot health score: (online + idle) / total * 100
  const healthScore = totalRobots > 0
    ? Math.round(((onlineCount + idleCount) / totalRobots) * 100)
    : 0;

  // Low battery robots (< 20%)
  const lowBatteryRobots = db.prepare(`
    SELECT id, name, battery_level, status FROM robots
    WHERE battery_level < 20 ${tf} ORDER BY battery_level ASC
  `).all();

  res.json({
    robots: {
      total:       totalRobots,
      online:      onlineCount,
      idle:        idleCount,
      offline:     offlineCount,
      error:       errorCount,
      maintenance: maintCount,
    },
    tasks: {
      active:           activeTasks,
      queued:           queuedTasks,
      completed_today:  completedToday,
    },
    alerts: {
      open:            totalOpenAlerts,
      critical:        criticalAlertCount,
      by_severity:     openAlerts,
      today:           alertsToday,
    },
    commands: {
      pending: pendingCmds,
    },
    fleet: {
      avg_battery:      avgBattery,
      health_score:     healthScore,
      low_battery_robots: lowBatteryRobots,
    },
  });
});

// ── GET /dashboard/activity ────────────────────────────────────────────────
router.get('/activity', (req, res) => {
  const db    = getDb();
  const limit = parseInt(req.query.limit) || 30;

  const tf  = req.user.role !== 'super_admin' ? `AND tenant_id = '${req.tenantId}'` : '';
  const tfa = req.user.role !== 'super_admin' ? `AND a.tenant_id = '${req.tenantId}'` : '';

  // Combine recent alerts, commands, tasks and audit_logs into a unified feed
  const recentAlerts = db.prepare(`
    SELECT
      'alert'     as activity_type,
      a.id,
      a.created_at as timestamp,
      ('Alert: ' || a.message) as description,
      a.severity   as severity_or_priority,
      a.type       as sub_type,
      r.name       as robot_name,
      a.robot_id
    FROM alerts a
    JOIN robots r ON r.id = a.robot_id
    WHERE 1=1 ${tfa}
    ORDER BY a.created_at DESC LIMIT ?
  `).all(Math.ceil(limit / 3));

  const recentCommands = db.prepare(`
    SELECT
      'command'    as activity_type,
      c.id,
      c.sent_at    as timestamp,
      ('Command: ' || c.type || ' sent to robot') as description,
      c.priority   as severity_or_priority,
      c.type       as sub_type,
      r.name       as robot_name,
      c.robot_id
    FROM commands c
    JOIN robots r ON r.id = c.robot_id
    WHERE 1=1 ${tf.replace('AND tenant_id', 'AND c.tenant_id')}
    ORDER BY c.sent_at DESC LIMIT ?
  `).all(Math.ceil(limit / 3));

  const recentTasks = db.prepare(`
    SELECT
      'task'       as activity_type,
      t.id,
      COALESCE(t.started_at, t.assigned_at, t.completed_at, datetime('now')) as timestamp,
      ('Task: ' || t.name || ' — ' || t.status) as description,
      t.priority   as severity_or_priority,
      t.type       as sub_type,
      r.name       as robot_name,
      t.robot_id
    FROM tasks t
    LEFT JOIN robots r ON r.id = t.robot_id
    WHERE 1=1 ${tf.replace('AND tenant_id', 'AND t.tenant_id')}
    ORDER BY timestamp DESC LIMIT ?
  `).all(Math.ceil(limit / 3));

  // Merge and sort by timestamp desc
  const feed = [...recentAlerts, ...recentCommands, ...recentTasks]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, limit);

  res.json({ activity: feed });
});

module.exports = router;
