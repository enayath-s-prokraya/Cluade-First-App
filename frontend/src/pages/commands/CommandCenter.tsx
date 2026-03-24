import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  FiCpu, FiAlertOctagon, FiSend, FiZap, FiList, FiCode,
  FiMessageSquare, FiCheck, FiX, FiWifi, FiClock,
} from 'react-icons/fi'
import { robotsApi, commandsApi } from '../../services/api'
import { useSocket } from '../../services/socket'
import StatusBadge from '../../components/common/StatusBadge'
import type { Robot, Command } from '../../types'
import { format } from 'date-fns'

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_ROBOTS: Robot[] = [
  { id: 'r1', tenant_id: 't1', name: 'Alpha-7', type: 'humanoid', model: 'HX-3000', serial_number: 'SN-001', status: 'online', battery_level: 82, location_lat: null, location_lng: null, location_name: 'Warehouse A', firmware_version: '2.4.1', ip_address: '192.168.1.101', registered_at: '', last_seen: new Date().toISOString(), tags: [], metadata: {} },
  { id: 'r2', tenant_id: 't1', name: 'Beta-3', type: 'humanoid', model: 'HX-3000', serial_number: 'SN-002', status: 'online', battery_level: 67, location_lat: null, location_lng: null, location_name: 'Assembly Line B', firmware_version: '2.4.1', ip_address: '192.168.1.102', registered_at: '', last_seen: new Date().toISOString(), tags: [], metadata: {} },
  { id: 'r3', tenant_id: 't1', name: 'Gamma-1', type: 'wheeled', model: 'WB-500', serial_number: 'SN-003', status: 'maintenance', battery_level: 45, location_lat: null, location_lng: null, location_name: 'Maintenance Bay', firmware_version: '1.9.3', ip_address: null, registered_at: '', last_seen: new Date().toISOString(), tags: [], metadata: {} },
  { id: 'r4', tenant_id: 't1', name: 'Delta-9', type: 'drone', model: 'AV-200', serial_number: 'SN-004', status: 'offline', battery_level: 12, location_lat: null, location_lng: null, location_name: 'Charging Dock', firmware_version: '3.1.0', ip_address: null, registered_at: '', last_seen: new Date().toISOString(), tags: [], metadata: {} },
  { id: 'r5', tenant_id: 't1', name: 'Epsilon-2', type: 'arm', model: 'RA-100', serial_number: 'SN-005', status: 'online', battery_level: 91, location_lat: null, location_lng: null, location_name: 'Assembly Line A', firmware_version: '2.0.5', ip_address: '192.168.1.105', registered_at: '', last_seen: new Date().toISOString(), tags: [], metadata: {} },
]

const QUICK_COMMANDS = [
  { type: 'MOVE', label: 'Move', icon: '🚶', color: '#06b6d4', desc: 'Move to coordinates' },
  { type: 'STOP', label: 'Stop', icon: '⏹', color: '#6b7280', desc: 'Halt current action' },
  { type: 'NAVIGATE', label: 'Navigate', icon: '🗺', color: '#8b5cf6', desc: 'Navigate to waypoint' },
  { type: 'PICK', label: 'Pick', icon: '✊', color: '#10b981', desc: 'Pick up object' },
  { type: 'PLACE', label: 'Place', icon: '📦', color: '#f59e0b', desc: 'Place object down' },
  { type: 'CHARGE', label: 'Charge', icon: '🔋', color: '#22c55e', desc: 'Go to charging dock' },
  { type: 'RESTART', label: 'Restart', icon: '🔄', color: '#3b82f6', desc: 'Restart systems' },
  { type: 'EMERGENCY_STOP', label: 'E-STOP', icon: '🛑', color: '#ef4444', desc: 'Emergency halt' },
]

const PRIORITY_COLORS: Record<string, string> = {
  low: '#6b7280', normal: '#3b82f6', high: '#f59e0b', critical: '#ef4444',
}

// ─── Log entry type ───────────────────────────────────────────────────────────

interface LogEntry {
  id: string
  time: string
  robot: string
  type: string
  status: string
  message: string
}

type CmdTab = 'quick' | 'nlp' | 'custom'

export default function CommandCenter() {
  const [robots, setRobots] = useState<Robot[]>([])
  const [selectedRobots, setSelectedRobots] = useState<Set<string>>(new Set())
  const [cmdTab, setCmdTab] = useState<CmdTab>('quick')
  const [priority, setPriority] = useState('normal')
  const [customPayload, setCustomPayload] = useState('{\n  "action": "move",\n  "params": {}\n}')
  const [customType, setCustomType] = useState('CUSTOM')
  const [nlpText, setNlpText] = useState('')
  const [nlpParsed, setNlpParsed] = useState<Command | null>(null)
  const [nlpLoading, setNlpLoading] = useState(false)
  const [log, setLog] = useState<LogEntry[]>([])
  const [sending, setSending] = useState(false)
  const logEndRef = useRef<HTMLDivElement>(null)

  const fetchRobots = useCallback(async () => {
    try {
      const res = await robotsApi.getAll({ per_page: 50 })
      setRobots(res.data)
    } catch {
      setRobots(MOCK_ROBOTS)
    }
  }, [])

  useEffect(() => { fetchRobots() }, [fetchRobots])

  useSocket('command_update', (cmd) => {
    const robot = robots.find((r) => r.id === cmd.robot_id)
    addLog({
      robot: robot?.name || cmd.robot_id,
      type: cmd.type,
      status: cmd.status,
      message: `Command ${cmd.type} → ${cmd.status}`,
    })
  })

  const addLog = (entry: Omit<LogEntry, 'id' | 'time'>) => {
    setLog((prev) => [
      { ...entry, id: Math.random().toString(36).slice(2), time: format(new Date(), 'HH:mm:ss') },
      ...prev.slice(0, 49),
    ])
  }

  useEffect(() => {
    if (logEndRef.current) logEndRef.current.scrollIntoView({ behavior: 'smooth' })
  }, [log])

  const toggleRobot = (id: string) => {
    setSelectedRobots((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => setSelectedRobots(new Set(robots.filter((r) => r.status === 'online').map((r) => r.id)))
  const clearSelection = () => setSelectedRobots(new Set())

  const sendQuickCommand = async (type: string) => {
    if (selectedRobots.size === 0) { alert('Select at least one robot'); return }
    setSending(true)
    const ids = Array.from(selectedRobots)
    try {
      if (ids.length === 1) {
        await commandsApi.send({ robot_id: ids[0], type, payload: {}, priority })
      } else {
        await commandsApi.bulkSend({ robot_ids: ids, type, payload: {}, priority })
      }
      const robotNames = robots.filter((r) => selectedRobots.has(r.id)).map((r) => r.name).join(', ')
      addLog({ robot: robotNames, type, status: 'sent', message: `${type} sent to ${ids.length} robot(s)` })
    } catch {
      addLog({ robot: 'System', type, status: 'failed', message: `Failed to send ${type}` })
    } finally {
      setSending(false)
    }
  }

  const sendCustomCommand = async () => {
    if (selectedRobots.size === 0) { alert('Select at least one robot'); return }
    setSending(true)
    try {
      let payload = {}
      try { payload = JSON.parse(customPayload) } catch { payload = {} }
      const ids = Array.from(selectedRobots)
      if (ids.length === 1) {
        await commandsApi.send({ robot_id: ids[0], type: customType, payload, priority })
      } else {
        await commandsApi.bulkSend({ robot_ids: ids, type: customType, payload, priority })
      }
      const robotNames = robots.filter((r) => selectedRobots.has(r.id)).map((r) => r.name).join(', ')
      addLog({ robot: robotNames, type: customType, status: 'sent', message: `Custom command sent` })
    } catch {
      addLog({ robot: 'System', type: customType, status: 'failed', message: 'Failed to send custom command' })
    } finally {
      setSending(false)
    }
  }

  const parseNlp = async () => {
    if (!nlpText.trim()) return
    setNlpLoading(true)
    try {
      const robotId = selectedRobots.size === 1 ? Array.from(selectedRobots)[0] : undefined
      const result = await commandsApi.nlpCommand(nlpText, robotId)
      setNlpParsed(result)
    } catch {
      setNlpParsed({
        id: 'mock', robot_id: '', user_id: '', type: 'NAVIGATE', status: 'pending',
        payload: { destination: 'Zone B', speed: 'normal' }, priority: 'normal',
        sent_at: null, executed_at: null, completed_at: null, result: null, error_message: null,
      })
    } finally {
      setNlpLoading(false)
    }
  }

  const confirmNlp = async () => {
    if (!nlpParsed || selectedRobots.size === 0) return
    setSending(true)
    try {
      const ids = Array.from(selectedRobots)
      if (ids.length === 1) {
        await commandsApi.send({ robot_id: ids[0], type: nlpParsed.type, payload: nlpParsed.payload, priority })
      } else {
        await commandsApi.bulkSend({ robot_ids: ids, type: nlpParsed.type, payload: nlpParsed.payload, priority })
      }
      addLog({ robot: 'Fleet', type: nlpParsed.type, status: 'sent', message: `NLP command: "${nlpText}"` })
      setNlpParsed(null)
      setNlpText('')
    } catch {
      addLog({ robot: 'System', type: 'NLP', status: 'failed', message: 'Failed to send NLP command' })
    } finally {
      setSending(false)
    }
  }

  const emergencyStopAll = async () => {
    if (!window.confirm('Send EMERGENCY STOP to ALL online robots?')) return
    const onlineIds = robots.filter((r) => r.status === 'online').map((r) => r.id)
    if (onlineIds.length === 0) return
    try {
      await commandsApi.bulkSend({ robot_ids: onlineIds, type: 'EMERGENCY_STOP', payload: {}, priority: 'critical' })
      addLog({ robot: 'ALL ROBOTS', type: 'EMERGENCY_STOP', status: 'sent', message: `Emergency stop sent to ${onlineIds.length} robots` })
    } catch {
      addLog({ robot: 'System', type: 'EMERGENCY_STOP', status: 'failed', message: 'Emergency stop failed' })
    }
  }

  return (
    <div className="flex flex-col h-full space-y-0">
      {/* Header */}
      <div className="flex items-center justify-between p-5 pb-4">
        <div>
          <h2 className="text-xl font-bold text-white">Command Center</h2>
          <p className="text-gray-500 text-sm">{selectedRobots.size} robot{selectedRobots.size !== 1 ? 's' : ''} selected</p>
        </div>
        <button onClick={emergencyStopAll} className="btn-danger">
          <FiAlertOctagon className="w-4 h-4" />
          Emergency Stop All
        </button>
      </div>

      <div className="flex flex-1 gap-4 px-5 pb-5 min-h-0">
        {/* Left Panel: Robot Selector */}
        <div className="w-72 flex-shrink-0 card flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white">Robot Fleet</h3>
            <div className="flex gap-2">
              <button onClick={selectAll} className="text-xs text-primary-400 hover:text-primary-300">All</button>
              <span className="text-gray-600">·</span>
              <button onClick={clearSelection} className="text-xs text-gray-500 hover:text-gray-300">Clear</button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2">
            {robots.map((robot) => {
              const isSelected = selectedRobots.has(robot.id)
              const isDisabled = robot.status === 'offline'
              return (
                <button
                  key={robot.id}
                  onClick={() => !isDisabled && toggleRobot(robot.id)}
                  disabled={isDisabled}
                  className={`w-full text-left p-3 rounded-lg border transition-all duration-150 ${
                    isSelected
                      ? 'bg-primary-600/15 border-primary-600/40'
                      : isDisabled
                      ? 'opacity-40 bg-dark-800/30 border-gray-800 cursor-not-allowed'
                      : 'bg-dark-800/50 border-gray-800 hover:border-gray-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                        isSelected ? 'bg-primary-600 border-primary-600' : 'border-gray-600'
                      }`}>
                        {isSelected && <FiCheck className="w-2.5 h-2.5 text-white" />}
                      </div>
                      <span className="text-sm font-medium text-white">{robot.name}</span>
                    </div>
                    <StatusBadge type="robot" value={robot.status} />
                  </div>
                  <div className="pl-6 text-xs text-gray-500 flex items-center gap-3">
                    <span className="capitalize">{robot.type}</span>
                    <span className="flex items-center gap-1">
                      <FiWifi className="w-3 h-3" />
                      {robot.battery_level}%
                    </span>
                  </div>
                  {robot.location_name && (
                    <p className="pl-6 text-xs text-gray-600 mt-0.5 truncate">{robot.location_name}</p>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Right Panel: Command Interface */}
        <div className="flex-1 flex flex-col gap-4 min-w-0">
          {/* Priority + Tab selector */}
          <div className="card flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-gray-500 text-sm">Priority:</span>
              {['low', 'normal', 'high', 'critical'].map((p) => (
                <button
                  key={p}
                  onClick={() => setPriority(p)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all capitalize ${
                    priority === p ? 'text-white border-transparent' : 'text-gray-400 border-gray-700 hover:border-gray-600'
                  }`}
                  style={priority === p ? { background: PRIORITY_COLORS[p], borderColor: PRIORITY_COLORS[p] } : {}}
                >
                  {p}
                </button>
              ))}
            </div>
            <div className="ml-auto flex gap-1 border border-gray-700 rounded-lg overflow-hidden">
              {([['quick', FiZap, 'Quick'], ['nlp', FiMessageSquare, 'NLP'], ['custom', FiCode, 'Custom']] as [CmdTab, React.ElementType, string][]).map(([id, Icon, label]) => (
                <button
                  key={id}
                  onClick={() => setCmdTab(id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors ${
                    cmdTab === id ? 'bg-primary-600 text-white' : 'text-gray-400 hover:text-gray-300'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Quick Commands */}
          {cmdTab === 'quick' && (
            <div className="card">
              <h3 className="text-sm font-semibold text-white mb-4">Quick Commands</h3>
              <div className="grid grid-cols-4 gap-3">
                {QUICK_COMMANDS.map((cmd) => (
                  <button
                    key={cmd.type}
                    onClick={() => sendQuickCommand(cmd.type)}
                    disabled={sending || selectedRobots.size === 0}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed hover:scale-105 ${
                      cmd.type === 'EMERGENCY_STOP'
                        ? 'border-red-500/30 bg-red-500/10 hover:bg-red-500/20'
                        : 'border-gray-700 bg-dark-800/50 hover:border-gray-600'
                    }`}
                  >
                    <span className="text-2xl">{cmd.icon}</span>
                    <span className="text-xs font-semibold text-white">{cmd.label}</span>
                    <span className="text-gray-600 text-xs text-center leading-tight">{cmd.desc}</span>
                  </button>
                ))}
              </div>
              {selectedRobots.size === 0 && (
                <p className="text-center text-gray-600 text-sm mt-4">← Select robots to enable commands</p>
              )}
            </div>
          )}

          {/* NLP Commands */}
          {cmdTab === 'nlp' && (
            <div className="card space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-white mb-1">Natural Language Commands</h3>
                <p className="text-gray-500 text-xs">Describe what you want the robot to do in plain English</p>
              </div>
              <textarea
                value={nlpText}
                onChange={(e) => setNlpText(e.target.value)}
                rows={4}
                placeholder="e.g. Navigate to zone B and pick up the red box, then bring it to the charging area..."
                className="input-dark resize-none"
              />
              <button onClick={parseNlp} disabled={nlpLoading || !nlpText.trim()} className="btn-secondary">
                {nlpLoading ? <span className="w-4 h-4 border-2 border-gray-400/30 border-t-gray-400 rounded-full animate-spin" /> : <FiMessageSquare className="w-4 h-4" />}
                {nlpLoading ? 'Parsing...' : 'Parse Command'}
              </button>
              {nlpParsed && (
                <div className="bg-dark-800 rounded-xl border border-gray-700 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <FiCheck className="w-4 h-4 text-green-400" />
                    <span className="text-sm font-medium text-green-400">Command Parsed</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-dark-900 rounded p-2">
                      <span className="text-gray-500">Type: </span>
                      <span className="text-white font-mono">{nlpParsed.type}</span>
                    </div>
                    <div className="bg-dark-900 rounded p-2">
                      <span className="text-gray-500">Priority: </span>
                      <span className="text-white capitalize">{nlpParsed.priority}</span>
                    </div>
                  </div>
                  <pre className="bg-dark-900 rounded p-3 text-xs text-cyan-300 font-mono overflow-x-auto">
                    {JSON.stringify(nlpParsed.payload, null, 2)}
                  </pre>
                  <div className="flex gap-2">
                    <button onClick={confirmNlp} disabled={sending || selectedRobots.size === 0} className="btn-primary flex-1 justify-center">
                      <FiSend className="w-4 h-4" /> Confirm & Send
                    </button>
                    <button onClick={() => setNlpParsed(null)} className="btn-secondary">
                      <FiX className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Custom Commands */}
          {cmdTab === 'custom' && (
            <div className="card space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-white mb-1">Custom Command</h3>
                <p className="text-gray-500 text-xs">Send a raw JSON payload command</p>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Command Type</label>
                <select value={customType} onChange={(e) => setCustomType(e.target.value)} className="input-dark">
                  {['MOVE','STOP','NAVIGATE','PICK','PLACE','CHARGE','RESTART','UPDATE_FIRMWARE','CUSTOM'].map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">JSON Payload</label>
                <textarea
                  value={customPayload}
                  onChange={(e) => setCustomPayload(e.target.value)}
                  rows={8}
                  className="input-dark font-mono text-xs"
                />
              </div>
              <button onClick={sendCustomCommand} disabled={sending || selectedRobots.size === 0} className="btn-primary">
                {sending ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <FiSend className="w-4 h-4" />}
                {sending ? 'Sending...' : `Send to ${selectedRobots.size} Robot${selectedRobots.size !== 1 ? 's' : ''}`}
              </button>
            </div>
          )}

          {/* Command Log */}
          <div className="card flex-1 min-h-0 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <FiList className="w-4 h-4 text-gray-500" />
                <h3 className="text-sm font-semibold text-white">Command Log</h3>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-gray-600 text-xs">Live</span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
              {log.length === 0 ? (
                <div className="text-center text-gray-600 text-sm py-8">No commands sent yet</div>
              ) : log.map((entry) => (
                <div key={entry.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-dark-800/40 text-xs">
                  <span className="text-gray-600 font-mono flex-shrink-0 w-16">{entry.time}</span>
                  <span className="text-cyan-400 font-medium flex-shrink-0 w-20 truncate">{entry.robot}</span>
                  <span className="font-mono bg-gray-800 px-1.5 py-0.5 rounded text-gray-300 flex-shrink-0">{entry.type}</span>
                  <span className={`flex-shrink-0 ${
                    entry.status === 'sent' || entry.status === 'completed' ? 'text-green-400' :
                    entry.status === 'failed' ? 'text-red-400' : 'text-yellow-400'
                  }`}>{entry.status}</span>
                  <span className="text-gray-500 truncate">{entry.message}</span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
