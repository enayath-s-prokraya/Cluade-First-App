import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  FiArrowLeft, FiCpu, FiAlertTriangle, FiZap, FiActivity,
  FiBattery, FiThermometer, FiWifi, FiMapPin, FiClock,
  FiRefreshCw, FiAlertOctagon, FiTool, FiSend,
} from 'react-icons/fi'
import { robotsApi, commandsApi, alertsApi } from '../../services/api'
import { useSocket } from '../../services/socket'
import StatusBadge from '../../components/common/StatusBadge'
import LoadingSpinner from '../../components/common/LoadingSpinner'
import type { Robot, Telemetry, Command, Alert } from '../../types'
import { format, formatDistanceToNow } from 'date-fns'

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_ROBOT: Robot = {
  id: 'r1', tenant_id: 't1', name: 'Alpha-7', type: 'humanoid', model: 'HX-3000',
  serial_number: 'SN-HX-001', status: 'online', battery_level: 78,
  location_lat: 37.7749, location_lng: -122.4194, location_name: 'Warehouse A',
  firmware_version: '2.4.1', ip_address: '192.168.1.101',
  registered_at: '2024-01-15T10:00:00Z', last_seen: new Date(Date.now() - 30000).toISOString(),
  tags: ['assembly', 'primary'], metadata: {},
}

const genTelemetry = (n = 30): Telemetry[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `t${i}`, robot_id: 'r1',
    timestamp: new Date(Date.now() - (n - i) * 60000).toISOString(),
    battery: 70 + Math.sin(i * 0.3) * 10 + Math.random() * 5,
    cpu_usage: 40 + Math.cos(i * 0.2) * 20 + Math.random() * 10,
    memory_usage: 55 + Math.sin(i * 0.15) * 15 + Math.random() * 5,
    temperature: 45 + Math.cos(i * 0.25) * 8 + Math.random() * 4,
    speed: Math.random() * 2,
    payload_weight: Math.random() * 5,
    joint_temps: {},
    network_latency: 10 + Math.random() * 30,
    error_codes: [],
  }))

const MOCK_COMMANDS: Command[] = [
  { id: 'c1', robot_id: 'r1', user_id: 'u1', type: 'NAVIGATE', payload: { destination: 'Zone B' }, status: 'completed', priority: 'normal', sent_at: new Date(Date.now() - 300000).toISOString(), executed_at: new Date(Date.now() - 295000).toISOString(), completed_at: new Date(Date.now() - 240000).toISOString(), result: { distance: '45m' }, error_message: null },
  { id: 'c2', robot_id: 'r1', user_id: 'u1', type: 'PICK', payload: { item: 'box_034' }, status: 'executing', priority: 'high', sent_at: new Date(Date.now() - 60000).toISOString(), executed_at: new Date(Date.now() - 55000).toISOString(), completed_at: null, result: null, error_message: null },
  { id: 'c3', robot_id: 'r1', user_id: 'u1', type: 'MOVE', payload: { x: 10, y: 5 }, status: 'failed', priority: 'normal', sent_at: new Date(Date.now() - 600000).toISOString(), executed_at: new Date(Date.now() - 595000).toISOString(), completed_at: null, result: null, error_message: 'Path blocked' },
]

const MOCK_ALERTS: Alert[] = [
  { id: 'a1', robot_id: 'r1', tenant_id: 't1', type: 'LOW_BATTERY', severity: 'warning', message: 'Battery below 20% threshold', status: 'open', acknowledged_by: null, created_at: new Date(Date.now() - 3600000).toISOString(), resolved_at: null },
  { id: 'a2', robot_id: 'r1', tenant_id: 't1', type: 'HIGH_TEMP', severity: 'error', message: 'CPU temperature exceeded 75°C', status: 'acknowledged', acknowledged_by: 'admin', created_at: new Date(Date.now() - 7200000).toISOString(), resolved_at: null },
]

// ─── Gauge Component ──────────────────────────────────────────────────────────

function GaugeBar({ label, value, max, unit, color }: { label: string; value: number; max: number; unit: string; color: string }) {
  const pct = Math.min(100, (value / max) * 100)
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-400">{label}</span>
        <span className="font-medium" style={{ color }}>{value.toFixed(0)}{unit}</span>
      </div>
      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

// ─── Tab types ────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'telemetry' | 'commands' | 'alerts'

export default function RobotDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('overview')
  const [robot, setRobot] = useState<Robot | null>(null)
  const [telemetry, setTelemetry] = useState<Telemetry[]>([])
  const [commands, setCommands] = useState<Command[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState('1h')
  const [cmdType, setCmdType] = useState('MOVE')
  const [cmdPayload, setCmdPayload] = useState('{}')
  const [cmdPriority, setCmdPriority] = useState('normal')
  const [sending, setSending] = useState(false)
  const [cmdMsg, setCmdMsg] = useState('')

  const fetchRobot = useCallback(async () => {
    if (!id) return
    try {
      const [r, t, c, a] = await Promise.allSettled([
        robotsApi.getById(id),
        robotsApi.getTelemetry(id, timeRange),
        commandsApi.getAll({ robot_id: id, per_page: 20 }),
        alertsApi.getAll({ robot_id: id, per_page: 20 }),
      ])
      if (r.status === 'fulfilled') setRobot(r.value)
      if (t.status === 'fulfilled') setTelemetry(t.value)
      if (c.status === 'fulfilled') setCommands(c.value.data)
      if (a.status === 'fulfilled') setAlerts(a.value.data)
    } catch {
      setRobot(MOCK_ROBOT)
      setTelemetry(genTelemetry())
      setCommands(MOCK_COMMANDS)
      setAlerts(MOCK_ALERTS)
    } finally {
      setLoading(false)
    }
  }, [id, timeRange])

  useEffect(() => { fetchRobot() }, [fetchRobot])

  useSocket('telemetry_update', (data) => {
    if (data.robot_id !== id) return
    setTelemetry((prev) => [...prev.slice(-59), data])
  })

  useSocket('robot_status_change', (evt) => {
    if (evt.robot_id !== id) return
    setRobot((prev) => prev ? { ...prev, status: evt.status } : prev)
  })

  const displayRobot = robot || MOCK_ROBOT
  const displayTelemetry = telemetry.length > 0 ? telemetry : genTelemetry()
  const displayCommands = commands.length > 0 ? commands : MOCK_COMMANDS
  const displayAlerts = alerts.length > 0 ? alerts : MOCK_ALERTS

  const latestTelemetry = displayTelemetry[displayTelemetry.length - 1]

  const chartData = displayTelemetry.map((t) => ({
    time: format(new Date(t.timestamp), 'HH:mm'),
    Battery: Math.round(t.battery),
    CPU: Math.round(t.cpu_usage),
    Memory: Math.round(t.memory_usage),
    Temp: Math.round(t.temperature),
  }))

  const sendCommand = async () => {
    if (!id) return
    setSending(true)
    setCmdMsg('')
    try {
      let payload = {}
      try { payload = JSON.parse(cmdPayload) } catch { payload = {} }
      await commandsApi.send({ robot_id: id, type: cmdType, payload, priority: cmdPriority })
      setCmdMsg('Command sent successfully!')
      fetchRobot()
    } catch {
      setCmdMsg('Failed to send command. Check connection.')
    } finally {
      setSending(false)
    }
  }

  const emergencyStop = async () => {
    if (!id) return
    try {
      await commandsApi.send({ robot_id: id, type: 'EMERGENCY_STOP', payload: {}, priority: 'critical' })
      alert('Emergency stop command sent!')
    } catch {
      alert('Failed to send emergency stop. Check connection.')
    }
  }

  const acknowledgeAlert = async (alertId: string) => {
    try {
      await alertsApi.acknowledge(alertId)
      setAlerts((prev) => prev.map((a) => a.id === alertId ? { ...a, status: 'acknowledged' } : a))
    } catch { /* ignore */ }
  }

  const resolveAlert = async (alertId: string) => {
    try {
      await alertsApi.resolve(alertId)
      setAlerts((prev) => prev.map((a) => a.id === alertId ? { ...a, status: 'resolved' } : a))
    } catch { /* ignore */ }
  }

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <FiCpu className="w-4 h-4" /> },
    { id: 'telemetry', label: 'Telemetry', icon: <FiActivity className="w-4 h-4" /> },
    { id: 'commands', label: 'Commands', icon: <FiSend className="w-4 h-4" /> },
    { id: 'alerts', label: 'Alerts', icon: <FiAlertTriangle className="w-4 h-4" /> },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner label="Loading robot details..." />
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/robots')} className="p-2 text-gray-400 hover:text-white hover:bg-dark-800 rounded-lg transition-colors">
          <FiArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-white">{displayRobot.name}</h2>
            <StatusBadge type="robot" value={displayRobot.status} />
          </div>
          <p className="text-gray-500 text-sm">{displayRobot.model} · {displayRobot.serial_number}</p>
        </div>
        <button
          onClick={emergencyStop}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-600/30 hover:border-red-500/50 font-medium text-sm transition-all"
        >
          <FiAlertOctagon className="w-4 h-4" />
          Emergency Stop
        </button>
        <button onClick={fetchRobot} className="btn-secondary">
          <FiRefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-800">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.id
                ? 'text-primary-400 border-primary-500'
                : 'text-gray-500 border-transparent hover:text-gray-300'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Robot Info */}
          <div className="card space-y-4">
            <h3 className="text-sm font-semibold text-white mb-1">Robot Information</h3>
            {[
              { label: 'Type', value: displayRobot.type, icon: <FiCpu className="w-3.5 h-3.5" /> },
              { label: 'Model', value: displayRobot.model, icon: <FiCpu className="w-3.5 h-3.5" /> },
              { label: 'Serial Number', value: displayRobot.serial_number, icon: null },
              { label: 'Firmware', value: displayRobot.firmware_version, icon: null },
              { label: 'IP Address', value: displayRobot.ip_address || 'N/A', icon: <FiWifi className="w-3.5 h-3.5" /> },
              { label: 'Location', value: displayRobot.location_name || 'Unknown', icon: <FiMapPin className="w-3.5 h-3.5" /> },
              { label: 'Registered', value: format(new Date(displayRobot.registered_at), 'MMM d, yyyy'), icon: <FiClock className="w-3.5 h-3.5" /> },
              { label: 'Last Seen', value: displayRobot.last_seen ? formatDistanceToNow(new Date(displayRobot.last_seen), { addSuffix: true }) : 'Never', icon: <FiClock className="w-3.5 h-3.5" /> },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between py-1 border-b border-gray-800/50 last:border-0">
                <span className="text-gray-500 text-sm">{label}</span>
                <span className="text-gray-200 text-sm font-medium font-mono">{String(value)}</span>
              </div>
            ))}
            {displayRobot.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {displayRobot.tags.map((tag) => (
                  <span key={tag} className="px-2 py-0.5 rounded bg-primary-600/10 border border-primary-600/20 text-primary-400 text-xs">{tag}</span>
                ))}
              </div>
            )}
          </div>

          {/* Live Metrics */}
          <div className="space-y-4">
            <div className="card space-y-4">
              <h3 className="text-sm font-semibold text-white">Live Metrics</h3>
              {latestTelemetry && (
                <>
                  <GaugeBar label="Battery" value={latestTelemetry.battery} max={100} unit="%" color="#10b981" />
                  <GaugeBar label="CPU Usage" value={latestTelemetry.cpu_usage} max={100} unit="%" color="#06b6d4" />
                  <GaugeBar label="Memory" value={latestTelemetry.memory_usage} max={100} unit="%" color="#8b5cf6" />
                  <GaugeBar label="Temperature" value={latestTelemetry.temperature} max={100} unit="°C" color="#f97316" />
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <div className="bg-dark-800 rounded-lg p-3 text-center">
                      <p className="text-gray-500 text-xs">Speed</p>
                      <p className="text-white font-bold text-lg">{latestTelemetry.speed.toFixed(1)} <span className="text-xs font-normal text-gray-500">m/s</span></p>
                    </div>
                    <div className="bg-dark-800 rounded-lg p-3 text-center">
                      <p className="text-gray-500 text-xs">Network</p>
                      <p className="text-white font-bold text-lg">{latestTelemetry.network_latency.toFixed(0)} <span className="text-xs font-normal text-gray-500">ms</span></p>
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setTab('commands')} className="btn-primary flex-1 justify-center">
                <FiSend className="w-4 h-4" /> Send Command
              </button>
              <button onClick={() => setTab('alerts')} className="btn-secondary flex-1 justify-center">
                <FiAlertTriangle className="w-4 h-4" /> View Alerts
              </button>
            </div>
            <button className="btn-secondary w-full justify-center">
              <FiTool className="w-4 h-4" /> Schedule Maintenance
            </button>
          </div>
        </div>
      )}

      {/* Telemetry Tab */}
      {tab === 'telemetry' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            {['1h', '6h', '24h', '7d'].map((r) => (
              <button
                key={r}
                onClick={() => setTimeRange(r)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  timeRange === r ? 'bg-primary-600 text-white' : 'btn-secondary'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <div className="card">
            <h3 className="text-sm font-semibold text-white mb-4">Telemetry History</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="time" tick={{ fill: '#6b7280', fontSize: 11 }} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }} labelStyle={{ color: '#e5e7eb' }} />
                <Legend wrapperStyle={{ fontSize: 12, color: '#9ca3af' }} />
                <Line type="monotone" dataKey="Battery" stroke="#10b981" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="CPU" stroke="#06b6d4" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Memory" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Temp" stroke="#f97316" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="card overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full table-dark">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Battery %</th>
                    <th>CPU %</th>
                    <th>Memory %</th>
                    <th>Temp °C</th>
                    <th>Speed m/s</th>
                    <th>Latency ms</th>
                  </tr>
                </thead>
                <tbody>
                  {displayTelemetry.slice(-10).reverse().map((t) => (
                    <tr key={t.id}>
                      <td className="font-mono text-xs">{format(new Date(t.timestamp), 'HH:mm:ss')}</td>
                      <td><span className={t.battery < 20 ? 'text-red-400' : t.battery < 50 ? 'text-yellow-400' : 'text-green-400'}>{t.battery.toFixed(1)}</span></td>
                      <td>{t.cpu_usage.toFixed(1)}</td>
                      <td>{t.memory_usage.toFixed(1)}</td>
                      <td><span className={t.temperature > 70 ? 'text-red-400' : t.temperature > 60 ? 'text-yellow-400' : 'text-gray-300'}>{t.temperature.toFixed(1)}</span></td>
                      <td>{t.speed.toFixed(2)}</td>
                      <td>{t.network_latency.toFixed(0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Commands Tab */}
      {tab === 'commands' && (
        <div className="space-y-4">
          {/* Send Command Form */}
          <div className="card space-y-4">
            <h3 className="text-sm font-semibold text-white">Send Command</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Command Type</label>
                <select value={cmdType} onChange={(e) => setCmdType(e.target.value)} className="input-dark">
                  {['MOVE','STOP','NAVIGATE','PICK','PLACE','CHARGE','RESTART','EMERGENCY_STOP','CUSTOM'].map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Priority</label>
                <select value={cmdPriority} onChange={(e) => setCmdPriority(e.target.value)} className="input-dark">
                  {['low','normal','high','critical'].map((p) => (
                    <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Payload (JSON)</label>
              <textarea
                value={cmdPayload}
                onChange={(e) => setCmdPayload(e.target.value)}
                rows={3}
                className="input-dark font-mono text-xs"
                placeholder='{}'
              />
            </div>
            {cmdMsg && (
              <div className={`text-sm px-3 py-2 rounded-lg ${cmdMsg.includes('success') ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                {cmdMsg}
              </div>
            )}
            <button onClick={sendCommand} disabled={sending} className="btn-primary">
              {sending ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <FiSend className="w-4 h-4" />}
              {sending ? 'Sending...' : 'Send Command'}
            </button>
          </div>

          {/* Command History */}
          <div className="card overflow-hidden p-0">
            <div className="p-4 border-b border-gray-800">
              <h3 className="text-sm font-semibold text-white">Command History</h3>
            </div>
            <table className="w-full table-dark">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Sent</th>
                  <th>Completed</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {displayCommands.map((cmd) => (
                  <tr key={cmd.id}>
                    <td><span className="font-mono text-xs bg-gray-800 px-2 py-0.5 rounded">{cmd.type}</span></td>
                    <td><StatusBadge type="command" value={cmd.status} /></td>
                    <td>
                      <span className={`text-xs font-medium capitalize ${
                        cmd.priority === 'critical' ? 'text-red-400' :
                        cmd.priority === 'high' ? 'text-orange-400' :
                        cmd.priority === 'normal' ? 'text-blue-400' : 'text-gray-400'
                      }`}>{cmd.priority}</span>
                    </td>
                    <td className="text-xs text-gray-500">{cmd.sent_at ? format(new Date(cmd.sent_at), 'HH:mm:ss') : '—'}</td>
                    <td className="text-xs text-gray-500">{cmd.completed_at ? format(new Date(cmd.completed_at), 'HH:mm:ss') : '—'}</td>
                    <td className="text-xs">{cmd.error_message ? <span className="text-red-400">{cmd.error_message}</span> : cmd.result ? <span className="text-green-400">OK</span> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Alerts Tab */}
      {tab === 'alerts' && (
        <div className="space-y-3">
          {displayAlerts.length === 0 ? (
            <div className="card text-center py-12 text-gray-500">No alerts for this robot</div>
          ) : displayAlerts.map((alert) => {
            const sevColors: Record<string, string> = { critical: '#ef4444', error: '#f97316', warning: '#eab308', info: '#3b82f6' }
            const c = sevColors[alert.severity] || '#6b7280'
            return (
              <div key={alert.id} className="card border-l-4" style={{ borderLeftColor: c }}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <FiAlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: c }} />
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium uppercase" style={{ color: c }}>{alert.severity}</span>
                        <span className="text-gray-600 text-xs">·</span>
                        <span className="text-gray-500 text-xs">{alert.type}</span>
                      </div>
                      <p className="text-gray-200 text-sm">{alert.message}</p>
                      <p className="text-gray-500 text-xs mt-1">{formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <StatusBadge type="alert" value={alert.status} />
                    {alert.status === 'open' && (
                      <button onClick={() => acknowledgeAlert(alert.id)} className="text-xs px-2 py-1 rounded bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 border border-yellow-500/20 transition-colors">Ack</button>
                    )}
                    {alert.status !== 'resolved' && (
                      <button onClick={() => resolveAlert(alert.id)} className="text-xs px-2 py-1 rounded bg-green-500/10 text-green-400 hover:bg-green-500/20 border border-green-500/20 transition-colors">Resolve</button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
