import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FiPlus, FiSearch, FiRefreshCw, FiCpu, FiBattery, FiMapPin,
  FiClock, FiFilter,
} from 'react-icons/fi'
import { formatDistanceToNow } from 'date-fns'
import { useRobots } from '../../hooks/useRobots'
import StatusBadge from '../../components/common/StatusBadge'
import LoadingSpinner from '../../components/common/LoadingSpinner'
import EmptyState from '../../components/common/EmptyState'
import type { RobotStatus, RobotType } from '../../types'

const STATUS_OPTIONS: RobotStatus[] = ['online', 'offline', 'maintenance', 'error', 'idle']
const TYPE_OPTIONS: RobotType[] = ['humanoid', 'wheeled', 'drone', 'arm', 'mobile']

function BatteryBar({ level }: { level: number }) {
  const color =
    level > 60 ? 'bg-green-500' : level > 30 ? 'bg-yellow-500' : 'bg-red-500'
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 bg-dark-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${level}%` }} />
      </div>
      <span className="text-xs text-gray-400">{level}%</span>
    </div>
  )
}

export default function RobotList() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  const { robots, total, isLoading, error, refresh } = useRobots({
    status: statusFilter || undefined,
    type: typeFilter || undefined,
    per_page: 50,
  })

  const filtered = robots.filter((r) =>
    search
      ? r.name.toLowerCase().includes(search.toLowerCase()) ||
        r.serial_number.toLowerCase().includes(search.toLowerCase()) ||
        r.model.toLowerCase().includes(search.toLowerCase())
      : true,
  )

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Robots</h2>
          <p className="text-gray-500 text-sm">{total} robots registered</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refresh} className="btn-secondary">
            <FiRefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button
            onClick={() => navigate('/robots/register')}
            className="btn-primary"
          >
            <FiPlus className="w-4 h-4" />
            Register Robot
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-48">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, serial, model..."
              className="input-dark pl-9"
            />
          </div>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input-dark w-40"
          >
            <option value="">All Statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>

          {/* Type filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="input-dark w-40"
          >
            <option value="">All Types</option>
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
            ))}
          </select>

          <button
            onClick={() => setShowFilters(!showFilters)}
            className="btn-secondary"
          >
            <FiFilter className="w-4 h-4" />
            Filters
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden p-0">
        {error ? (
          <div className="p-6 text-center text-red-400 text-sm">{error}</div>
        ) : isLoading ? (
          <div className="py-16">
            <LoadingSpinner label="Loading robots..." className="mx-auto" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<FiCpu />}
            title="No robots found"
            message={
              search || statusFilter || typeFilter
                ? 'Try clearing your filters'
                : 'Register your first robot to get started'
            }
            action={
              !search && !statusFilter && !typeFilter ? (
                <button
                  onClick={() => navigate('/robots/register')}
                  className="btn-primary"
                >
                  <FiPlus className="w-4 h-4" />
                  Register Robot
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full table-dark">
              <thead>
                <tr>
                  <th>Robot</th>
                  <th>Status</th>
                  <th>Type</th>
                  <th>Battery</th>
                  <th>Location</th>
                  <th>Firmware</th>
                  <th>Last Seen</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((robot) => (
                  <tr
                    key={robot.id}
                    onClick={() => navigate(`/robots/${robot.id}`)}
                    className="cursor-pointer"
                  >
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary-600/20 border border-primary-600/20 flex items-center justify-center">
                          <FiCpu className="w-4 h-4 text-primary-400" />
                        </div>
                        <div>
                          <p className="text-white font-medium text-sm">{robot.name}</p>
                          <p className="text-gray-500 text-xs font-mono">{robot.serial_number}</p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <StatusBadge type="robot" value={robot.status} />
                    </td>
                    <td>
                      <span className="text-gray-300 capitalize">{robot.type}</span>
                    </td>
                    <td>
                      <BatteryBar level={robot.battery_level} />
                    </td>
                    <td>
                      {robot.location_name ? (
                        <div className="flex items-center gap-1.5">
                          <FiMapPin className="w-3 h-3 text-gray-500" />
                          <span className="text-gray-300 text-sm">{robot.location_name}</span>
                        </div>
                      ) : (
                        <span className="text-gray-600 text-sm">—</span>
                      )}
                    </td>
                    <td>
                      <span className="font-mono text-xs text-gray-400">{robot.firmware_version}</span>
                    </td>
                    <td>
                      {robot.last_seen ? (
                        <div className="flex items-center gap-1.5">
                          <FiClock className="w-3 h-3 text-gray-500" />
                          <span className="text-gray-400 text-xs">
                            {formatDistanceToNow(new Date(robot.last_seen), { addSuffix: true })}
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-600 text-xs">Never</span>
                      )}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => navigate(`/robots/${robot.id}`)}
                        className="text-xs text-primary-400 hover:text-primary-300 transition-colors"
                      >
                        Details →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
