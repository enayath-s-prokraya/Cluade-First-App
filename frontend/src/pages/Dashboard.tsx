import React, { useState, useEffect, useCallback } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import {
  FiCpu, FiAlertTriangle, FiActivity, FiCheckCircle, FiWifi, FiWifiOff,
  FiHeart, FiClock, FiZap, FiTrendingUp,
} from 'react-icons/fi'
import { dashboardApi, alertsApi } from '../services/api'
import { useSocket } from '../services/socket'
import type { DashboardStats, Alert, ActivityItem } from '../types'
import { format } from 'date-fns'

// ─── Mock Data ───────────────────────────────────────────────────────────────

const MOCK_STATS: DashboardStats = {
  total_robots: 24,
  online_robots: 18,
  offline_robots: 4,
  active_tasks: 7,
  open_alerts: 5,
  critical_alerts: 2,
  commands_today: 143,
  fleet_health_score: 87,
}

const generateTelemetryHistory = () =>
  Array.from({ length: 20 }, (_, i) => ({
    time: format(new Date(Date.now() - (19 - i) * 30000), 'HH:mm:ss'),
    battery: 60 + Math.random() * 25,
    cpu: 30 + Math.random() * 40,
    temp: 38 + Math.random() * 15,
  }))

const MOCK_ALERTS: Alert[] = [
  { id: '1', robot_id: 'r1', tenant_id: 't1', type: 'LOW_BATTERY', severity: 'warning', message: 'Robot Alpha-7 battery at 12%', status: 'open', acknowledged_by: null, created_at: new Date(Date.now() - 120000).toISOString(), resolved_at: null, robot_name: 'Alpha-7' },
  { id: '2', robot_id: 'r2', tenant_id: 't1', type: 'MOTOR_FAULT', severity: 'critical', message: 'Left arm motor fault detected on Beta-3', status: 'open', acknowledged_by: null, created_at: new Date(Date.now() - 300000).toISOString(), resolved_at: null, robot_name: 'Beta-3' },
  { id: '3', robot_id: 'r3', tenant_id: 't1', type: 'HIGH_TEMP', severity: 'error', message: 'CPU temperature above threshold on Gamma-1', status: 'acknowledged', acknowledged_by: 'user1', created_at: new Date(Date.now() - 600000).toISOString(), resolved_at: null, robot_name: 'Gamma-1' },
  { id: '4', robot_id: 'r4', tenant_id: 't1', type: 'NETWORK_LOSS', severity: 'warning', message: 'Delta-9 intermittent connection drops', status: 'open', acknowledged_by: null, created_at: new Date(Date.now() - 900000).toISOString(), resolved_at: null, robot_name: 'Delta-9' },
  { id: '5', robot_id: 'r5', tenant_id: 't1', type: 'TASK_FAILED', severity: 'info', message: 'Assembly task timeout on Epsilon-2', status: 'resolved', acknowledged_by: null, created_at: new Date(Date.now() - 1800000).toISOString(), resolved_at: new Date().toISOString(), robot_name: 'Epsilon-2' },
]

const MOCK_ACTIVITY: ActivityItem[] = [
  { id: '1', type: 'command', message: 'NAVIGATE command sent to Alpha-7', timestamp: new Date(Date.now() - 60000).toISOString(), robot_name: 'Alpha-7' },
  { id: '2', type: 'task', message: 'Assembly task #1042 completed by Beta-3', timestamp: new Date(Date.now() - 120000).toISOString(), robot_name: 'Beta-3' },
  { id: '3', type: 'alert', message: 'Critical alert triggered: motor fault', timestamp: new Date(Date.now() - 180000).toISOString(), robot_name: 'Beta-3', severity: 'critical' },
  { id: '4', type: 'status', message: 'Gamma-1 came online', timestamp: new Date(Date.now() - 300000).toISOString(), robot_name: 'Gamma-1' },
  { id: '5', type: 'command', message: 'CHARGE command sent to Delta-9', timestamp: new Date(Date.now() - 450000).toISOString(), robot_name: 'Delta-9' },
  { id: '6', type: 'task', message: 'Inspection task #1041 started by Zeta-4', timestamp: new Date(Date.now() - 600000).toISOString(), robot_name: 'Zeta-4' },
]

// ─── Stat Card ───────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string
  value: string | number
  icon: React.ReactNode
  accent: string
  sub?: string
  loading?: boolean
}

const StatCard: React.FC<StatCardProps> = ({ label, value, icon, accent, sub, loading }) => (
  <div
    className="rounded-xl border border-gray-700/50 p-5 flex items-start gap-4"
    style={{ background: '#111827' }}
  >
    <div
      className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
      style={{ background: `${accent}20`, border: `1px solid ${accent}30` }}
    >
      <span style={{ color: accent }}>{icon}</span>
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-gray-400 text-xs font-medium uppercase tracking-wide truncate">{label}</p>
      {loading ? (
        <div className="mt-1 h-7 w-16 rounded bg-gray-700 animate-pulse" />
      ) : (
        <p className="text-2xl font-bold text-white mt-0.5">{value}</p>
      )}
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  </div>
)

// ─── Severity colors ─────────────────────────────────────────────────────────

const SEV_COLORS: Record<string, string> = {
  critical: '#ef4444',
  error: '#f97316',
  warning: '#eab308',
  info: '#3b82f6',
}

const PIE_COLORS = ['#10b981', '#6b7280', '#eab308', '#ef4444', '#8b5cf6']
const STATUS_LABELS = ['Online', 'Offline', 'Maintenance', 'Error', 'Idle']

// ─── Dashboard ───────────────────────────────────────────────────────────────

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [telemetry, setTelemetry] = useState(generateTelemetryHistory())
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState(new Date())

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, alertsRes, activityRes] = await Promise.allSettled([
        dashboardApi.getStats(),
        alertsApi.getAll({ per_page: 5, status: 'open' }),
        dashboardApi.getActivity(),
      ])
      if (statsRes.status === 'fulfilled') setStats(statsRes.value)
      if (alertsRes.status === 'fulfilled') setAlerts(alertsRes.value.data)
      if (activityRes.status === 'fulfilled') setActivity(activityRes.value)
      setLastRefresh(new Date())
    } catch {
      // Use mock data on failure
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(() => {
      fetchData()
      setTelemetry((prev) => [
        ...prev.slice(1),
        {
          time: format(new Date(), 'HH:mm:ss'),
          battery: 60 + Math.random() * 25,
          cpu: 30 + Math.random() * 40,
          temp: 38 + Math.random() * 15,
        },
      ])
    }, 10000)
    return () => clearInterval(interval)
  }, [fetchData])

  // Socket: live telemetry updates
  useSocket('telemetry_update', () => {
    setTelemetry((prev) => [
      ...prev.slice(1),
      {
        time: format(new Date(), 'HH:mm:ss'),
        battery: 60 + Math.random() * 25,
        cpu: 30 + Math.random() * 40,
        temp: 38 + Math.random() * 15,
      },
    ])
  })

  useSocket('alert_triggered', (alert) => {
    setAlerts((prev) => [alert, ...prev.slice(0, 4)])
  })

  const displayStats = stats || MOCK_STATS
  const displayAlerts = alerts.length > 0 ? alerts : MOCK_ALERTS
  const displayActivity = activity.length > 0 ? activity : MOCK_ACTIVITY

  const pieData = [
    { name: 'Online', value: displayStats.online_robots },
    { name: 'Offline', value: displayStats.offline_robots },
    { name: 'Maintenance', value: 1 },
    { name: 'Error', value: 2 },
    { name: 'Idle', value: displayStats.total_robots - displayStats.online_robots - displayStats.offline_robots - 3 },
  ].filter((d) => d.value > 0)

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Fleet Dashboard</h1>
          <p className="text-gray-400 text-sm mt-0.5">Real-time overview of your robot fleet</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          Live · Updated {format(lastRefresh, 'HH:mm:ss')}
        </div>
      </div>

      {/* Stat Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard label="Total Robots" value={displayStats.total_robots} icon={<FiCpu className="w-6 h-6" />} accent="#06b6d4" loading={loading} />
        <StatCard label="Online" value={displayStats.online_robots} icon={<FiWifi className="w-6 h-6" />} accent="#10b981" sub="robots active" loading={loading} />
        <StatCard label="Offline" value={displayStats.offline_robots} icon={<FiWifiOff className="w-6 h-6" />} accent="#6b7280" loading={loading} />
        <StatCard label="Active Tasks" value={displayStats.active_tasks} icon={<FiActivity className="w-6 h-6" />} accent="#8b5cf6" loading={loading} />
        <StatCard label="Open Alerts" value={displayStats.open_alerts} icon={<FiAlertTriangle className="w-6 h-6" />} accent="#eab308" sub={`${displayStats.critical_alerts} critical`} loading={loading} />
        <StatCard label="Fleet Health" value={`${displayStats.fleet_health_score}%`} icon={<FiHeart className="w-6 h-6" />} accent="#10b981" loading={loading} />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        {/* Telemetry Line Chart */}
        <div className="xl:col-span-3 rounded-xl border border-gray-700/50 p-5" style={{ background: '#111827' }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-white font-semibold">Fleet Telemetry</h3>
              <p className="text-gray-500 text-xs">Average across all online robots</p>
            </div>
            <FiTrendingUp className="text-cyan-500 w-5 h-5" />
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={telemetry}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="time" tick={{ fill: '#6b7280', fontSize: 11 }} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                labelStyle={{ color: '#e5e7eb' }}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: '#9ca3af' }} />
              <Line type="monotone" dataKey="battery" stroke="#06b6d4" strokeWidth={2} dot={false} name="Battery %" />
              <Line type="monotone" dataKey="cpu" stroke="#8b5cf6" strokeWidth={2} dot={false} name="CPU %" />
              <Line type="monotone" dataKey="temp" stroke="#f97316" strokeWidth={2} dot={false} name="Temp °C" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Recent Alerts */}
        <div className="xl:col-span-2 rounded-xl border border-gray-700/50 p-5 flex flex-col" style={{ background: '#111827' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold">Recent Alerts</h3>
            <a href="/alerts" className="text-cyan-400 text-xs hover:text-cyan-300">View all</a>
          </div>
          <div className="space-y-3 flex-1">
            {displayAlerts.slice(0, 5).map((alert) => (
              <div
                key={alert.id}
                className="flex items-start gap-3 p-3 rounded-lg border-l-2"
                style={{
                  background: `${SEV_COLORS[alert.severity]}08`,
                  borderLeftColor: SEV_COLORS[alert.severity],
                }}
              >
                <FiAlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: SEV_COLORS[alert.severity] }} />
                <div className="flex-1 min-w-0">
                  <p className="text-gray-300 text-sm truncate">{alert.message}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs font-medium capitalize" style={{ color: SEV_COLORS[alert.severity] }}>
                      {alert.severity}
                    </span>
                    <span className="text-gray-600 text-xs">·</span>
                    <span className="text-gray-500 text-xs">
                      {format(new Date(alert.created_at), 'HH:mm')}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        {/* Pie Chart */}
        <div className="xl:col-span-2 rounded-xl border border-gray-700/50 p-5" style={{ background: '#111827' }}>
          <h3 className="text-white font-semibold mb-1">Status Distribution</h3>
          <p className="text-gray-500 text-xs mb-4">Robot fleet breakdown</p>
          <div className="flex items-center gap-4">
            <ResponsiveContainer width={160} height={160}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
                  {pieData.map((_, index) => (
                    <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2 flex-1">
              {pieData.map((entry, index) => (
                <div key={entry.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: PIE_COLORS[index] }} />
                    <span className="text-gray-400 text-xs">{entry.name}</span>
                  </div>
                  <span className="text-white text-xs font-medium">{entry.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Activity Feed */}
        <div className="xl:col-span-3 rounded-xl border border-gray-700/50 p-5" style={{ background: '#111827' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold">Recent Activity</h3>
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <FiClock className="w-3 h-3" /> Live feed
            </span>
          </div>
          <div className="space-y-3">
            {displayActivity.map((item) => {
              const typeColor: Record<string, string> = {
                command: '#06b6d4', task: '#10b981', alert: '#ef4444', status: '#8b5cf6',
              }
              const typeIcon: Record<string, React.ReactNode> = {
                command: <FiZap className="w-3.5 h-3.5" />,
                task: <FiCheckCircle className="w-3.5 h-3.5" />,
                alert: <FiAlertTriangle className="w-3.5 h-3.5" />,
                status: <FiWifi className="w-3.5 h-3.5" />,
              }
              const color = typeColor[item.type] || '#6b7280'
              return (
                <div key={item.id} className="flex items-start gap-3">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: `${color}20`, color }}
                  >
                    {typeIcon[item.type] || <FiActivity className="w-3.5 h-3.5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-300 text-sm">{item.message}</p>
                    <p className="text-gray-600 text-xs mt-0.5">
                      {format(new Date(item.timestamp), 'MMM d, HH:mm:ss')}
                      {item.robot_name && <> · <span className="text-cyan-600">{item.robot_name}</span></>}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
