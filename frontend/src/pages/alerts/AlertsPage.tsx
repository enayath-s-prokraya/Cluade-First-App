import React, { useState, useEffect, useCallback } from 'react'
import {
  FiAlertTriangle, FiAlertOctagon, FiInfo, FiAlertCircle,
  FiCheck, FiCheckCircle, FiRefreshCw, FiChevronDown, FiChevronUp,
  FiFilter,
} from 'react-icons/fi'
import { alertsApi } from '../../services/api'
import { useSocket } from '../../services/socket'
import type { Alert, AlertSeverity, AlertStatus } from '../../types'
import { formatDistanceToNow, format } from 'date-fns'

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_ALERTS: Alert[] = [
  { id: 'a1', robot_id: 'r7', tenant_id: 't1', type: 'HIGH_CPU', severity: 'critical', message: 'Eta-11 CPU usage at 95% — possible runaway process detected in motor control module', status: 'open', acknowledged_by: null, created_at: new Date(Date.now() - 60000).toISOString(), resolved_at: null, robot_name: 'Eta-11' },
  { id: 'a2', robot_id: 'r7', tenant_id: 't1', type: 'HIGH_TEMP', severity: 'error', message: 'Temperature critical: 78°C — cooling system may be failing', status: 'open', acknowledged_by: null, created_at: new Date(Date.now() - 120000).toISOString(), resolved_at: null, robot_name: 'Eta-11' },
  { id: 'a3', robot_id: 'r1', tenant_id: 't1', type: 'LOW_BATTERY', severity: 'warning', message: 'Battery level at 18% — robot will shut down in approximately 45 minutes', status: 'acknowledged', acknowledged_by: 'admin', created_at: new Date(Date.now() - 300000).toISOString(), resolved_at: null, robot_name: 'Alpha-7' },
  { id: 'a4', robot_id: 'r4', tenant_id: 't1', type: 'NETWORK_LOSS', severity: 'warning', message: 'Delta-9 experiencing intermittent connection drops (15% packet loss)', status: 'open', acknowledged_by: null, created_at: new Date(Date.now() - 900000).toISOString(), resolved_at: null, robot_name: 'Delta-9' },
  { id: 'a5', robot_id: 'r2', tenant_id: 't1', type: 'TASK_FAILED', severity: 'info', message: 'Assembly task #1089 timed out after 30 minutes. Retry scheduled.', status: 'resolved', acknowledged_by: null, created_at: new Date(Date.now() - 1800000).toISOString(), resolved_at: new Date(Date.now() - 600000).toISOString(), robot_name: 'Beta-3' },
  { id: 'a6', robot_id: 'r3', tenant_id: 't1', type: 'MOTOR_FAULT', severity: 'critical', message: 'Left knee servo fault — robot immobilized for safety', status: 'open', acknowledged_by: null, created_at: new Date(Date.now() - 3600000).toISOString(), resolved_at: null, robot_name: 'Gamma-1' },
  { id: 'a7', robot_id: 'r5', tenant_id: 't1', type: 'FIRMWARE_UPDATE', severity: 'info', message: 'Firmware v2.5.0 available for Epsilon-2. Current: v2.0.5', status: 'resolved', acknowledged_by: 'admin', created_at: new Date(Date.now() - 7200000).toISOString(), resolved_at: new Date(Date.now() - 3600000).toISOString(), robot_name: 'Epsilon-2' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SEV_CONFIG: Record<AlertSeverity, { color: string; bg: string; icon: React.ReactNode; borderColor: string }> = {
  critical: { color: '#ef4444', bg: '#ef444410', borderColor: '#ef4444', icon: <FiAlertOctagon className="w-4 h-4" /> },
  error:    { color: '#f97316', bg: '#f9731610', borderColor: '#f97316', icon: <FiAlertCircle className="w-4 h-4" /> },
  warning:  { color: '#eab308', bg: '#eab30810', borderColor: '#eab308', icon: <FiAlertTriangle className="w-4 h-4" /> },
  info:     { color: '#3b82f6', bg: '#3b82f610', borderColor: '#3b82f6', icon: <FiInfo className="w-4 h-4" /> },
}

type AlertTab = 'all' | AlertSeverity | AlertStatus

const TABS: { id: AlertTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'critical', label: 'Critical' },
  { id: 'warning', label: 'Warning' },
  { id: 'info', label: 'Info' },
  { id: 'open', label: 'Open' },
  { id: 'acknowledged', label: 'Acknowledged' },
  { id: 'resolved', label: 'Resolved' },
]

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<AlertTab>('all')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [newAlertIds, setNewAlertIds] = useState<Set<string>>(new Set())

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await alertsApi.getAll({ per_page: 50 })
      setAlerts(res.data)
    } catch {
      setAlerts(MOCK_ALERTS)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAlerts() }, [fetchAlerts])

  useSocket('alert_triggered', (alert) => {
    setAlerts((prev) => [alert, ...prev])
    setNewAlertIds((prev) => new Set([...prev, alert.id]))
    setTimeout(() => setNewAlertIds((prev) => { const n = new Set(prev); n.delete(alert.id); return n }), 3000)
  })

  const displayAlerts = (alerts.length > 0 ? alerts : MOCK_ALERTS).filter((a) => {
    if (activeTab === 'all') return true
    if (['critical', 'error', 'warning', 'info'].includes(activeTab)) return a.severity === activeTab
    if (['open', 'acknowledged', 'resolved'].includes(activeTab)) return a.status === activeTab
    return true
  })

  const allAlerts = alerts.length > 0 ? alerts : MOCK_ALERTS
  const stats = {
    total: allAlerts.length,
    critical: allAlerts.filter((a) => a.severity === 'critical').length,
    warning: allAlerts.filter((a) => a.severity === 'warning').length,
    unacked: allAlerts.filter((a) => a.status === 'open').length,
  }

  const toggleExpand = (id: string) => {
    setExpanded((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  const toggleSelect = (id: string) => {
    setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  const acknowledge = async (id: string) => {
    try {
      await alertsApi.acknowledge(id)
      setAlerts((prev) => prev.map((a) => a.id === id ? { ...a, status: 'acknowledged' } : a))
    } catch {
      setAlerts((prev) => prev.map((a) => a.id === id ? { ...a, status: 'acknowledged' } : a))
    }
  }

  const resolve = async (id: string) => {
    try {
      await alertsApi.resolve(id)
      setAlerts((prev) => prev.map((a) => a.id === id ? { ...a, status: 'resolved', resolved_at: new Date().toISOString() } : a))
    } catch {
      setAlerts((prev) => prev.map((a) => a.id === id ? { ...a, status: 'resolved', resolved_at: new Date().toISOString() } : a))
    }
  }

  const acknowledgeAll = async () => {
    const openAlerts = displayAlerts.filter((a) => a.status === 'open')
    for (const alert of openAlerts) await acknowledge(alert.id)
  }

  const resolveSelected = async () => {
    for (const id of selected) await resolve(id)
    setSelected(new Set())
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Alerts</h2>
          <p className="text-gray-500 text-sm">Monitor and manage fleet alerts</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchAlerts} className="btn-secondary">
            <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Alerts', value: stats.total, color: '#6b7280' },
          { label: 'Critical', value: stats.critical, color: '#ef4444' },
          { label: 'Warning', value: stats.warning, color: '#eab308' },
          { label: 'Unacknowledged', value: stats.unacked, color: '#f97316' },
        ].map((s) => (
          <div key={s.label} className="card flex items-center gap-3">
            <div className="w-3 h-10 rounded-full" style={{ background: s.color }} />
            <div>
              <p className="text-gray-500 text-xs">{s.label}</p>
              <p className="text-white text-2xl font-bold">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs + Bulk Actions */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 border-b border-gray-800">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === tab.id
                  ? 'text-primary-400 border-primary-500'
                  : 'text-gray-500 border-transparent hover:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button onClick={resolveSelected} className="btn-secondary text-xs">
              <FiCheckCircle className="w-3.5 h-3.5" />
              Resolve Selected ({selected.size})
            </button>
          )}
          <button onClick={acknowledgeAll} className="btn-secondary text-xs">
            <FiCheck className="w-3.5 h-3.5" />
            Acknowledge All
          </button>
        </div>
      </div>

      {/* Alert List */}
      <div className="space-y-2">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card animate-pulse h-16 bg-dark-900" />
          ))
        ) : displayAlerts.length === 0 ? (
          <div className="card text-center py-16">
            <FiCheckCircle className="w-12 h-12 text-green-500/30 mx-auto mb-3" />
            <p className="text-gray-400 font-medium">No alerts in this category</p>
            <p className="text-gray-600 text-sm mt-1">Your fleet is operating normally</p>
          </div>
        ) : displayAlerts.map((alert) => {
          const cfg = SEV_CONFIG[alert.severity]
          const isExpanded = expanded.has(alert.id)
          const isSelected = selected.has(alert.id)
          const isNew = newAlertIds.has(alert.id)

          return (
            <div
              key={alert.id}
              className={`rounded-xl border border-l-4 transition-all duration-300 ${isNew ? 'ring-2 ring-cyan-500/30' : ''}`}
              style={{ borderLeftColor: cfg.borderColor, background: cfg.bg, borderColor: `${cfg.borderColor}30` }}
            >
              <div className="flex items-center gap-3 p-4">
                {/* Select checkbox */}
                <div
                  onClick={() => toggleSelect(alert.id)}
                  className={`w-4 h-4 rounded border-2 flex items-center justify-center cursor-pointer flex-shrink-0 transition-colors ${
                    isSelected ? 'border-primary-500 bg-primary-600' : 'border-gray-600 hover:border-gray-500'
                  }`}
                >
                  {isSelected && <FiCheck className="w-2.5 h-2.5 text-white" />}
                </div>

                {/* Severity icon */}
                <span style={{ color: cfg.color }} className="flex-shrink-0">{cfg.icon}</span>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-semibold uppercase" style={{ color: cfg.color }}>{alert.severity}</span>
                    <span className="text-gray-600 text-xs">·</span>
                    <span className="text-gray-500 text-xs">{alert.type}</span>
                    {alert.robot_name && (
                      <>
                        <span className="text-gray-600 text-xs">·</span>
                        <span className="text-cyan-400 text-xs font-medium">{alert.robot_name}</span>
                      </>
                    )}
                    {isNew && (
                      <span className="px-1.5 py-0.5 rounded-full text-xs bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 animate-pulse">NEW</span>
                    )}
                  </div>
                  <p className="text-gray-200 text-sm">{alert.message}</p>
                </div>

                {/* Right side */}
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-right">
                    <p className="text-gray-600 text-xs">{formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}</p>
                    <p className="text-gray-600 text-xs">{format(new Date(alert.created_at), 'MMM d, HH:mm')}</p>
                  </div>

                  <div className="flex items-center gap-1">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
                      alert.status === 'open' ? 'text-orange-400 bg-orange-500/10 border-orange-500/20' :
                      alert.status === 'acknowledged' ? 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20' :
                      'text-green-400 bg-green-500/10 border-green-500/20'
                    }`}>{alert.status}</span>
                  </div>

                  {alert.status === 'open' && (
                    <button
                      onClick={() => acknowledge(alert.id)}
                      className="text-xs px-2 py-1 rounded bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 border border-yellow-500/20 transition-colors"
                    >
                      Ack
                    </button>
                  )}
                  {alert.status !== 'resolved' && (
                    <button
                      onClick={() => resolve(alert.id)}
                      className="text-xs px-2 py-1 rounded bg-green-500/10 text-green-400 hover:bg-green-500/20 border border-green-500/20 transition-colors"
                    >
                      Resolve
                    </button>
                  )}

                  <button onClick={() => toggleExpand(alert.id)} className="text-gray-500 hover:text-gray-300 transition-colors">
                    {isExpanded ? <FiChevronUp className="w-4 h-4" /> : <FiChevronDown className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-gray-800/50 pt-3">
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-gray-500">Alert ID:</span>
                      <span className="text-gray-300 font-mono ml-2">{alert.id}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Robot ID:</span>
                      <span className="text-gray-300 font-mono ml-2">{alert.robot_id}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Created:</span>
                      <span className="text-gray-300 ml-2">{format(new Date(alert.created_at), 'PPpp')}</span>
                    </div>
                    {alert.resolved_at && (
                      <div>
                        <span className="text-gray-500">Resolved:</span>
                        <span className="text-gray-300 ml-2">{format(new Date(alert.resolved_at), 'PPpp')}</span>
                      </div>
                    )}
                    {alert.acknowledged_by && (
                      <div>
                        <span className="text-gray-500">Acknowledged by:</span>
                        <span className="text-gray-300 ml-2">{alert.acknowledged_by}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
