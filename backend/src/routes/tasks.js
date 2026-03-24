'use strict';

/**
 * Tasks routes
 *
 * GET    /tasks          list tasks (filters: status, type, priority, robot_id)
 * POST   /tasks          create task
 * GET    /tasks/stats    task statistics
 * GET    /tasks/:id      task detail
 * PUT    /tasks/:id      update task
 * DELETE /tasks/:id      cancel task
 * POST   /tasks/nlp      parse natural language → task definition
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { authenticate, authorize, tenantIsolation } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, tenantIsolation);

// ── Helpers ────────────────────────────────────────────────────────────────

function parseJson(str, fallback = null) {
  try { return str ? JSON.parse(str) : fallback; } catch { return fallback; }
}

function enrichTask(task) {
  return { ...task, steps: parseJson(task.steps, []) };
}

/**
 * Infers a structured task from a natural language description.
 * In production this would call an LLM with function-calling.
 */
function parseNaturalLanguageTask(text) {
  const t = text.toLowerCase();

  // Determine task type
  let type = 'custom';
  if (/patrol|guard|monitor|watch/.test(t))        type = 'patrol';
  else if (/deliver|bring|carry|transport/.test(t)) type = 'delivery';
  else if (/inspect|check|audit|scan/.test(t))      type = 'inspection';
  else if (/clean|sweep|mop|sanitize/.test(t))      type = 'cleaning';
  else if (/assembl|build|construct|attach/.test(t)) type = 'assembly';
  else if (/go to|navigate|move to|head to/.test(t)) type = 'navigation';

  // Determine priority
  let priority = 'medium';
  if (/urgent|critical|emergency|immediately|asap/.test(t)) priority = 'critical';
  else if (/high priority|important|soon/.test(t))           priority = 'high';
  else if (/low priority|whenever|no rush/.test(t))          priority = 'low';

  // Extract locations (very basic NLP simulation)
  const locationPatterns = [
    /(?:to|from|at|in)\s+(?:the\s+)?([a-zA-Z0-9\s-]+?)(?:\s+and|\s+then|,|$)/g,
    /(?:bay|room|ward|aisle|zone|area|level|floor)\s+([a-zA-Z0-9-]+)/gi,
  ];

  const locations = new Set();
  for (const pattern of locationPatterns) {
    let match;
    while ((match = pattern.exec(t)) !== null) {
      const loc = match[1].trim();
      if (loc.length > 2 && loc.length < 40) locations.add(loc);
    }
  }

  // Build synthetic steps
  const locList = [...locations].slice(0, 5);
  let steps = [];

  if (type === 'delivery') {
    steps = locList.length >= 2
      ? [
          { step: 1, action: 'navigate', target: locList[0], done: false },
          { step: 2, action: 'pick', item: 'cargo', done: false },
          { step: 3, action: 'navigate', target: locList[1], done: false },
          { step: 4, action: 'place', item: 'cargo', done: false },
        ]
      : [
          { step: 1, action: 'navigate', target: locList[0] || 'destination', done: false },
          { step: 2, action: 'deliver', done: false },
        ];
  } else if (type === 'patrol') {
    steps = (locList.length > 0 ? locList : ['checkpoint-1', 'checkpoint-2']).map((loc, i) => ({
      step: i + 1, action: 'navigate', target: loc, done: false,
    }));
  } else if (type === 'inspection') {
    steps = (locList.length > 0 ? locList : ['area-1']).flatMap((loc, i) => [
      { step: i * 2 + 1, action: 'navigate', target: loc, done: false },
      { step: i * 2 + 2, action: 'scan', target: loc, done: false },
    ]);
  } else if (type === 'cleaning') {
    steps = (locList.length > 0 ? locList : ['target-area']).flatMap((loc, i) => [
      { step: i * 2 + 1, action: 'navigate', target: loc, done: false },
      { step: i * 2 + 2, action: 'clean', target: loc, done: false },
    ]);
  } else {
    steps = [
      { step: 1, action: 'execute', description: text, done: false },
    ];
  }

  // Build a friendly name from the text
  const name = text.length > 60 ? text.slice(0, 57) + '...' : text;

  return {
    name,
    type,
    priority,
    steps,
    confidence: locList.length > 0 ? 0.80 : 0.55,
    extracted_locations: locList,
  };
}

// ── GET /tasks/stats — MUST be before /:id ────────────────────────────────
router.get('/stats', (req, res) => {
  const db = getDb();

  const tf = req.user.role !== 'super_admin' ? `WHERE tenant_id = ?` : '';
  const tp = req.user.role !== 'super_admin' ? [req.tenantId] : [];

  const byStatus = db.prepare(`SELECT status, COUNT(*) as count FROM tasks ${tf} GROUP BY status`).all(...tp);
  const byType   = db.prepare(`SELECT type, COUNT(*) as count FROM tasks ${tf} GROUP BY type ORDER BY count DESC`).all(...tp);
  const byPriority = db.prepare(`SELECT priority, COUNT(*) as count FROM tasks ${tf} GROUP BY priority`).all(...tp);

  const avgProgress = db.prepare(
    `SELECT ROUND(AVG(progress), 1) as avg FROM tasks ${tf} AND status IN ('executing','assigned')`.replace('WHERE AND', 'WHERE')
  ).get(...tp);

  res.json({ by_status: byStatus, by_type: byType, by_priority: byPriority, avg_progress: avgProgress?.avg || 0 });
});

// ── POST /tasks/nlp — MUST be before /:id ────────────────────────────────
router.post('/nlp',
  authorize('super_admin', 'tenant_admin', 'fleet_manager', 'operator'),
  (req, res) => {
    const { text, robot_id, create = false } = req.body;
    if (!text) return res.status(400).json({ error: 'text is required.' });

    const parsed = parseNaturalLanguageTask(text);

    if (create) {
      const db = getDb();

      // Validate robot access if provided
      if (robot_id) {
        const robot = db.prepare('SELECT * FROM robots WHERE id = ?').get(robot_id);
        if (!robot) return res.status(404).json({ error: 'Robot not found.' });
        if (req.user.role !== 'super_admin' && robot.tenant_id !== req.tenantId) {
          return res.status(403).json({ error: 'Access denied.' });
        }
      }

      const taskId = uuidv4();
      db.prepare(`
        INSERT INTO tasks (id, robot_id, tenant_id, name, description, type, status, priority, nlp_input, steps, created_by, progress)
        VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?, 0)
      `).run(taskId, robot_id || null, req.tenantId, parsed.name, text,
             parsed.type, parsed.priority, text, JSON.stringify(parsed.steps), req.user.id);

      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
      return res.status(201).json({ parsed, task: enrichTask(task) });
    }

    res.json({ parsed, message: 'Pass create: true to actually create this task.' });
  }
);

// ── GET /tasks ─────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const db = getDb();
  const { status, type, priority, robot_id, limit = 100, offset = 0 } = req.query;

  let query  = 'SELECT * FROM tasks WHERE 1=1';
  const params = [];

  if (req.user.role !== 'super_admin') { query += ' AND tenant_id = ?'; params.push(req.tenantId); }
  if (status)   { query += ' AND status = ?';   params.push(status); }
  if (type)     { query += ' AND type = ?';     params.push(type); }
  if (priority) { query += ' AND priority = ?'; params.push(priority); }
  if (robot_id) { query += ' AND robot_id = ?'; params.push(robot_id); }

  query += ' ORDER BY CASE priority WHEN \'critical\' THEN 0 WHEN \'high\' THEN 1 WHEN \'medium\' THEN 2 ELSE 3 END, assigned_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  const tasks = db.prepare(query).all(...params).map(enrichTask);
  res.json({ tasks });
});

// ── POST /tasks ────────────────────────────────────────────────────────────
router.post('/',
  authorize('super_admin', 'tenant_admin', 'fleet_manager', 'operator'),
  (req, res) => {
    const { robot_id, name, description, type, priority = 'medium', steps, nlp_input } = req.body;

    if (!name || !type) {
      return res.status(400).json({ error: 'name and type are required.' });
    }

    const validTypes = ['patrol', 'delivery', 'inspection', 'cleaning', 'assembly', 'navigation', 'custom'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: `type must be one of: ${validTypes.join(', ')}` });
    }

    const db = getDb();

    if (robot_id) {
      const robot = db.prepare('SELECT * FROM robots WHERE id = ?').get(robot_id);
      if (!robot) return res.status(404).json({ error: 'Robot not found.' });
      if (req.user.role !== 'super_admin' && robot.tenant_id !== req.tenantId) {
        return res.status(403).json({ error: 'Access denied.' });
      }
    }

    const taskId = uuidv4();
    db.prepare(`
      INSERT INTO tasks (id, robot_id, tenant_id, name, description, type, status, priority, nlp_input, steps, created_by, progress)
      VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?, 0)
    `).run(taskId, robot_id || null, req.tenantId, name, description || null, type,
           priority, nlp_input || null, steps ? JSON.stringify(steps) : null, req.user.id);

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    res.status(201).json({ task: enrichTask(task) });
  }
);

// ── GET /tasks/:id ─────────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const db   = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);

  if (!task) return res.status(404).json({ error: 'Task not found.' });
  if (req.user.role !== 'super_admin' && task.tenant_id !== req.tenantId) {
    return res.status(403).json({ error: 'Access denied.' });
  }

  res.json({ task: enrichTask(task) });
});

// ── PUT /tasks/:id ─────────────────────────────────────────────────────────
router.put('/:id',
  authorize('super_admin', 'tenant_admin', 'fleet_manager', 'operator'),
  (req, res) => {
    const db   = getDb();
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);

    if (!task) return res.status(404).json({ error: 'Task not found.' });
    if (req.user.role !== 'super_admin' && task.tenant_id !== req.tenantId) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    if (['completed', 'cancelled'].includes(task.status)) {
      return res.status(409).json({ error: `Cannot update a ${task.status} task.` });
    }

    const allowed  = ['name', 'description', 'status', 'priority', 'robot_id', 'steps', 'progress'];
    const updates  = [];
    const values   = [];

    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        let val = req.body[field];
        if (field === 'steps' && typeof val === 'object') val = JSON.stringify(val);
        values.push(val);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updatable fields provided.' });
    }

    // Set timestamps automatically based on status transitions
    const newStatus = req.body.status;
    if (newStatus === 'assigned' && !task.assigned_at)  { updates.push("assigned_at = datetime('now')"); }
    if (newStatus === 'executing' && !task.started_at)  { updates.push("started_at = datetime('now')"); }
    if (['completed', 'failed', 'cancelled'].includes(newStatus)) {
      updates.push("completed_at = datetime('now')");
    }

    values.push(task.id);
    db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id);
    res.json({ task: enrichTask(updated) });
  }
);

// ── DELETE /tasks/:id (cancel) ─────────────────────────────────────────────
router.delete('/:id',
  authorize('super_admin', 'tenant_admin', 'fleet_manager'),
  (req, res) => {
    const db   = getDb();
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);

    if (!task) return res.status(404).json({ error: 'Task not found.' });
    if (req.user.role !== 'super_admin' && task.tenant_id !== req.tenantId) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    if (task.status === 'completed') {
      return res.status(409).json({ error: 'Cannot cancel a completed task.' });
    }

    db.prepare("UPDATE tasks SET status = 'cancelled', completed_at = datetime('now') WHERE id = ?").run(task.id);
    res.json({ message: `Task "${task.name}" cancelled.` });
  }
);

module.exports = router;
