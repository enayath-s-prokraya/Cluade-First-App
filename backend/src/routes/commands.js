'use strict';

/**
 * Commands routes
 *
 * POST /commands           send a command to a robot
 * GET  /commands           list commands for tenant (filters: status, type, robot_id)
 * GET  /commands/:id       command detail
 * PUT  /commands/:id/cancel cancel a pending command
 * POST /commands/bulk      send one command to multiple robots
 * POST /commands/nlp       parse natural language → command (AI simulation)
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { authenticate, authorize, tenantIsolation } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, tenantIsolation);

const VALID_COMMAND_TYPES = ['MOVE','STOP','NAVIGATE','PICK','PLACE','CHARGE',
                              'UPDATE_FIRMWARE','RESTART','EMERGENCY_STOP','CUSTOM'];

// ── Helpers ────────────────────────────────────────────────────────────────

function parseJson(str, fallback = null) {
  try { return str ? JSON.parse(str) : fallback; } catch { return fallback; }
}

function enrichCommand(cmd) {
  return { ...cmd, payload: parseJson(cmd.payload, {}), result: parseJson(cmd.result, null) };
}

function verifyRobotAccess(db, robotId, tenantId, userRole) {
  const robot = db.prepare('SELECT * FROM robots WHERE id = ?').get(robotId);
  if (!robot) return { error: 'Robot not found.', status: 404 };
  if (userRole !== 'super_admin' && robot.tenant_id !== tenantId) {
    return { error: 'Access denied.', status: 403 };
  }
  return { robot };
}

/**
 * Simulate sending a command:
 * In a real system this would push to a message queue (MQTT/AMQP).
 * Here we optimistically mark it as "sent" and let the simulator advance it.
 */
function dispatchCommand(db, commandId) {
  db.prepare("UPDATE commands SET status = 'sent' WHERE id = ? AND status = 'pending'").run(commandId);
}

// ── NLP command parser (AI simulation) ────────────────────────────────────
/**
 * Maps natural language phrases to structured command payloads.
 * In production this would call an LLM API (OpenAI, Anthropic, etc.).
 */
function parseNaturalLanguageCommand(text) {
  const t = text.toLowerCase();

  if (/stop|halt|freeze|emergency/.test(t)) {
    return {
      type: t.includes('emergency') ? 'EMERGENCY_STOP' : 'STOP',
      payload: { reason: text },
      priority: t.includes('emergency') ? 'critical' : 'high',
      confidence: 0.95,
    };
  }
  if (/charge|dock|battery/.test(t)) {
    const dockMatch = t.match(/dock[- ]?(\w+)/);
    return {
      type: 'CHARGE',
      payload: { dock_id: dockMatch ? `DOCK-${dockMatch[1].toUpperCase()}` : 'DOCK-01' },
      priority: 'high',
      confidence: 0.90,
    };
  }
  if (/restart|reboot|reset/.test(t)) {
    return {
      type: 'RESTART',
      payload: { safe_mode: /safe/.test(t) },
      priority: 'medium',
      confidence: 0.92,
    };
  }
  if (/pick|grab|lift|take/.test(t)) {
    const itemMatch = t.match(/(?:pick|grab|lift|take)\s+(?:up\s+)?(?:the\s+)?(.+?)(?:\s+from|$)/);
    return {
      type: 'PICK',
      payload: { item: itemMatch ? itemMatch[1].trim() : 'unknown_item', gripper_force: 25 },
      priority: 'medium',
      confidence: itemMatch ? 0.82 : 0.55,
    };
  }
  if (/place|put|drop|set/.test(t)) {
    const locMatch = t.match(/(?:place|put|drop|set)\s+(?:it\s+)?(?:on|at|in)?\s*(?:the\s+)?(.+?)(?:\s+and|$)/);
    return {
      type: 'PLACE',
      payload: { location: locMatch ? locMatch[1].trim() : 'unknown_location' },
      priority: 'medium',
      confidence: locMatch ? 0.80 : 0.55,
    };
  }
  if (/go to|navigate|move to|head to|travel to/.test(t)) {
    const destMatch = t.match(/(?:go to|navigate to|move to|head to|travel to)\s+(.+?)(?:\s+and|$)/);
    const speedMatch = t.match(/(?:speed|at)\s+(\d+(?:\.\d+)?)/);
    return {
      type: 'NAVIGATE',
      payload: {
        destination: destMatch ? destMatch[1].trim() : 'unknown',
        speed: speedMatch ? parseFloat(speedMatch[1]) : 1.0,
      },
      priority: 'medium',
      confidence: destMatch ? 0.88 : 0.50,
    };
  }
  if (/move|walk|forward|backward|left|right/.test(t)) {
    const dirMatch = t.match(/(?:move|walk)\s+(forward|backward|left|right)/);
    const distMatch = t.match(/(\d+(?:\.\d+)?)\s*(?:meter|metre|m\b)/);
    return {
      type: 'MOVE',
      payload: {
        direction: dirMatch ? dirMatch[1] : 'forward',
        distance: distMatch ? parseFloat(distMatch[1]) : 1.0,
      },
      priority: 'low',
      confidence: 0.78,
    };
  }
  if (/update|firmware|upgrade/.test(t)) {
    const versionMatch = t.match(/v?(\d+\.\d+(?:\.\d+)?)/);
    return {
      type: 'UPDATE_FIRMWARE',
      payload: { version: versionMatch ? `v${versionMatch[1]}` : 'latest', rollback: true },
      priority: 'low',
      confidence: 0.85,
    };
  }

  // Fallback to CUSTOM
  return {
    type: 'CUSTOM',
    payload: { raw_input: text, action: 'unknown' },
    priority: 'low',
    confidence: 0.30,
  };
}

// ── POST /commands ─────────────────────────────────────────────────────────
router.post('/',
  authorize('super_admin', 'tenant_admin', 'fleet_manager', 'operator'),
  (req, res) => {
    const { robot_id, type, payload, priority = 'medium' } = req.body;

    if (!robot_id || !type) {
      return res.status(400).json({ error: 'robot_id and type are required.' });
    }
    if (!VALID_COMMAND_TYPES.includes(type)) {
      return res.status(400).json({ error: `type must be one of: ${VALID_COMMAND_TYPES.join(', ')}` });
    }

    const db = getDb();
    const { robot, error, status } = verifyRobotAccess(db, robot_id, req.tenantId, req.user.role);
    if (error) return res.status(status).json({ error });

    // Block commands to maintenance robots (except EMERGENCY_STOP)
    if (robot.status === 'maintenance' && type !== 'EMERGENCY_STOP') {
      return res.status(409).json({ error: 'Cannot send commands to a robot in maintenance mode.' });
    }

    const cmdId = uuidv4();
    db.prepare(`
      INSERT INTO commands (id, robot_id, user_id, tenant_id, type, payload, status, priority, sent_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, datetime('now'))
    `).run(cmdId, robot.id, req.user.id, req.tenantId, type,
           payload ? JSON.stringify(payload) : null, priority);

    dispatchCommand(db, cmdId);

    const cmd = db.prepare('SELECT * FROM commands WHERE id = ?').get(cmdId);
    res.status(201).json({ command: enrichCommand(cmd) });
  }
);

// ── GET /commands ──────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const db = getDb();
  const { status, type, robot_id, limit = 100, offset = 0 } = req.query;

  let query = 'SELECT * FROM commands WHERE 1=1';
  const params = [];

  if (req.user.role !== 'super_admin') {
    query += ' AND tenant_id = ?'; params.push(req.tenantId);
  }
  if (status)   { query += ' AND status = ?';   params.push(status); }
  if (type)     { query += ' AND type = ?';     params.push(type); }
  if (robot_id) { query += ' AND robot_id = ?'; params.push(robot_id); }

  query += ' ORDER BY sent_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  const commands = db.prepare(query).all(...params).map(enrichCommand);
  res.json({ commands });
});

// ── GET /commands/:id ──────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const db  = getDb();
  const cmd = db.prepare('SELECT * FROM commands WHERE id = ?').get(req.params.id);
  if (!cmd) return res.status(404).json({ error: 'Command not found.' });
  if (req.user.role !== 'super_admin' && cmd.tenant_id !== req.tenantId) {
    return res.status(403).json({ error: 'Access denied.' });
  }
  res.json({ command: enrichCommand(cmd) });
});

// ── PUT /commands/:id/cancel ───────────────────────────────────────────────
router.put('/:id/cancel',
  authorize('super_admin', 'tenant_admin', 'fleet_manager', 'operator'),
  (req, res) => {
    const db  = getDb();
    const cmd = db.prepare('SELECT * FROM commands WHERE id = ?').get(req.params.id);
    if (!cmd) return res.status(404).json({ error: 'Command not found.' });
    if (req.user.role !== 'super_admin' && cmd.tenant_id !== req.tenantId) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    if (!['pending', 'sent'].includes(cmd.status)) {
      return res.status(409).json({ error: `Cannot cancel command in "${cmd.status}" state.` });
    }

    db.prepare("UPDATE commands SET status = 'cancelled' WHERE id = ?").run(cmd.id);
    const updated = db.prepare('SELECT * FROM commands WHERE id = ?').get(cmd.id);
    res.json({ command: enrichCommand(updated) });
  }
);

// ── POST /commands/bulk ────────────────────────────────────────────────────
router.post('/bulk',
  authorize('super_admin', 'tenant_admin', 'fleet_manager'),
  (req, res) => {
    const { robot_ids, type, payload, priority = 'medium' } = req.body;

    if (!Array.isArray(robot_ids) || robot_ids.length === 0) {
      return res.status(400).json({ error: 'robot_ids must be a non-empty array.' });
    }
    if (!type || !VALID_COMMAND_TYPES.includes(type)) {
      return res.status(400).json({ error: `type must be one of: ${VALID_COMMAND_TYPES.join(', ')}` });
    }
    if (robot_ids.length > 50) {
      return res.status(400).json({ error: 'Cannot bulk-send to more than 50 robots at once.' });
    }

    const db       = getDb();
    const created  = [];
    const errors   = [];

    const insertCmd = db.prepare(`
      INSERT INTO commands (id, robot_id, user_id, tenant_id, type, payload, status, priority, sent_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, datetime('now'))
    `);

    for (const robotId of robot_ids) {
      const { robot, error } = verifyRobotAccess(db, robotId, req.tenantId, req.user.role);
      if (error) { errors.push({ robot_id: robotId, error }); continue; }

      if (robot.status === 'maintenance' && type !== 'EMERGENCY_STOP') {
        errors.push({ robot_id: robotId, error: 'Robot in maintenance mode.' });
        continue;
      }

      const cmdId = uuidv4();
      insertCmd.run(cmdId, robot.id, req.user.id, req.tenantId, type,
                    payload ? JSON.stringify(payload) : null, priority);
      dispatchCommand(db, cmdId);
      created.push(cmdId);
    }

    res.status(207).json({
      message: `Sent to ${created.length} robot(s), ${errors.length} error(s).`,
      created_count: created.length,
      error_count:   errors.length,
      errors,
    });
  }
);

// ── POST /commands/nlp ─────────────────────────────────────────────────────
router.post('/nlp',
  authorize('super_admin', 'tenant_admin', 'fleet_manager', 'operator'),
  (req, res) => {
    const { text, robot_id } = req.body;
    if (!text) return res.status(400).json({ error: 'text is required.' });

    const parsed = parseNaturalLanguageCommand(text);

    // If robot_id provided, validate access and create the command
    if (robot_id) {
      const db = getDb();
      const { robot, error, status } = verifyRobotAccess(db, robot_id, req.tenantId, req.user.role);
      if (error) return res.status(status).json({ error });

      if (parsed.confidence < 0.5) {
        return res.status(422).json({
          error: 'Could not confidently parse command from input.',
          parsed,
          hint: 'Try being more specific, e.g. "Navigate to Bay A at speed 1.5"',
        });
      }

      const cmdId = uuidv4();
      db.prepare(`
        INSERT INTO commands (id, robot_id, user_id, tenant_id, type, payload, status, priority, sent_at)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, datetime('now'))
      `).run(cmdId, robot.id, req.user.id, req.tenantId,
             parsed.type, JSON.stringify(parsed.payload), parsed.priority);

      dispatchCommand(db, cmdId);

      const cmd = db.prepare('SELECT * FROM commands WHERE id = ?').get(cmdId);
      return res.status(201).json({
        parsed,
        command: enrichCommand(cmd),
      });
    }

    // Just return the parsed result without creating a command
    res.json({ parsed, message: 'Provide robot_id to execute the command.' });
  }
);

module.exports = router;
