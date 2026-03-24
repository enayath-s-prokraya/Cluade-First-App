import axios, { AxiosInstance, AxiosError } from 'axios'
import type {
  User,
  Robot,
  Telemetry,
  Command,
  Alert,
  Task,
  DashboardStats,
  AlertStats,
  TaskStats,
  RobotStats,
  LoginResponse,
  PaginatedResponse,
  ActivityItem,
  FleetTelemetry,
} from '../types'

// ─── Axios Instance ──────────────────────────────────────────────────────────

const api: AxiosInstance = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
})

// Request interceptor: attach JWT
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('hccp_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Response interceptor: handle 401
api.interceptors.response.use(
  (res) => res,
  (err: AxiosError) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('hccp_token')
      localStorage.removeItem('hccp_user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  },
)

export default api

// ─── Filter Types ────────────────────────────────────────────────────────────

export interface RobotFilters {
  status?: string
  type?: string
  search?: string
  page?: number
  per_page?: number
}

export interface CommandFilters {
  robot_id?: string
  status?: string
  type?: string
  page?: number
  per_page?: number
}

export interface AlertFilters {
  robot_id?: string
  severity?: string
  status?: string
  page?: number
  per_page?: number
}

export interface TaskFilters {
  robot_id?: string
  status?: string
  type?: string
  page?: number
  per_page?: number
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export const authApi = {
  login: (email: string, password: string) =>
    api.post<LoginResponse>('/auth/login', { email, password }).then((r) => r.data),

  logout: () => api.post('/auth/logout').then((r) => r.data),

  getMe: () => api.get<User>('/auth/me').then((r) => r.data),
}

// ─── Robots ──────────────────────────────────────────────────────────────────

export const robotsApi = {
  getAll: (filters?: RobotFilters) =>
    api.get<PaginatedResponse<Robot>>('/robots', { params: filters }).then((r) => r.data),

  getById: (id: string) => api.get<Robot>(`/robots/${id}`).then((r) => r.data),

  register: (data: Partial<Robot>) => api.post<Robot>('/robots', data).then((r) => r.data),

  update: (id: string, data: Partial<Robot>) =>
    api.patch<Robot>(`/robots/${id}`, data).then((r) => r.data),

  delete: (id: string) => api.delete(`/robots/${id}`).then((r) => r.data),

  getTelemetry: (id: string, range?: string) =>
    api
      .get<Telemetry[]>(`/robots/${id}/telemetry`, { params: { range } })
      .then((r) => r.data),

  getStats: (id: string) =>
    api.get<RobotStats>(`/robots/${id}/stats`).then((r) => r.data),
}

// ─── Commands ────────────────────────────────────────────────────────────────

export interface SendCommandPayload {
  robot_id: string
  type: string
  payload?: Record<string, unknown>
  priority?: string
}

export interface BulkCommandPayload {
  robot_ids: string[]
  type: string
  payload?: Record<string, unknown>
  priority?: string
}

export const commandsApi = {
  getAll: (filters?: CommandFilters) =>
    api.get<PaginatedResponse<Command>>('/commands', { params: filters }).then((r) => r.data),

  send: (data: SendCommandPayload) =>
    api.post<Command>('/commands', data).then((r) => r.data),

  bulkSend: (data: BulkCommandPayload) =>
    api.post<Command[]>('/commands/bulk', data).then((r) => r.data),

  cancel: (id: string) =>
    api.patch<Command>(`/commands/${id}/cancel`).then((r) => r.data),

  nlpCommand: (text: string, robot_id?: string) =>
    api.post<Command>('/commands/nlp', { text, robot_id }).then((r) => r.data),
}

// ─── Alerts ──────────────────────────────────────────────────────────────────

export const alertsApi = {
  getAll: (filters?: AlertFilters) =>
    api.get<PaginatedResponse<Alert>>('/alerts', { params: filters }).then((r) => r.data),

  getStats: () => api.get<AlertStats>('/alerts/stats').then((r) => r.data),

  acknowledge: (id: string) =>
    api.patch<Alert>(`/alerts/${id}/acknowledge`).then((r) => r.data),

  resolve: (id: string) =>
    api.patch<Alert>(`/alerts/${id}/resolve`).then((r) => r.data),
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

export interface CreateTaskPayload {
  robot_id: string
  name: string
  description?: string
  type: string
  priority?: string
  steps?: Array<{ name: string; order: number }>
}

export const tasksApi = {
  getAll: (filters?: TaskFilters) =>
    api.get<PaginatedResponse<Task>>('/tasks', { params: filters }).then((r) => r.data),

  create: (data: CreateTaskPayload) => api.post<Task>('/tasks', data).then((r) => r.data),

  update: (id: string, data: Partial<Task>) =>
    api.patch<Task>(`/tasks/${id}`, data).then((r) => r.data),

  cancel: (id: string) => api.patch<Task>(`/tasks/${id}/cancel`).then((r) => r.data),

  nlpTask: (text: string, robot_id?: string) =>
    api.post<Task>('/tasks/nlp', { text, robot_id }).then((r) => r.data),

  getStats: () => api.get<TaskStats>('/tasks/stats').then((r) => r.data),
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export const dashboardApi = {
  getStats: () => api.get<DashboardStats>('/dashboard/stats').then((r) => r.data),

  getActivity: () => api.get<ActivityItem[]>('/dashboard/activity').then((r) => r.data),
}

// ─── Telemetry ───────────────────────────────────────────────────────────────

export const telemetryApi = {
  getFleet: () => api.get<FleetTelemetry[]>('/telemetry/fleet').then((r) => r.data),

  getLive: () => api.get<Telemetry[]>('/telemetry/live').then((r) => r.data),
}

// ─── Users ───────────────────────────────────────────────────────────────────

export interface CreateUserPayload {
  email: string
  name: string
  role: string
  password?: string
}

export const usersApi = {
  getAll: () => api.get<PaginatedResponse<User>>('/users').then((r) => r.data),

  create: (data: CreateUserPayload) => api.post<User>('/users', data).then((r) => r.data),

  update: (id: string, data: Partial<User>) =>
    api.patch<User>(`/users/${id}`, data).then((r) => r.data),

  delete: (id: string) => api.delete(`/users/${id}`).then((r) => r.data),
}
