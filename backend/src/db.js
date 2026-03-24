'use strict';

/**
 * Database module for HCCP
 * Uses better-sqlite3 for synchronous SQLite access.
 * Exports: db instance, getDb(), runMigrations(), seedData()
 */

require('dotenv').config();
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const DB_PATH = process.env.DB_PATH || './hccp.db';
const resolvedPath = path.resolve(DB_PATH);

let _db = null;

/**
 * Returns the singleton database instance.
 * Creates it on first call.
 */
function getDb() {
  if (!_db) {
    _db = new Database(resolvedPath);
    // Enable WAL mode for better concurrent read performance
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
  }
  return _db;
}

/**
 * Creates all tables if they don't already exist.
 */
function runMigrations() {
  const db = getDb();

  db.exec(`
    -- Tenants: top-level organizations using the platform
    CREATE TABLE IF NOT EXISTS tenants (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      plan         TEXT NOT NULL CHECK(plan IN ('free','starter','professional','enterprise')),
      status       TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')),
      max_robots   INTEGER NOT NULL DEFAULT 10,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Users: people who log into the platform
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      tenant_id     TEXT REFERENCES tenants(id) ON DELETE CASCADE,
      email         TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name          TEXT NOT NULL,
      role          TEXT NOT NULL CHECK(role IN ('super_admin','tenant_admin','fleet_manager','operator','viewer')),
      status        TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','suspended')),
      last_login    TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Robots: physical robot units registered to tenants
    CREATE TABLE IF NOT EXISTS robots (
      id               TEXT PRIMARY KEY,
      tenant_id        TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name             TEXT NOT NULL,
      type             TEXT NOT NULL CHECK(type IN ('humanoid','wheeled','drone','arm','mobile')),
      model            TEXT NOT NULL,
      serial_number    TEXT NOT NULL UNIQUE,
      status           TEXT NOT NULL DEFAULT 'offline' CHECK(status IN ('online','offline','maintenance','error','idle')),
      battery_level    REAL NOT NULL DEFAULT 100.0,
      location_lat     REAL,
      location_lng     REAL,
      location_name    TEXT,
      firmware_version TEXT,
      ip_address       TEXT,
      registered_at    TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen        TEXT,
      tags             TEXT,        -- comma-separated tags
      metadata         TEXT         -- JSON blob for extra fields
    );

    -- Telemetry: time-series sensor readings from robots
    CREATE TABLE IF NOT EXISTS telemetry (
      id              TEXT PRIMARY KEY,
      robot_id        TEXT NOT NULL REFERENCES robots(id) ON DELETE CASCADE,
      timestamp       TEXT NOT NULL DEFAULT (datetime('now')),
      battery         REAL,
      cpu_usage       REAL,
      memory_usage    REAL,
      temperature     REAL,
      speed           REAL,
      payload_weight  REAL,
      joint_temps     TEXT,  -- JSON array
      network_latency REAL,
      error_codes     TEXT   -- JSON array
    );

    -- Commands: instructions sent to robots
    CREATE TABLE IF NOT EXISTS commands (
      id           TEXT PRIMARY KEY,
      robot_id     TEXT NOT NULL REFERENCES robots(id) ON DELETE CASCADE,
      user_id      TEXT REFERENCES users(id),
      tenant_id    TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      type         TEXT NOT NULL CHECK(type IN ('MOVE','STOP','NAVIGATE','PICK','PLACE','CHARGE','UPDATE_FIRMWARE','RESTART','EMERGENCY_STOP','CUSTOM')),
      payload      TEXT,   -- JSON
      status       TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','executing','completed','failed','cancelled')),
      priority     TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high','critical')),
      sent_at      TEXT NOT NULL DEFAULT (datetime('now')),
      executed_at  TEXT,
      completed_at TEXT,
      result       TEXT,   -- JSON
      error_message TEXT
    );

    -- Alerts: system-generated notifications about robot health/events
    CREATE TABLE IF NOT EXISTS alerts (
      id              TEXT PRIMARY KEY,
      robot_id        TEXT NOT NULL REFERENCES robots(id) ON DELETE CASCADE,
      tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      type            TEXT NOT NULL CHECK(type IN ('battery_low','temperature_high','connectivity_lost','motor_fault','emergency','maintenance_due','security_breach','task_failed')),
      severity        TEXT NOT NULL CHECK(severity IN ('info','warning','error','critical')),
      message         TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','acknowledged','resolved')),
      acknowledged_by TEXT REFERENCES users(id),
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at     TEXT
    );

    -- Tasks: higher-level work assignments for robots
    CREATE TABLE IF NOT EXISTS tasks (
      id           TEXT PRIMARY KEY,
      robot_id     TEXT REFERENCES robots(id) ON DELETE SET NULL,
      tenant_id    TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name         TEXT NOT NULL,
      description  TEXT,
      type         TEXT NOT NULL CHECK(type IN ('patrol','delivery','inspection','cleaning','assembly','navigation','custom')),
      status       TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','assigned','executing','completed','failed','cancelled')),
      priority     TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high','critical')),
      nlp_input    TEXT,
      steps        TEXT,   -- JSON array
      created_by   TEXT REFERENCES users(id),
      assigned_at  TEXT,
      started_at   TEXT,
      completed_at TEXT,
      progress     REAL DEFAULT 0
    );

    -- Maintenance: scheduled and completed maintenance records
    CREATE TABLE IF NOT EXISTS maintenance (
      id             TEXT PRIMARY KEY,
      robot_id       TEXT NOT NULL REFERENCES robots(id) ON DELETE CASCADE,
      tenant_id      TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      type           TEXT NOT NULL CHECK(type IN ('scheduled','predictive','emergency')),
      description    TEXT,
      status         TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','in_progress','completed')),
      scheduled_date TEXT,
      completed_date TEXT,
      technician     TEXT,
      notes          TEXT
    );

    -- Audit logs: immutable record of all significant actions
    CREATE TABLE IF NOT EXISTS audit_logs (
      id            TEXT PRIMARY KEY,
      tenant_id     TEXT,
      user_id       TEXT,
      action        TEXT NOT NULL,
      resource_type TEXT,
      resource_id   TEXT,
      details       TEXT,  -- JSON
      ip_address    TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Indexes for common query patterns
    CREATE INDEX IF NOT EXISTS idx_robots_tenant      ON robots(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_robots_status      ON robots(status);
    CREATE INDEX IF NOT EXISTS idx_telemetry_robot    ON telemetry(robot_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_commands_robot     ON commands(robot_id);
    CREATE INDEX IF NOT EXISTS idx_commands_tenant    ON commands(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_alerts_tenant      ON alerts(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_alerts_status      ON alerts(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_tenant       ON tasks(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_audit_tenant       ON audit_logs(tenant_id, created_at);
  `);

  console.log('[DB] Migrations complete.');
}

/**
 * Inserts demo seed data. Safe to call multiple times — checks for existing
 * records before inserting to avoid duplicates.
 */
function seedData() {
  const db = getDb();

  // Check if already seeded
  const existing = db.prepare('SELECT COUNT(*) as c FROM tenants').get();
  if (existing.c > 0) {
    console.log('[DB] Seed data already present — skipping.');
    return;
  }

  const passwordHash = bcrypt.hashSync('password123', 10);
  const now = new Date().toISOString();

  // ── Tenants ────────────────────────────────────────────────────────────────
  const tenant1Id = uuidv4();
  const tenant2Id = uuidv4();

  const insertTenant = db.prepare(`
    INSERT INTO tenants (id, name, plan, status, max_robots, created_at)
    VALUES (?, ?, ?, 'active', ?, ?)
  `);

  insertTenant.run(tenant1Id, 'WarehouseBot Corp', 'professional', 50, now);
  insertTenant.run(tenant2Id, 'MedRobotics Inc',  'enterprise',   200, now);

  // ── Users ──────────────────────────────────────────────────────────────────
  const superAdminId   = uuidv4();
  const tenantAdmin1Id = uuidv4();
  const operator1Id    = uuidv4();

  const insertUser = db.prepare(`
    INSERT INTO users (id, tenant_id, email, password_hash, name, role, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'active', ?)
  `);

  // Platform-level super admin (no tenant)
  insertUser.run(superAdminId,   null,      'admin@hccp.io',              passwordHash, 'HCCP Admin',    'super_admin',   now);
  insertUser.run(tenantAdmin1Id, tenant1Id, 'admin@warehousebot.com',     passwordHash, 'Warehouse Admin','tenant_admin', now);
  insertUser.run(operator1Id,    tenant1Id, 'operator@warehousebot.com',  passwordHash, 'Floor Operator', 'operator',    now);

  // ── Robots ─────────────────────────────────────────────────────────────────
  const robotIds = Array.from({ length: 8 }, () => uuidv4());

  const insertRobot = db.prepare(`
    INSERT INTO robots
      (id, tenant_id, name, type, model, serial_number, status,
       battery_level, location_lat, location_lng, location_name,
       firmware_version, ip_address, registered_at, last_seen, tags, metadata)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);

  const robots = [
    // WarehouseBot Corp robots (tenant1)
    {
      id: robotIds[0], tenant_id: tenant1Id,
      name: 'Atlas-01', type: 'humanoid', model: 'Boston Dynamics Atlas', serial: 'BD-ATL-001',
      status: 'online', battery: 87.5, lat: 37.7749, lng: -122.4194, loc: 'Warehouse Bay A',
      fw: 'v4.2.1', ip: '10.0.1.101', tags: 'heavy-lift,bay-a', meta: JSON.stringify({ load_capacity: 50, height: 1.8 })
    },
    {
      id: robotIds[1], tenant_id: tenant1Id,
      name: 'Atlas-02', type: 'humanoid', model: 'Boston Dynamics Atlas', serial: 'BD-ATL-002',
      status: 'idle', battery: 62.0, lat: 37.7750, lng: -122.4195, loc: 'Warehouse Bay B',
      fw: 'v4.2.1', ip: '10.0.1.102', tags: 'heavy-lift,bay-b', meta: JSON.stringify({ load_capacity: 50, height: 1.8 })
    },
    {
      id: robotIds[2], tenant_id: tenant1Id,
      name: 'Carrier-01', type: 'wheeled', model: 'Fetch Robotics Freight500', serial: 'FR-F500-001',
      status: 'online', battery: 94.0, lat: 37.7751, lng: -122.4196, loc: 'Aisle 3',
      fw: 'v2.8.0', ip: '10.0.1.103', tags: 'carrier,aisle-3', meta: JSON.stringify({ payload_kg: 500, speed_ms: 1.5 })
    },
    {
      id: robotIds[3], tenant_id: tenant1Id,
      name: 'Arm-Station-01', type: 'arm', model: 'Universal Robots UR10e', serial: 'UR-UR10-001',
      status: 'maintenance', battery: 100.0, lat: 37.7752, lng: -122.4197, loc: 'Assembly Line 1',
      fw: 'v5.11.4', ip: '10.0.1.104', tags: 'assembly,line-1', meta: JSON.stringify({ reach_mm: 1300, payload_kg: 10 })
    },
    {
      id: robotIds[4], tenant_id: tenant1Id,
      name: 'Scout-Drone-01', type: 'drone', model: 'Skydio X2', serial: 'SKY-X2-001',
      status: 'online', battery: 45.0, lat: 37.7753, lng: -122.4198, loc: 'Roof Level',
      fw: 'v3.1.2', ip: '10.0.1.105', tags: 'surveillance,aerial', meta: JSON.stringify({ flight_time_min: 35, camera: '4K' })
    },
    // MedRobotics Inc robots (tenant2)
    {
      id: robotIds[5], tenant_id: tenant2Id,
      name: 'MedBot-Alpha', type: 'humanoid', model: 'Agility Robotics Digit', serial: 'AR-DGT-001',
      status: 'online', battery: 78.0, lat: 40.7128, lng: -74.0060, loc: 'OR Suite 3',
      fw: 'v1.9.3', ip: '10.0.2.101', tags: 'surgery-assist,or-3', meta: JSON.stringify({ sterile: true, precision_mm: 0.1 })
    },
    {
      id: robotIds[6], tenant_id: tenant2Id,
      name: 'MedBot-Beta', type: 'mobile', model: 'Aethon TUG', serial: 'AET-TUG-001',
      status: 'online', battery: 91.0, lat: 40.7130, lng: -74.0062, loc: 'Corridor B',
      fw: 'v6.2.0', ip: '10.0.2.102', tags: 'transport,corridor-b', meta: JSON.stringify({ capacity_kg: 450, obstacle_avoidance: true })
    },
    {
      id: robotIds[7], tenant_id: tenant2Id,
      name: 'InspectBot-01', type: 'wheeled', model: 'Boston Dynamics Spot', serial: 'BD-SPOT-001',
      status: 'error', battery: 18.0, lat: 40.7132, lng: -74.0064, loc: 'Lab Wing C',
      fw: 'v3.3.0', ip: '10.0.2.103', tags: 'inspection,lab-c', meta: JSON.stringify({ sensors: ['lidar','thermal','rgb'], weight_kg: 32 })
    },
  ];

  for (const r of robots) {
    insertRobot.run(
      r.id, r.tenant_id, r.name, r.type, r.model, r.serial, r.status,
      r.battery, r.lat, r.lng, r.loc, r.fw, r.ip, now, now, r.tags, r.meta
    );
  }

  // ── Telemetry (50+ records) ────────────────────────────────────────────────
  const insertTelemetry = db.prepare(`
    INSERT INTO telemetry
      (id, robot_id, timestamp, battery, cpu_usage, memory_usage,
       temperature, speed, payload_weight, joint_temps, network_latency, error_codes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `);

  const onlineRobotIds = [robotIds[0], robotIds[1], robotIds[2], robotIds[4], robotIds[5], robotIds[6]];

  for (let i = 0; i < 56; i++) {
    const rid = onlineRobotIds[i % onlineRobotIds.length];
    const ts = new Date(Date.now() - (56 - i) * 5000).toISOString();
    const jointTemps = JSON.stringify([
      +(32 + Math.random() * 20).toFixed(1),
      +(32 + Math.random() * 20).toFixed(1),
      +(32 + Math.random() * 20).toFixed(1),
      +(32 + Math.random() * 20).toFixed(1),
    ]);

    insertTelemetry.run(
      uuidv4(), rid, ts,
      +(60 + Math.random() * 35).toFixed(1),   // battery 60–95%
      +(20 + Math.random() * 60).toFixed(1),   // cpu 20–80%
      +(30 + Math.random() * 50).toFixed(1),   // memory 30–80%
      +(35 + Math.random() * 30).toFixed(1),   // temp 35–65°C
      +(Math.random() * 2).toFixed(2),          // speed 0–2 m/s
      +(Math.random() * 20).toFixed(1),         // payload 0–20 kg
      jointTemps,
      +(10 + Math.random() * 40).toFixed(1),   // latency 10–50 ms
      JSON.stringify([])
    );
  }

  // ── Alerts (12 records) ────────────────────────────────────────────────────
  const insertAlert = db.prepare(`
    INSERT INTO alerts (id, robot_id, tenant_id, type, severity, message, status, created_at)
    VALUES (?,?,?,?,?,?,?,?)
  `);

  const alertDefs = [
    [robotIds[7], tenant2Id, 'battery_low',        'critical', 'InspectBot-01 battery critically low at 18%',        'open'],
    [robotIds[4], tenant1Id, 'battery_low',        'warning',  'Scout-Drone-01 battery below 50% — return to dock',  'open'],
    [robotIds[3], tenant1Id, 'maintenance_due',    'info',     'Arm-Station-01 scheduled maintenance in progress',   'acknowledged'],
    [robotIds[0], tenant1Id, 'temperature_high',   'warning',  'Atlas-01 joint temperature reached 72°C',            'open'],
    [robotIds[7], tenant2Id, 'connectivity_lost',  'error',    'InspectBot-01 lost network connection',               'open'],
    [robotIds[5], tenant2Id, 'motor_fault',        'error',    'MedBot-Alpha left actuator fault detected',           'open'],
    [robotIds[1], tenant1Id, 'task_failed',        'warning',  'Atlas-02 pick-and-place task failed at step 3',      'resolved'],
    [robotIds[2], tenant1Id, 'temperature_high',   'info',     'Carrier-01 motor temperature slightly elevated',     'resolved'],
    [robotIds[6], tenant2Id, 'maintenance_due',    'info',     'MedBot-Beta 500-hour service due in 10 hours',       'open'],
    [robotIds[0], tenant1Id, 'security_breach',    'critical', 'Atlas-01 unauthorized API call detected',            'acknowledged'],
    [robotIds[5], tenant2Id, 'emergency',          'critical', 'MedBot-Alpha emergency stop triggered in OR Suite 3','open'],
    [robotIds[2], tenant1Id, 'connectivity_lost',  'warning',  'Carrier-01 intermittent Wi-Fi packet loss > 10%',   'resolved'],
  ];

  for (const [rid, tid, type, sev, msg, status] of alertDefs) {
    const ts = new Date(Date.now() - Math.random() * 3600000).toISOString();
    insertAlert.run(uuidv4(), rid, tid, type, sev, msg, status, ts);
  }

  // ── Commands (12 records) ─────────────────────────────────────────────────
  const insertCommand = db.prepare(`
    INSERT INTO commands
      (id, robot_id, user_id, tenant_id, type, payload, status, priority, sent_at)
    VALUES (?,?,?,?,?,?,?,?,?)
  `);

  const cmdDefs = [
    [robotIds[0], operator1Id, tenant1Id, 'NAVIGATE', JSON.stringify({ destination: 'Bay C', speed: 1.0 }),           'completed', 'medium'],
    [robotIds[0], operator1Id, tenant1Id, 'PICK',     JSON.stringify({ item: 'Box-A-431', gripper_force: 30 }),        'completed', 'high'],
    [robotIds[1], operator1Id, tenant1Id, 'MOVE',     JSON.stringify({ direction: 'forward', distance: 5 }),           'executing', 'medium'],
    [robotIds[2], operator1Id, tenant1Id, 'NAVIGATE', JSON.stringify({ destination: 'Aisle 5', speed: 1.5 }),          'sent',      'medium'],
    [robotIds[4], operator1Id, tenant1Id, 'NAVIGATE', JSON.stringify({ altitude: 10, waypoints: [[37.77, -122.41]] }), 'pending',   'high'],
    [robotIds[4], operator1Id, tenant1Id, 'CHARGE',   JSON.stringify({ dock_id: 'DOCK-01' }),                          'pending',   'critical'],
    [robotIds[3], tenantAdmin1Id, tenant1Id, 'UPDATE_FIRMWARE', JSON.stringify({ version: 'v5.12.0', rollback: true }),'pending',   'low'],
    [robotIds[5], tenantAdmin1Id, tenant2Id, 'EMERGENCY_STOP', JSON.stringify({ reason: 'Staff triggered' }),          'completed', 'critical'],
    [robotIds[5], tenantAdmin1Id, tenant2Id, 'RESTART', JSON.stringify({ safe_mode: true }),                           'completed', 'high'],
    [robotIds[6], tenantAdmin1Id, tenant2Id, 'NAVIGATE', JSON.stringify({ destination: 'Pharmacy', route: 'B' }),      'executing', 'medium'],
    [robotIds[7], tenantAdmin1Id, tenant2Id, 'STOP',   JSON.stringify({}),                                             'completed', 'critical'],
    [robotIds[2], operator1Id, tenant1Id, 'CUSTOM',   JSON.stringify({ action: 'scan_inventory', aisle: 3 }),          'failed',    'low'],
  ];

  for (const [rid, uid, tid, type, payload, status, priority] of cmdDefs) {
    const ts = new Date(Date.now() - Math.random() * 7200000).toISOString();
    insertCommand.run(uuidv4(), rid, uid, tid, type, payload, status, priority, ts);
  }

  // ── Tasks (10 records) ────────────────────────────────────────────────────
  const insertTask = db.prepare(`
    INSERT INTO tasks
      (id, robot_id, tenant_id, name, description, type, status, priority,
       nlp_input, steps, created_by, progress)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `);

  const taskDefs = [
    {
      rid: robotIds[0], tid: tenant1Id,
      name: 'Pallet Transfer Bay A→C', desc: 'Move 10 pallets from Bay A to Bay C',
      type: 'delivery', status: 'executing', priority: 'high', progress: 60,
      nlp: 'Move all pallets from bay A to bay C',
      steps: JSON.stringify([
        { step: 1, action: 'navigate', target: 'Bay A', done: true },
        { step: 2, action: 'pick', item: 'pallet', done: true },
        { step: 3, action: 'navigate', target: 'Bay C', done: false },
        { step: 4, action: 'place', item: 'pallet', done: false },
      ]),
      uid: operator1Id,
    },
    {
      rid: robotIds[2], tid: tenant1Id,
      name: 'Inventory Scan Aisle 3–5', desc: 'Scan all items in aisles 3 through 5',
      type: 'inspection', status: 'queued', priority: 'medium', progress: 0,
      nlp: 'Scan inventory in aisles 3, 4, and 5',
      steps: JSON.stringify([
        { step: 1, action: 'navigate', target: 'Aisle 3', done: false },
        { step: 2, action: 'scan', target: 'all_items', done: false },
        { step: 3, action: 'navigate', target: 'Aisle 4', done: false },
        { step: 4, action: 'scan', target: 'all_items', done: false },
        { step: 5, action: 'navigate', target: 'Aisle 5', done: false },
        { step: 6, action: 'scan', target: 'all_items', done: false },
      ]),
      uid: tenantAdmin1Id,
    },
    {
      rid: robotIds[1], tid: tenant1Id,
      name: 'Night Security Patrol', desc: 'Patrol perimeter after hours',
      type: 'patrol', status: 'queued', priority: 'low', progress: 0,
      nlp: 'Do a full warehouse perimeter patrol tonight',
      steps: JSON.stringify([
        { step: 1, action: 'navigate', target: 'checkpoint-1', done: false },
        { step: 2, action: 'navigate', target: 'checkpoint-2', done: false },
        { step: 3, action: 'navigate', target: 'checkpoint-3', done: false },
        { step: 4, action: 'navigate', target: 'checkpoint-4', done: false },
      ]),
      uid: operator1Id,
    },
    {
      rid: robotIds[4], tid: tenant1Id,
      name: 'Aerial Roof Inspection', desc: 'Drone inspection of loading dock roof',
      type: 'inspection', status: 'completed', priority: 'medium', progress: 100,
      nlp: 'Inspect the roof above the loading docks',
      steps: JSON.stringify([
        { step: 1, action: 'takeoff', altitude: 10, done: true },
        { step: 2, action: 'survey', target: 'loading_dock_roof', done: true },
        { step: 3, action: 'land', target: 'home_pad', done: true },
      ]),
      uid: tenantAdmin1Id,
    },
    {
      rid: robotIds[5], tid: tenant2Id,
      name: 'OR Suite Sterilization Check', desc: 'Inspect OR Suite 3 for compliance',
      type: 'inspection', status: 'executing', priority: 'critical', progress: 40,
      nlp: 'Check OR Suite 3 sterilization levels',
      steps: JSON.stringify([
        { step: 1, action: 'navigate', target: 'OR Suite 3', done: true },
        { step: 2, action: 'scan', target: 'surfaces', done: false },
        { step: 3, action: 'report', done: false },
      ]),
      uid: tenantAdmin1Id,
    },
    {
      rid: robotIds[6], tid: tenant2Id,
      name: 'Medication Delivery Round 2', desc: 'Deliver meds to wards B1–B4',
      type: 'delivery', status: 'executing', priority: 'high', progress: 75,
      nlp: 'Deliver medications to all B-wing wards',
      steps: JSON.stringify([
        { step: 1, action: 'navigate', target: 'Pharmacy', done: true },
        { step: 2, action: 'load', item: 'medications', done: true },
        { step: 3, action: 'navigate', target: 'Ward B1', done: true },
        { step: 4, action: 'deliver', ward: 'B1', done: false },
        { step: 5, action: 'navigate', target: 'Ward B2', done: false },
      ]),
      uid: tenantAdmin1Id,
    },
    {
      rid: robotIds[7], tid: tenant2Id,
      name: 'Lab Wing C Equipment Audit', desc: 'Audit all equipment in Lab Wing C',
      type: 'inspection', status: 'failed', priority: 'medium', progress: 20,
      nlp: 'Audit Lab Wing C equipment',
      steps: JSON.stringify([
        { step: 1, action: 'navigate', target: 'Lab Wing C', done: true },
        { step: 2, action: 'scan', target: 'equipment', done: false },
      ]),
      uid: tenantAdmin1Id,
    },
    {
      rid: robotIds[0], tid: tenant1Id,
      name: 'Assembly Line Assist', desc: 'Assist arm station with overflow assembly',
      type: 'assembly', status: 'queued', priority: 'medium', progress: 0,
      nlp: 'Help assembly line 1 with box packing',
      steps: JSON.stringify([
        { step: 1, action: 'navigate', target: 'Assembly Line 1', done: false },
        { step: 2, action: 'pick', item: 'components', done: false },
        { step: 3, action: 'assemble', done: false },
        { step: 4, action: 'place', item: 'finished_unit', done: false },
      ]),
      uid: operator1Id,
    },
    {
      rid: robotIds[2], tid: tenant1Id,
      name: 'Floor Cleaning Aisle 1–2', desc: 'Clean floor in aisles 1 and 2',
      type: 'cleaning', status: 'completed', priority: 'low', progress: 100,
      nlp: 'Clean aisles 1 and 2',
      steps: JSON.stringify([
        { step: 1, action: 'navigate', target: 'Aisle 1 start', done: true },
        { step: 2, action: 'clean', target: 'Aisle 1', done: true },
        { step: 3, action: 'navigate', target: 'Aisle 2 start', done: true },
        { step: 4, action: 'clean', target: 'Aisle 2', done: true },
      ]),
      uid: operator1Id,
    },
    {
      rid: robotIds[5], tid: tenant2Id,
      name: 'Patient Vitals Monitoring Round', desc: 'Visit rooms 201–210 for vitals check',
      type: 'patrol', status: 'queued', priority: 'high', progress: 0,
      nlp: 'Do a vitals check on patients in rooms 201 to 210',
      steps: JSON.stringify(
        Array.from({ length: 10 }, (_, i) => ({
          step: i + 1,
          action: 'navigate_and_scan',
          target: `Room ${201 + i}`,
          done: false,
        }))
      ),
      uid: tenantAdmin1Id,
    },
  ];

  for (const t of taskDefs) {
    insertTask.run(
      uuidv4(), t.rid, t.tid, t.name, t.desc, t.type, t.status,
      t.priority, t.nlp, t.steps, t.uid, t.progress
    );
  }

  // ── Maintenance records ────────────────────────────────────────────────────
  const insertMaint = db.prepare(`
    INSERT INTO maintenance
      (id, robot_id, tenant_id, type, description, status,
       scheduled_date, completed_date, technician, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `);

  insertMaint.run(uuidv4(), robotIds[3], tenant1Id, 'scheduled',
    'Quarterly joint lubrication and calibration', 'in_progress',
    new Date(Date.now() - 86400000).toISOString(), null,
    'Jake Torres', 'Replacing shoulder actuator seal');

  insertMaint.run(uuidv4(), robotIds[7], tenant2Id, 'emergency',
    'Battery cell replacement after deep discharge', 'scheduled',
    new Date(Date.now() + 3600000).toISOString(), null,
    'Priya Nair', 'Priority — unit currently error state');

  insertMaint.run(uuidv4(), robotIds[2], tenant1Id, 'predictive',
    'Wheel bearing wear detected by vibration sensor', 'scheduled',
    new Date(Date.now() + 172800000).toISOString(), null,
    'Alex Chen', 'ML model flagged bearing degradation at 73%');

  console.log('[DB] Seed data inserted successfully.');
}

// ── Module exports ─────────────────────────────────────────────────────────
module.exports = { getDb, runMigrations, seedData };

// Run standalone: `node src/db.js`
if (require.main === module) {
  runMigrations();
  seedData();
  console.log('[DB] Standalone init complete.');
  process.exit(0);
}
