# HCCP — Humanoid Cloud Control Platform

> A production-ready SaaS platform for managing, monitoring, and controlling humanoid robots and autonomous machines globally — like AWS, but for robots.

---

## Quick Start

### Option 1: Local Development

**Backend:**
```bash
cd backend
npm install
npm run dev
# API running at http://localhost:3001
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
# UI running at http://localhost:5173
```

### Option 2: Docker Compose
```bash
docker-compose up --build
# UI at http://localhost:5173
# API at http://localhost:3001
```

---

## Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Super Admin | admin@hccp.io | password123 |
| Tenant Admin | admin@warehousebot.com | password123 |
| Operator | operator@warehousebot.com | password123 |

---

## Platform Features

| Module | Description |
|--------|-------------|
| **Dashboard** | Fleet health overview, live charts, activity feed |
| **Fleet Map** | Visual SVG map with robot locations and status |
| **Robot Registry** | Register, manage, and monitor individual robots |
| **Command Center** | Quick commands, NLP commands, bulk operations |
| **Task Manager** | Kanban board with NLP task creation |
| **Live Monitor** | Real-time telemetry with 5s refresh, live socket updates |
| **Alerts** | Severity-filtered alerts with acknowledge/resolve |
| **Users & RBAC** | 5-role access control (super_admin → viewer) |
| **Settings** | Profile, notifications, security, API keys |
| **Billing** | Plan comparison, usage metrics, invoice history |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    FRONTEND (React)                  │
│  Vite + TypeScript + Tailwind CSS + Recharts         │
│  Socket.io-client for real-time updates              │
└────────────────────┬────────────────────────────────┘
                     │ HTTP/WebSocket
┌────────────────────▼────────────────────────────────┐
│                 BACKEND (Node.js)                    │
│  Express REST API  │  Socket.io Server               │
│  JWT Auth + RBAC   │  Tenant Isolation               │
│  Rate Limiting     │  Audit Logging                  │
└────────────────────┬────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────┐
│                  DATABASE (SQLite)                   │
│  robots │ telemetry │ commands │ alerts │ tasks      │
│  tenants │ users │ maintenance │ audit_logs          │
└─────────────────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────┐
│              ROBOT SIMULATOR SERVICE                 │
│  Generates live telemetry every 5s                  │
│  Triggers random alerts (battery, temp, fault)      │
│  Executes commands (pending → completed)            │
│  Emits socket events to connected clients           │
└─────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Recharts |
| Backend | Node.js, Express, Socket.io |
| Database | SQLite (via better-sqlite3) — swap for PostgreSQL in prod |
| Auth | JWT (jsonwebtoken) + bcrypt |
| Real-time | Socket.io (WebSocket) |
| Deployment | Docker + docker-compose + Nginx |

## API Reference

### Auth
```
POST /api/v1/auth/login         # Login → JWT token
POST /api/v1/auth/logout        # Logout
GET  /api/v1/auth/me            # Current user profile
```

### Robots
```
GET    /api/v1/robots           # List fleet (filter: status, type, search)
POST   /api/v1/robots           # Register new robot
GET    /api/v1/robots/:id       # Robot details
PUT    /api/v1/robots/:id       # Update robot
DELETE /api/v1/robots/:id       # Deregister
GET    /api/v1/robots/:id/telemetry  # Telemetry history
GET    /api/v1/robots/:id/stats      # Aggregated stats
```

### Commands
```
POST /api/v1/commands           # Send command to robot
POST /api/v1/commands/bulk      # Bulk command (multiple robots)
POST /api/v1/commands/nlp       # NLP → parsed command
PUT  /api/v1/commands/:id/cancel
```

### Tasks
```
GET  /api/v1/tasks              # List tasks (filter: status, priority)
POST /api/v1/tasks              # Create task
POST /api/v1/tasks/nlp          # NLP → task breakdown
PUT  /api/v1/tasks/:id          # Update / cancel
```

### Alerts
```
GET /api/v1/alerts              # List alerts (filter: severity, status)
PUT /api/v1/alerts/:id/acknowledge
PUT /api/v1/alerts/:id/resolve
GET /api/v1/alerts/stats
```

## Socket.io Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `telemetry_update` | Server → Client | Live robot telemetry |
| `robot_status_change` | Server → Client | Robot went online/offline |
| `alert_triggered` | Server → Client | New alert created |
| `command_update` | Server → Client | Command status change |
| `task_update` | Server → Client | Task progress update |

## Security

- JWT authentication on all endpoints
- RBAC with 5 roles: `super_admin`, `tenant_admin`, `fleet_manager`, `operator`, `viewer`
- Strict tenant isolation — users can only access their own tenant's data
- Rate limiting on auth endpoints (100 req/15min)
- Helmet.js security headers
- Socket.io connections require valid JWT

## Roles & Permissions

| Action | viewer | operator | fleet_manager | tenant_admin | super_admin |
|--------|--------|----------|---------------|-------------|-------------|
| View robots | ✓ | ✓ | ✓ | ✓ | ✓ |
| Send commands | | ✓ | ✓ | ✓ | ✓ |
| Manage fleet | | | ✓ | ✓ | ✓ |
| Manage users | | | | ✓ | ✓ |
| All tenants | | | | | ✓ |

## Roadmap

### Phase 1 — MVP (Current)
- [x] Robot registration & fleet management
- [x] Real-time telemetry monitoring
- [x] Command & control system
- [x] Alert management
- [x] Task management with NLP
- [x] JWT auth with RBAC
- [x] Multi-tenant architecture

### Phase 2 — Production (3-6 months)
- [ ] PostgreSQL + TimescaleDB migration
- [ ] Kafka event streaming
- [ ] MQTT broker for real robot connectivity (ROS2 bridge)
- [ ] Video streaming via WebRTC
- [ ] Digital twin simulation environment
- [ ] Predictive maintenance ML models
- [ ] OTA firmware update system

### Phase 3 — Scale (6-12 months)
- [ ] Multi-region Kubernetes deployment
- [ ] AI task planning with Claude/GPT integration
- [ ] Computer vision (object detection) integration
- [ ] API marketplace & SDK
- [ ] Advanced billing with Stripe
- [ ] Smart city integrations
