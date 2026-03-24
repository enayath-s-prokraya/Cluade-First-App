'use strict';

/**
 * HCCP — Humanoid Cloud Control Platform
 * Main Express application entry point
 *
 * Responsibilities:
 *  - Configure Express middleware (helmet, cors, morgan, body-parser)
 *  - Mount all API routes under /api/v1/
 *  - Setup Socket.IO with JWT authentication
 *  - Start the robot fleet simulator
 *  - Provide health-check endpoint
 *  - Global error handling
 */

require('dotenv').config();

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const helmet     = require('helmet');
const cors       = require('cors');
const morgan     = require('morgan');
const jwt        = require('jsonwebtoken');

const { runMigrations, seedData, getDb } = require('./db');
const { apiRateLimiter }  = require('./middleware/auth');
const { startSimulator }  = require('./services/simulator');

// Route modules
const authRouter      = require('./routes/auth');
const robotsRouter    = require('./routes/robots');
const commandsRouter  = require('./routes/commands');
const alertsRouter    = require('./routes/alerts');
const tasksRouter     = require('./routes/tasks');
const telemetryRouter = require('./routes/telemetry');
const usersRouter     = require('./routes/users');
const dashboardRouter = require('./routes/dashboard');

// ── Environment ─────────────────────────────────────────────────────────────
const PORT         = parseInt(process.env.PORT) || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL   || 'http://localhost:5173';
const JWT_SECRET   = process.env.JWT_SECRET     || 'hccp_fallback_secret';
const NODE_ENV     = process.env.NODE_ENV        || 'development';

// ── Express App ──────────────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);

// ── Security middleware ──────────────────────────────────────────────────────
app.use(helmet({
  crossOriginEmbedderPolicy: false, // Required for Socket.IO
  contentSecurityPolicy: NODE_ENV === 'production' ? undefined : false,
}));

// ── CORS ─────────────────────────────────────────────────────────────────────
app.use(cors({
  origin:      [FRONTEND_URL, 'http://localhost:3000', 'http://localhost:5174'],
  methods:     ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// ── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ── HTTP logging ─────────────────────────────────────────────────────────────
app.use(morgan(NODE_ENV === 'production' ? 'combined' : 'dev'));

// ── Health check (no auth required) ─────────────────────────────────────────
app.get('/health', (req, res) => {
  const db = getDb();

  let dbOk = false;
  try {
    db.prepare('SELECT 1').get();
    dbOk = true;
  } catch { /* intentionally empty */ }

  const status = dbOk ? 'ok' : 'degraded';
  res.status(dbOk ? 200 : 503).json({
    status,
    service:     'hccp-backend',
    version:     '1.0.0',
    environment: NODE_ENV,
    timestamp:   new Date().toISOString(),
    database:    dbOk ? 'connected' : 'error',
    uptime:      process.uptime(),
  });
});

// ── API Info (no auth) ────────────────────────────────────────────────────────
app.get('/api/v1', (req, res) => {
  res.json({
    name:        'Humanoid Cloud Control Platform API',
    version:     'v1',
    description: 'SaaS platform for managing humanoid robots',
    endpoints: {
      auth:      '/api/v1/auth',
      robots:    '/api/v1/robots',
      commands:  '/api/v1/commands',
      alerts:    '/api/v1/alerts',
      tasks:     '/api/v1/tasks',
      telemetry: '/api/v1/telemetry',
      users:     '/api/v1/users',
      dashboard: '/api/v1/dashboard',
    },
  });
});

// ── Apply general rate limiter to all API routes ─────────────────────────────
app.use('/api/', apiRateLimiter);

// ── Mount routers ────────────────────────────────────────────────────────────
app.use('/api/v1/auth',      authRouter);
app.use('/api/v1/robots',    robotsRouter);
app.use('/api/v1/commands',  commandsRouter);
app.use('/api/v1/alerts',    alertsRouter);
app.use('/api/v1/tasks',     tasksRouter);
app.use('/api/v1/telemetry', telemetryRouter);
app.use('/api/v1/users',     usersRouter);
app.use('/api/v1/dashboard', dashboardRouter);

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found.` });
});

// ── Global error handler ──────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[Global Error]', err);

  // Handle JSON parse errors
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON in request body.' });
  }

  const statusCode = err.statusCode || err.status || 500;
  res.status(statusCode).json({
    error:   NODE_ENV === 'production' ? 'Internal server error.' : err.message,
    ...(NODE_ENV !== 'production' && { stack: err.stack }),
  });
});

// ── Socket.IO ─────────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin:      [FRONTEND_URL, 'http://localhost:3000', 'http://localhost:5174'],
    methods:     ['GET', 'POST'],
    credentials: true,
  },
  // Ping timeout / interval for detecting stale connections
  pingTimeout:  10000,
  pingInterval: 25000,
});

/**
 * Socket.IO JWT authentication middleware.
 * Clients must send: socket.io({ auth: { token: '<JWT>' } })
 */
io.use((socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');

  if (!token) {
    return next(new Error('Authentication required. Provide auth.token.'));
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    socket.user = {
      id:        payload.sub,
      email:     payload.email,
      role:      payload.role,
      tenant_id: payload.tenant_id,
    };
    next();
  } catch (err) {
    next(new Error('Invalid or expired token.'));
  }
});

io.on('connection', (socket) => {
  const user = socket.user;
  console.log(`[Socket.IO] Connected: ${user.email} (${socket.id})`);

  // Auto-join tenant room
  if (user.tenant_id) {
    socket.join(`tenant:${user.tenant_id}`);
    console.log(`[Socket.IO] ${user.email} joined room tenant:${user.tenant_id}`);
  }

  // super_admin can join any tenant room on request
  socket.on('join_tenant', (tenantId) => {
    if (user.role === 'super_admin') {
      socket.join(`tenant:${tenantId}`);
      socket.emit('joined', { room: `tenant:${tenantId}` });
    }
  });

  // Join a specific robot's room for granular telemetry
  socket.on('subscribe_robot', (robotId) => {
    const db    = getDb();
    const robot = db.prepare('SELECT tenant_id FROM robots WHERE id = ?').get(robotId);
    if (!robot) {
      socket.emit('error', { message: 'Robot not found.' });
      return;
    }
    // Verify tenant access
    if (user.role !== 'super_admin' && robot.tenant_id !== user.tenant_id) {
      socket.emit('error', { message: 'Access denied.' });
      return;
    }
    socket.join(`robot:${robotId}`);
    socket.emit('subscribed', { robot_id: robotId });
    console.log(`[Socket.IO] ${user.email} subscribed to robot:${robotId}`);
  });

  // Leave a robot room
  socket.on('unsubscribe_robot', (robotId) => {
    socket.leave(`robot:${robotId}`);
    socket.emit('unsubscribed', { robot_id: robotId });
  });

  socket.on('disconnect', (reason) => {
    console.log(`[Socket.IO] Disconnected: ${user.email} — ${reason}`);
  });

  socket.on('error', (err) => {
    console.error(`[Socket.IO] Error for ${user.email}:`, err.message);
  });
});

// Expose io instance for routes that need it (optional, via app locals)
app.locals.io = io;

// ── Startup sequence ──────────────────────────────────────────────────────────
async function bootstrap() {
  try {
    console.log('[HCCP] Initializing database...');
    runMigrations();
    seedData();

    console.log('[HCCP] Starting server...');
    server.listen(PORT, () => {
      console.log('');
      console.log('╔══════════════════════════════════════════════════╗');
      console.log('║   Humanoid Cloud Control Platform  — BACKEND     ║');
      console.log('╠══════════════════════════════════════════════════╣');
      console.log(`║   HTTP  ► http://localhost:${PORT}                  ║`);
      console.log(`║   ENV   ► ${NODE_ENV.padEnd(38)}║`);
      console.log(`║   DB    ► ${(process.env.DB_PATH || './hccp.db').padEnd(38)}║`);
      console.log('╚══════════════════════════════════════════════════╝');
      console.log('');

      // Start the robot simulator AFTER the server is listening
      startSimulator(io);
      console.log('[HCCP] Fleet simulator running.');
    });

  } catch (err) {
    console.error('[HCCP] Fatal startup error:', err);
    process.exit(1);
  }
}

// ── Graceful shutdown ────────────────────────────────────────────────────────
function gracefulShutdown(signal) {
  console.log(`\n[HCCP] ${signal} received — shutting down gracefully...`);
  server.close(() => {
    console.log('[HCCP] HTTP server closed.');
    try {
      getDb().close();
      console.log('[HCCP] Database connection closed.');
    } catch { /* already closed */ }
    process.exit(0);
  });

  // Force exit after 10 s if graceful shutdown hangs
  setTimeout(() => {
    console.error('[HCCP] Forced shutdown after timeout.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  console.error('[HCCP] Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[HCCP] Uncaught exception:', err);
  process.exit(1);
});

bootstrap();

module.exports = { app, server, io }; // for testing
