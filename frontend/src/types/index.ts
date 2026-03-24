// ─── Enums / Union Types ────────────────────────────────────────────────────

export type UserRole =
  | 'super_admin'
  | 'tenant_admin'
  | 'fleet_manager'
  | 'operator'
  | 'viewer'

export type RobotStatus = 'online' | 'offline' | 'maintenance' | 'error' | 'idle'

export type RobotType = 'humanoid' | 'wheeled' | 'drone' | 'arm' | 'mobile'

export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical'

export type AlertStatus = 'open' | 'acknowledged' | 'resolved'

export type CommandStatus =
  | 'pending'
  | 'sent'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type TaskStatus =
  | 'queued'
  | 'assigned'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type CommandType =
  | 'MOVE'
  | 'STOP'
  | 'NAVIGATE'
  | 'PICK'
  | 'PLACE'
  | 'CHARGE'
  | 'UPDATE_FIRMWARE'
  | 'RESTART'
  | 'EMERGENCY_STOP'
  | 'CUSTOM'

// ─── Core Entities ──────────────────────────────────────────────────────────

export interface User {
  id: string
  tenant_id: string
  email: string
  name: string
  role: UserRole
  status: 'active' | 'inactive' | 'suspended'
  last_login: string | null
  created_at: string
}

export interface Tenant {
  id: string
  name: string
  plan: 'free' | 'starter' | 'professional' | 'enterprise'
  status: 'active' | 'suspended' | 'cancelled'
  max_robots: number
  created_at: string
}

export interface Robot {
  id: string
  tenant_id: string
  name: string
  type: RobotType
  model: string
  serial_number: string
  status: RobotStatus
  battery_level: number
  location_lat: number | null
  location_lng: number | null
  location_name: string | null
  firmware_version: string
  ip_address: string | null
  registered_at: string
  last_seen: string | null
  tags: string[]
  metadata: Record<string, unknown>
}

export interface Telemetry {
  id: string
  robot_id: string
  timestamp: string
  battery: number
  cpu_usage: number
  memory_usage: number
  temperature: number
  speed: number
  payload_weight: number
  joint_temps: Record<string, number>
  network_latency: number
  error_codes: string[]
}

export interface Command {
  id: string
  robot_id: string
  user_id: string
  type: CommandType
  payload: Record<string, unknown>
  status: CommandStatus
  priority: 'low' | 'normal' | 'high' | 'critical'
  sent_at: string | null
  executed_at: string | null
  completed_at: string | null
  result: Record<string, unknown> | null
  error_message: string | null
}

export interface Alert {
  id: string
  robot_id: string
  tenant_id: string
  type: string
  severity: AlertSeverity
  message: string
  status: AlertStatus
  acknowledged_by: string | null
  created_at: string
  resolved_at: string | null
  robot_name?: string
}

export interface TaskStep {
  id: string
  name: string
  status: TaskStatus
  order: number
  result?: string
}

export interface Task {
  id: string
  robot_id: string
  tenant_id: string
  name: string
  description: string
  type: string
  status: TaskStatus
  priority: 'low' | 'normal' | 'high' | 'critical'
  nlp_input: string | null
  steps: TaskStep[]
  created_by: string
  assigned_at: string | null
  started_at: string | null
  completed_at: string | null
  progress: number
}

// ─── Aggregates / Stats ──────────────────────────────────────────────────────

export interface DashboardStats {
  total_robots: number
  online_robots: number
  offline_robots: number
  active_tasks: number
  open_alerts: number
  critical_alerts: number
  commands_today: number
  fleet_health_score: number
}

export interface AlertStats {
  total: number
  open: number
  acknowledged: number
  resolved: number
  by_severity: Record<AlertSeverity, number>
}

export interface TaskStats {
  total: number
  queued: number
  executing: number
  completed: number
  failed: number
  success_rate: number
}

export interface RobotStats {
  commands_today: number
  tasks_completed: number
  uptime_percent: number
  avg_battery: number
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
}

export interface LoginResponse {
  token: string
  user: User
}

// ─── API Helpers ─────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  per_page: number
}

export interface ApiError {
  message: string
  code?: string
  details?: Record<string, string[]>
}

export interface ActivityItem {
  id: string
  type: string
  message: string
  timestamp: string
  robot_id?: string
  robot_name?: string
  severity?: AlertSeverity
}

export interface FleetTelemetry {
  robot_id: string
  robot_name: string
  status: RobotStatus
  battery: number
  cpu_usage: number
  temperature: number
  last_update: string
}
