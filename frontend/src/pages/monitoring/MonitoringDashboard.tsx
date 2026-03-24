import React, { useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Legend,
} from 'recharts'
import {
  FiActivity, FiCpu, FiThermometer, FiZap, FiWifi,
  FiAlertTriangle, FiRefreshCw, FiArrowUp, FiArrowDown,
} from 'react-icons/fi'
import { telemetryApi, alertsApi } from '../../services/api'
import { useSocket } from '../../services/socket'
import StatusBadge from '../../components/common/StatusBadge'
import type { FleetTelemetry, Alert, Telemetry } from '../../types'
import { format } from 'date-fns'

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_FLEET: FleetTelemetry[] = [
  { robot_id: 'r1', robot_name: 'Alpha-7', status: 'online', battery: 82, cpu_usage: 54, temperature: 47, last_update: new Date().toISOString() },
  { robot_id: 'r2', robot_name: 'Beta-3', status: 'online', battery: 67, cpu_usage: 72, temperature: 53, last_update: new Date().toISOString() },
  { robot_id: 'r3', robot_name: 'Gamma-1', status: 'maintenance', battery: 45, cpu_usage: 12, temperature: 38, last_update: new Date().toISOString() },
  { robot_id: 'r4', robot_name: 'Delta-9', status: 'offline', battery: 12, cpu_usage: 0, temperature: 28, last_update: new Date(Date.now() - 7200000).toISOString() },
  { robot_id: 'r5', robot_name: 'Epsilon-2', status: 'online', battery: 91, cpu_usage: 38, temperature: 44, last_update: new Date().toISOString() },
  { robot_id: 'r6', robot_name: 'Zeta-4', status: 'idle', battery: 73, cpu_usage: 5, temperature: 35, last_update: new Date().toISOString() },
  { robot_id: 'r7', robot_name: 'Eta-11', status: 'error', battery: 55, cpu_usage: 95, temperature: 78, last_update: new Date().toISOString() },
  { robot_id: 'r8', robot_name: 'Theta-6', status: 'online', battery: 88, cpu_usage: 44, temperature: 49, last_update: new Date().toISOString() },
]

const MOCK_ALERTS: Alert[] = [
  { id: 'a1', robot_id: 'r7', tenant_id: 't1', type: 'HIGH_CPU', severity: 'critical', message: 'Eta-11 CPU at 95% — possible runaway process', status: 'open', acknowledged_by: null, created_at: new Date(Date.now() - 60000).toISOString(), resolved_at: null, robot_name: 'Eta-11' },
  { id: 'a2', robot_id: 'r7', tenant_id: 't1', type: 'HIGH_TEMP', severity: 'error', message: 'Eta-11 temperature critical: 78°C', status: 'open', acknowledged_by: null, created_at: new Date(Date.now() - 120000).toISOString(), resolved_at: null, robot_name: 'Eta-11' },
  { id: 'a3', robot_id: 'r4', tenant_id: 't1', type: 'LOW_BATTERY', severity: 'warning', message: 'Delta-9 battery critically low: 12%', status: 'open', acknowledged_by: null, created_at: new Date(Date.now() - 300000).toISOString(), resolved_at: null, robot_name: 'Delta-9' },
]

interface TrendPoint {
  time: string
  battery: number
  cpu: number
  temp: number
}

const genTrend = (n = 20): TrendPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    time: format(new Date(Date.now() - (n - i) * 5000), 'HH:mm:ss'),
    battery: 65 + Math.sin(i * 0.4) * 10 + Math.random() * 5,
    cpu: 45 + Math.cos(i * 0.3) * 15 + Math.random() * 8,
    temp: 48 + Math.sin(i * 0.2) * 6 + Math.random() * 4,
  }))

// ─── Metric Card ──────────────────────────────────────────────────────────────

function MetricCard({ label, value, unit, icon, color, trend }: { label: string; value: number; unit: string; icon: React.ReactNode; color: string; trend?: number }) {
  return (
    <div className="card flex items-center gap-4">
      <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${color}20`, color }}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-gray-500 text-xs uppercase tracking-wide">{label}</p>
        <div className="flex items-baseline gap-1">
          <p className="text-2xl font-bold text-white">{value.toFixed(0)}</p>
          <p className="text-gray-500 text-sm">{unit}</p>
        </div>
      </div>
      {trend !== undefined && (
        <div className={`flex items-center gap-1 text-xs font-medium ${trend >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {trend >= 0 ? <FiArrowUp className="w-3 h-3" /> : <FiArrowDown className="w-3 h-3" />}
          {Math.abs(trend).toFixed(1)}%
        </div>
      )}
    </div>
  )
}

export default function MonitoringDashboard() {
  const [fleet, setFleet] = useState<FleetTelemetry[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [trend, setTrend] = useState<TrendPoint[]>(genTrend())
  const [loading, setLoading] = useState(true)
  const [sortField, setSortField] = useState<keyof FleetTelemetry>('robot_name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [alertTicker, setAlertTicker] = useState<Alert[]>([])
  const [lastUpdate, setLastUpdate] = useState(new Date())

  const fetchData = useCallback(async () => {
    try {
      const [fleetRes, alertsRes] = await Promise.allSettled([
        telemetryApi.getFleet(),
        alertsApi.getAll({ status: 'open', per_page: 10 }),
      ])
      if (fleetRes.status === 'fulfilled') setFleet(fleetRes.value)
      if (alertsRes.status === 'fulfilled') setAlerts(alertsRes.value.data)
      setLastUpdate(new Date())
    } catch {
      setFleet(MOCK_FLEET)
      setAlerts(MOCK_ALERTS)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(() => {
      fetchData()
      setTrend((prev) => [
        ...prev.slice(1),
        {
          time: format(new Date(), 'HH:mm:ss'),
          battery: 65 + Math.random() * 20,
          cpu: 45 + Math.random() * 30,
          temp: 48 + Math.random() * 12,
        },
      ])
    }, 5000)
    return () => clearInterval(interval)
  }, [fetchData])

  useSocket('telemetry_update', (data: Telemetry) => {
    setFleet((prev) =>
      prev.map((f) =>
        f.robot_id === data.robot_id
          ? { ...f, battery: data.battery, cpu_usage: data.cpu_usage, temperature: data.temperature, last_update: data.timestamp }
          : f
      )
    )
    setLastUpdate(new Date())
  })

  useSocket('alert_triggered', (alert) => {
    setAlertTicker((prev) => [alert, ...prev.slice(0, 4)])
    setAlerts((prev) => [alert, ...prev.slice(0, 9)])
  })

  const displayFleet = fleet.length > 0 ? fleet : MOCK_FLEET
  const displayAlerts = alerts.length > 0 ? alerts : MOCK_ALERTS

  const onlineRobots = displayFleet.filter((r) => r.status === 'online')
  const avgBattery = onlineRobots.reduce((s, r) => s + r.battery, 0) / (onlineRobots.length || 1)
  const avgCpu = onlineRobots.reduce((s, r) => s + r.cpu_usage, 0) / (onlineRobots.length || 1)
  const avgTemp = onlineRobots.reduce((s, r) => s + r.temperature, 0) / (onlineRobots.length || 1)

  const sortedFleet = [...displayFleet].sort((a, b) => {
    const av = a[sortField]
    const bv = b[sortField]
    const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number)
    return sortDir === 'asc' ? cmp : -cmp
  })

  const handleSort = (field: keyof FleetTelemetry) => {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortField(field); setSortDir('asc') }
  }

  const SEV_COLORS: Record<string, string> = { critical: '#ef4444', error: '#f97316', warning: '#eab308', info: '#3b82f6' }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-white">Monitoring</h2>
          <div className="flex items-center gap-1.5 bg-green-500/10 border border-green-500/20 rounded-full px-3 py-1">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-green-400 text-xs font-medium">LIVE</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-gray-600 text-xs">Updated {format(lastUpdate, 'HH:mm:ss')}</span>
          <button onClick={fetchData} className="btn-secondary">
            <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Fleet-wide metrics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <MetricCard label="Avg Battery" value={avgBattery} unit="%" icon={<FiZap className="w-5 h-5" />} color="#10b981" trend={1.2} />
        <MetricCard label="Avg CPU" value={avgCpu} unit="%" icon={<FiCpu className="w-5 h-5" />} color="#06b6d4" trend={-3.1} />
        <MetricCard label="Avg Temp" value={avgTemp} unit="°C" icon={<FiThermometer className="w-5 h-5" />} color="#f97316" trend={0.8} />
        <MetricCard label="Robots Online" value={onlineRobots.length} unit="" icon={<FiWifi className="w-5 h-5" />} color="#22c55e" />
        <MetricCard label="Open Alerts" value={displayAlerts.length} unit="" icon={<FiAlertTriangle className="w-5 h-5" />} color="#eab308" />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Fleet Trend */}
        <div className="xl:col-span-2 card">
          <div className="flex items-center gap-2 mb-4">
            <FiActivity className="w-4 h-4 text-primary-400" />
            <h3 className="text-sm font-semibold text-white">Fleet Trends (5s updates)</h3>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="time" tick={{ fill: '#6b7280', fontSize: 10 }} interval={4} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} />
              <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="battery" stroke="#10b981" strokeWidth={2} dot={false} name="Battery %" />
              <Line type="monotone" dataKey="cpu" stroke="#06b6d4" strokeWidth={2} dot={false} name="CPU %" />
              <Line type="monotone" dataKey="temp" stroke="#f97316" strokeWidth={2} dot={false} name="Temp °C" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Battery by Robot */}
        <div className="card">
          <h3 className="text-sm font-semibold text-white mb-4">Battery by Robot</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={displayFleet.map((r) => ({ name: r.robot_name.split('-')[0], battery: Math.round(r.battery), status: r.status }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 10 }} />
              <YAxis domain={[0, 100]} tick={{ fill: '#6b7280', fontSize: 10 }} />
              <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }} />
              <Bar dataKey="battery" fill="#10b981" radius={[4, 4, 0, 0]}>
                {displayFleet.map((r) => (
                  <rect key={r.robot_id} fill={r.battery < 20 ? '#ef4444' : r.battery < 50 ? '#eab308' : '#10b981'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* CPU Chart */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="card">
          <h3 className="text-sm font-semibold text-white mb-4">CPU Usage by Robot</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={displayFleet.map((r) => ({ name: r.robot_name.split('-')[0], cpu: Math.round(r.cpu_usage) }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 10 }} />
              <YAxis domain={[0, 100]} tick={{ fill: '#6b7280', fontSize: 10 }} />
              <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }} />
              <Bar dataKey="cpu" fill="#06b6d4" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <h3 className="text-sm font-semibold text-white mb-4">Temperature by Robot</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={displayFleet.map((r) => ({ name: r.robot_name.split('-')[0], temp: Math.round(r.temperature) }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 10 }} />
              <YAxis domain={[0, 100]} tick={{ fill: '#6b7280', fontSize: 10 }} />
              <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }} />
              <Bar dataKey="temp" fill="#f97316" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Robot Status Table */}
      <div className="card overflow-hidden p-0">
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Robot Telemetry Table</h3>
          <span className="text-gray-500 text-xs">{displayFleet.length} robots</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full table-dark">
            <thead>
              <tr>
                {[
                  ['robot_name', 'Robot'],
                  ['status', 'Status'],
                  ['battery', 'Battery %'],
                  ['cpu_usage', 'CPU %'],
                  ['temperature', 'Temp °C'],
                  ['last_update', 'Last Update'],
                ].map(([field, label]) => (
                  <th key={field} onClick={() => handleSort(field as keyof FleetTelemetry)} className="cursor-pointer hover:text-white select-none">
                    <div className="flex items-center gap-1">
                      {label}
                      {sortField === field && <span className="text-primary-400">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedFleet.map((robot) => (
                <tr key={robot.robot_id}>
                  <td className="font-medium text-white">{robot.robot_name}</td>
                  <td><StatusBadge type="robot" value={robot.status} /></td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${robot.battery}%`, background: robot.battery < 20 ? '#ef4444' : robot.battery < 50 ? '#eab308' : '#10b981' }} />
                      </div>
                      <span className={`text-xs font-medium ${robot.battery < 20 ? 'text-red-400' : robot.battery < 50 ? 'text-yellow-400' : 'text-green-400'}`}>{robot.battery.toFixed(0)}%</span>
                    </div>
                  </td>
                  <td>
                    <span className={`text-sm font-medium ${robot.cpu_usage > 80 ? 'text-red-400' : robot.cpu_usage > 60 ? 'text-yellow-400' : 'text-gray-300'}`}>{robot.cpu_usage.toFixed(0)}%</span>
                  </td>
                  <td>
                    <span className={`text-sm font-medium ${robot.temperature > 70 ? 'text-red-400' : robot.temperature > 60 ? 'text-yellow-400' : 'text-gray-300'}`}>{robot.temperature.toFixed(0)}°C</span>
                  </td>
                  <td className="text-gray-500 text-xs font-mono">{format(new Date(robot.last_update), 'HH:mm:ss')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Alert Ticker */}
      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <FiAlertTriangle className="w-4 h-4 text-yellow-400" />
          <h3 className="text-sm font-semibold text-white">Recent Alerts</h3>
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse ml-1" />
        </div>
        <div className="space-y-2">
          {(alertTicker.length > 0 ? alertTicker : displayAlerts).map((alert) => (
            <div
              key={alert.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg border-l-2 text-sm"
              style={{ borderLeftColor: SEV_COLORS[alert.severity], background: `${SEV_COLORS[alert.severity]}08` }}
            >
              <span className="text-xs font-medium uppercase w-16 flex-shrink-0" style={{ color: SEV_COLORS[alert.severity] }}>{alert.severity}</span>
              <span className="text-cyan-400 text-xs font-medium w-20 flex-shrink-0 truncate">{alert.robot_name}</span>
              <span className="text-gray-300 flex-1 truncate">{alert.message}</span>
              <span className="text-gray-600 text-xs flex-shrink-0 font-mono">{format(new Date(alert.created_at), 'HH:mm:ss')}</span>
            </div>
          ))}
          {displayAlerts.length === 0 && alertTicker.length === 0 && (
            <p className="text-gray-600 text-sm text-center py-4">No active alerts</p>
          )}
        </div>
      </div>
    </div>
  )
}
