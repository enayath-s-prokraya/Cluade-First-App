import React, { useState } from 'react'
import {
  FiBell, FiRefreshCw, FiAlertTriangle, FiCheck, FiCheckCircle, FiFilter,
} from 'react-icons/fi'
import { formatDistanceToNow } from 'date-fns'
import { useAlerts } from '../../hooks/useAlerts'
import StatusBadge from '../../components/common/StatusBadge'
import LoadingSpinner from '../../components/common/LoadingSpinner'
import EmptyState from '../../components/common/EmptyState'
import type { AlertSeverity, AlertStatus } from '../../types'

const SEV_COLORS: Record<AlertSeverity, string> = {
  critical: 'border-red-600',
  error:    'border-red-500',
  warning:  'border-yellow-500',
  info:     'border-blue-500',
}

const SEV_BG: Record<AlertSeverity, string> = {
  critical: 'bg-red-600/5',
  error:    'bg-red-500/5',
  warning:  'bg-yellow-500/5',
  info:     'bg-blue-500/5',
}

export default function AlertsPage() {
  const [severityFilter, setSeverityFilter] = useState<AlertSeverity | ''>('')
  const [statusFilter, setStatusFilter] = useState<AlertStatus | ''>('')

  const {
    alerts, total, stats, isLoading, error, refresh, setFilters,
    acknowledge, resolve,
  } = useAlerts({
    severity: severityFilter || undefined,
    status: statusFilter || undefined,
    per_page: 50,
  })

  const applyFilters = () => {
    setFilters({
      severity: severityFilter || undefined,
      status: statusFilter || undefined,
      per_page: 50,
    })
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Alerts</h2>
          <p className="text-gray-500 text-sm">{total} total alerts</p>
        </div>
        <button onClick={refresh} className="btn-secondary">
          <FiRefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Open',         value: stats.open,         color: 'text-orange-400' },
            { label: 'Acknowledged', value: stats.acknowledged, color: 'text-yellow-400' },
            { label: 'Resolved',     value: stats.resolved,     color: 'text-green-400' },
            { label: 'Critical',     value: stats.by_severity?.critical ?? 0, color: 'text-red-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="card">
              <p className="text-xs text-gray-500 mb-1">{label}</p>
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="card">
        <div className="flex flex-wrap items-center gap-3">
          <FiFilter className="w-4 h-4 text-gray-500" />
          <select
            value={severityFilter}
            onChange={(e) => { setSeverityFilter(e.target.value as AlertSeverity | ''); applyFilters() }}
            className="input-dark w-40"
          >
            <option value="">All Severities</option>
            {(['critical', 'error', 'warning', 'info'] as AlertSeverity[]).map((s) => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as AlertStatus | ''); applyFilters() }}
            className="input-dark w-40"
          >
            <option value="">All Statuses</option>
            {(['open', 'acknowledged', 'resolved'] as AlertStatus[]).map((s) => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Alerts list */}
      {error ? (
        <div className="card text-center text-red-400 text-sm">{error}</div>
      ) : isLoading ? (
        <LoadingSpinner label="Loading alerts..." className="mx-auto py-16" />
      ) : alerts.length === 0 ? (
        <EmptyState
          icon={<FiBell />}
          title="No alerts"
          message="All clear! No alerts matching your filters"
        />
      ) : (
        <div className="space-y-2">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`rounded-xl border-l-4 border border-gray-800/50 p-4 ${SEV_COLORS[alert.severity]} ${SEV_BG[alert.severity]}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <FiAlertTriangle
                    className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                      alert.severity === 'critical' ? 'text-red-400' :
                      alert.severity === 'error' ? 'text-red-400' :
                      alert.severity === 'warning' ? 'text-yellow-400' : 'text-blue-400'
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium">{alert.message}</p>
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      <StatusBadge type="alert" value={alert.severity} />
                      <StatusBadge type="alert" value={alert.status} />
                      {alert.robot_name && (
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                          Robot: <span className="text-primary-400">{alert.robot_name}</span>
                        </span>
                      )}
                      <span className="text-xs text-gray-600">
                        {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {alert.status === 'open' && (
                    <button
                      onClick={() => acknowledge(alert.id)}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 rounded-lg hover:bg-yellow-500/20 transition-colors"
                    >
                      <FiCheck className="w-3 h-3" />
                      Acknowledge
                    </button>
                  )}
                  {(alert.status === 'open' || alert.status === 'acknowledged') && (
                    <button
                      onClick={() => resolve(alert.id)}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-green-500/10 text-green-400 border border-green-500/20 rounded-lg hover:bg-green-500/20 transition-colors"
                    >
                      <FiCheckCircle className="w-3 h-3" />
                      Resolve
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
