'use strict';

/**
 * Robot Fleet Simulator Service
 *
 * Runs on a 5-second tick to:
 *  1. Generate realistic telemetry for all online/idle robots
 *  2. Randomly trigger alerts (battery_low, temperature_high, etc.)
 *  3. Persist telemetry to the database
 *  4. Emit Socket.IO events: telemetry_update, alert_triggered, robot_status_change
 *  5. Randomly transition robot statuses (online ↔ idle, etc.)
 *  6. Advance pending/sent commands → executing → completed
 *  7. Advance executing tasks (increment progress)
 */

const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');

// Tick interval in milliseconds
const TICK_MS = 5000;

/** Simple clamped random walk around a centre value */
function jitter(current, delta, min, max) {
  const next = current + (Math.random() - 0.5) * delta;
  return Math.max(min, Math.min(max, +next.toFixed(2)));
}

/** Weighted coin flip */
function chance(probability) {
  return Math.random() < probability;
}

/**
 * Holds in-memory simulation state per robot so we can produce
 * smooth telemetry curves rather than completely random values each tick.
 */
const robotState = new Map(); // robotId → { battery, cpu, memory, temp, speed, latency }

function getOrInitState(robot) {
  if (!robotState.has(robot.id)) {
    robotState.set(robot.id, {
      battery:  robot.battery_level ?? 80,
      cpu:      30 + Math.random() * 40,
      memory:   40 + Math.random() * 30,
      temp:     35 + Math.random() * 20,
      speed:    Math.random() * 1.5,
      latency:  15 + Math.random() * 30,
    });
  }
  return robotState.get(robot.id);
}

/**
 * Main simulator tick — called every TICK_MS milliseconds.
 * @param {import('socket.io').Server} io  Socket.IO server instance
 */
function tick(io) {
  const db = getDb();

  // ── 1. Fetch all robots that should receive simulated telemetry ──────────
  const robots = db.prepare(
    "SELECT * FROM robots WHERE status IN ('online', 'idle')"
  ).all();

  for (const robot of robots) {
    const state = getOrInitState(robot);

    // Drain battery slowly (0.05–0.15% per tick → ~1–3% per minute)
    state.battery = Math.max(0, state.battery - (0.05 + Math.random() * 0.10));

    // Random-walk other metrics
    state.cpu     = jitter(state.cpu,     10, 5,  95);
    state.memory  = jitter(state.memory,   5, 20, 90);
    state.temp    = jitter(state.temp,      2, 28, 85);
    state.speed   = robot.status === 'idle'
      ? 0
      : jitter(state.speed, 0.3, 0, 2.5);
    state.latency = jitter(state.latency,  5, 5,  200);

    const jointTemps = JSON.stringify([
      +(state.temp + (Math.random() - 0.5) * 8).toFixed(1),
      +(state.temp + (Math.random() - 0.5) * 8).toFixed(1),
      +(state.temp + (Math.random() - 0.5) * 8).toFixed(1),
      +(state.temp + (Math.random() - 0.5) * 8).toFixed(1),
    ]);

    const errorCodes = JSON.stringify(state.temp > 80 ? ['E_TEMP_HIGH'] : []);

    // ── 2. Persist telemetry record ────────────────────────────────────────
    const telId = uuidv4();
    db.prepare(`
      INSERT INTO telemetry
        (id, robot_id, timestamp, battery, cpu_usage, memory_usage, temperature,
         speed, payload_weight, joint_temps, network_latency, error_codes)
      VALUES (?, ?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      telId, robot.id,
      +state.battery.toFixed(2),
      +state.cpu.toFixed(2),
      +state.memory.toFixed(2),
      +state.temp.toFixed(2),
      +state.speed.toFixed(2),
      +(Math.random() * 15).toFixed(1),
      jointTemps,
      +state.latency.toFixed(2),
      errorCodes
    );

    // Keep battery_level on the robots row in sync
    db.prepare("UPDATE robots SET battery_level = ?, last_seen = datetime('now') WHERE id = ?")
      .run(+state.battery.toFixed(2), robot.id);

    const telPayload = {
      robot_id:       robot.id,
      robot_name:     robot.name,
      tenant_id:      robot.tenant_id,
      timestamp:      new Date().toISOString(),
      battery:        +state.battery.toFixed(2),
      cpu_usage:      +state.cpu.toFixed(2),
      memory_usage:   +state.memory.toFixed(2),
      temperature:    +state.temp.toFixed(2),
      speed:          +state.speed.toFixed(2),
      network_latency:+state.latency.toFixed(2),
      joint_temps:    JSON.parse(jointTemps),
      error_codes:    JSON.parse(errorCodes),
    };

    // ── 3. Emit telemetry via Socket.IO ────────────────────────────────────
    if (io) {
      io.to(`tenant:${robot.tenant_id}`).emit('telemetry_update', telPayload);
      io.to(`robot:${robot.id}`).emit('telemetry_update', telPayload);
    }

    // ── 4. Alert generation ────────────────────────────────────────────────
    generateAlerts(db, io, robot, state);

    // ── 5. Random status transitions ──────────────────────────────────────
    maybeSwitchStatus(db, io, robot, state);
  }

  // ── 6. Advance command lifecycle ─────────────────────────────────────────
  advanceCommands(db, io);

  // ── 7. Advance task progress ──────────────────────────────────────────────
  advanceTasks(db, io);

  // ── 8. Cleanup old telemetry (keep last 1000 records per robot) ──────────
  if (chance(0.05)) { // only 5% chance per tick to reduce write load
    db.prepare(`
      DELETE FROM telemetry WHERE id IN (
        SELECT id FROM telemetry t
        WHERE (SELECT COUNT(*) FROM telemetry t2 WHERE t2.robot_id = t.robot_id AND t2.timestamp >= t.timestamp) > 1000
      )
    `).run();
  }
}

// ── Alert generation ────────────────────────────────────────────────────────

function generateAlerts(db, io, robot, state) {
  const alertsToCreate = [];

  // Battery low (<= 20%) — deduplicate: only create if no open battery_low alert
  if (state.battery <= 20) {
    const existing = db.prepare(`
      SELECT id FROM alerts WHERE robot_id = ? AND type = 'battery_low' AND status = 'open' LIMIT 1
    `).get(robot.id);
    if (!existing) {
      alertsToCreate.push({
        type:     'battery_low',
        severity: state.battery <= 10 ? 'critical' : 'warning',
        message:  `${robot.name} battery critically low at ${state.battery.toFixed(1)}%`,
      });
    }
  }

  // Temperature high (>= 75°C) — deduplicate
  if (state.temp >= 75) {
    const existing = db.prepare(`
      SELECT id FROM alerts WHERE robot_id = ? AND type = 'temperature_high' AND status = 'open' LIMIT 1
    `).get(robot.id);
    if (!existing) {
      alertsToCreate.push({
        type:     'temperature_high',
        severity: state.temp >= 82 ? 'critical' : 'error',
        message:  `${robot.name} temperature ${state.temp.toFixed(1)}°C exceeds safe threshold`,
      });
    }
  }

  // High latency — random, ~1% chance per tick
  if (state.latency > 150 && chance(0.01)) {
    alertsToCreate.push({
      type:     'connectivity_lost',
      severity: 'warning',
      message:  `${robot.name} network latency high (${state.latency.toFixed(0)}ms)`,
    });
  }

  // Random motor fault — 0.2% chance per tick
  if (chance(0.002)) {
    alertsToCreate.push({
      type:     'motor_fault',
      severity: 'error',
      message:  `${robot.name} motor fault detected in joint ${Math.floor(Math.random() * 6) + 1}`,
    });
  }

  for (const alertDef of alertsToCreate) {
    const alertId = uuidv4();
    db.prepare(`
      INSERT INTO alerts (id, robot_id, tenant_id, type, severity, message, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'open', datetime('now'))
    `).run(alertId, robot.id, robot.tenant_id, alertDef.type, alertDef.severity, alertDef.message);

    const alertPayload = {
      id:        alertId,
      robot_id:  robot.id,
      robot_name: robot.name,
      tenant_id: robot.tenant_id,
      ...alertDef,
      status:    'open',
      created_at: new Date().toISOString(),
    };

    if (io) {
      io.to(`tenant:${robot.tenant_id}`).emit('alert_triggered', alertPayload);
      io.to(`robot:${robot.id}`).emit('alert_triggered', alertPayload);
    }
  }
}

// ── Status transitions ──────────────────────────────────────────────────────

function maybeSwitchStatus(db, io, robot, state) {
  let newStatus = null;

  // If battery is critically low, force a charge
  if (state.battery < 5 && robot.status !== 'offline') {
    newStatus = 'offline';
  } else if (robot.status === 'online' && chance(0.015)) {
    // 1.5% chance per tick to go idle
    newStatus = 'idle';
    state.speed = 0;
  } else if (robot.status === 'idle' && chance(0.03)) {
    // 3% chance per tick to go back online
    newStatus = 'online';
  }

  if (newStatus) {
    db.prepare("UPDATE robots SET status = ?, last_seen = datetime('now') WHERE id = ?")
      .run(newStatus, robot.id);

    if (io) {
      io.to(`tenant:${robot.tenant_id}`).emit('robot_status_change', {
        robot_id:   robot.id,
        robot_name: robot.name,
        tenant_id:  robot.tenant_id,
        old_status: robot.status,
        new_status: newStatus,
        timestamp:  new Date().toISOString(),
      });
    }
  }
}

// ── Command advancement ─────────────────────────────────────────────────────

function advanceCommands(db, io) {
  // sent → executing (90% chance per eligible command per tick)
  const sentCmds = db.prepare("SELECT * FROM commands WHERE status = 'sent'").all();
  for (const cmd of sentCmds) {
    if (chance(0.9)) {
      db.prepare("UPDATE commands SET status = 'executing', executed_at = datetime('now') WHERE id = ?")
        .run(cmd.id);
      if (io) {
        io.to(`tenant:${cmd.tenant_id}`).emit('command_status', {
          command_id: cmd.id, robot_id: cmd.robot_id, status: 'executing',
        });
      }
    }
  }

  // executing → completed|failed (80% completed, 20% failed)
  const execCmds = db.prepare("SELECT * FROM commands WHERE status = 'executing'").all();
  for (const cmd of execCmds) {
    if (chance(0.7)) { // 70% chance to resolve per tick
      const success = chance(0.85);
      db.prepare(`
        UPDATE commands
        SET status = ?, completed_at = datetime('now'), result = ?
        WHERE id = ?
      `).run(
        success ? 'completed' : 'failed',
        success
          ? JSON.stringify({ success: true, message: 'Command executed successfully' })
          : JSON.stringify({ success: false, message: 'Execution error — retry recommended' }),
        cmd.id
      );
      if (io) {
        io.to(`tenant:${cmd.tenant_id}`).emit('command_status', {
          command_id: cmd.id,
          robot_id:   cmd.robot_id,
          status:     success ? 'completed' : 'failed',
        });
      }
    }
  }
}

// ── Task advancement ────────────────────────────────────────────────────────

function advanceTasks(db, io) {
  // queued → assigned (give them a robot if available)
  const queuedTasks = db.prepare("SELECT * FROM tasks WHERE status = 'queued'").all();
  for (const task of queuedTasks) {
    if (!task.robot_id || !chance(0.1)) continue;

    db.prepare(`
      UPDATE tasks SET status = 'assigned', assigned_at = datetime('now') WHERE id = ?
    `).run(task.id);
  }

  // assigned → executing
  const assignedTasks = db.prepare("SELECT * FROM tasks WHERE status = 'assigned'").all();
  for (const task of assignedTasks) {
    if (chance(0.3)) {
      db.prepare(`
        UPDATE tasks SET status = 'executing', started_at = datetime('now') WHERE id = ?
      `).run(task.id);
    }
  }

  // executing → advance progress → complete
  const execTasks = db.prepare("SELECT * FROM tasks WHERE status = 'executing' AND progress < 100").all();
  for (const task of execTasks) {
    const increment = 2 + Math.random() * 8; // 2–10% per tick
    const newProgress = Math.min(100, task.progress + increment);

    if (newProgress >= 100) {
      db.prepare(`
        UPDATE tasks SET status = 'completed', progress = 100, completed_at = datetime('now') WHERE id = ?
      `).run(task.id);

      if (io) {
        io.to(`tenant:${task.tenant_id}`).emit('task_completed', {
          task_id:   task.id,
          task_name: task.name,
          robot_id:  task.robot_id,
          tenant_id: task.tenant_id,
          timestamp: new Date().toISOString(),
        });
      }
    } else {
      db.prepare('UPDATE tasks SET progress = ? WHERE id = ?').run(+newProgress.toFixed(1), task.id);

      if (io) {
        io.to(`tenant:${task.tenant_id}`).emit('task_progress', {
          task_id:   task.id,
          robot_id:  task.robot_id,
          tenant_id: task.tenant_id,
          progress:  +newProgress.toFixed(1),
        });
      }
    }
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

let _timer = null;

/**
 * Start the simulator.
 * @param {import('socket.io').Server} io  Socket.IO server instance
 */
function startSimulator(io) {
  if (_timer) {
    console.warn('[Simulator] Already running.');
    return;
  }

  console.log(`[Simulator] Starting — tick every ${TICK_MS / 1000}s`);
  _timer = setInterval(() => {
    try {
      tick(io);
    } catch (err) {
      console.error('[Simulator] Tick error:', err.message);
    }
  }, TICK_MS);

  // Run first tick immediately
  try { tick(io); } catch (err) { console.error('[Simulator] Initial tick error:', err.message); }
}

/**
 * Stop the simulator (useful for graceful shutdown / testing).
 */
function stopSimulator() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
    console.log('[Simulator] Stopped.');
  }
}

module.exports = { startSimulator, stopSimulator };
