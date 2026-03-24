import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FiMapPin, FiRefreshCw, FiCpu } from 'react-icons/fi'
import { useRobots } from '../../hooks/useRobots'
import StatusBadge from '../../components/common/StatusBadge'
import LoadingSpinner from '../../components/common/LoadingSpinner'
import type { Robot } from '../../types'

const STATUS_COLORS: Record<string, string> = {
  online:      '#22c55e',
  offline:     '#6b7280',
  error:       '#ef4444',
  maintenance: '#eab308',
  idle:        '#3b82f6',
}

// Simple pseudo-map using a fixed canvas with dots at lat/lng scaled to bounds
const LAT_MIN = 37.7, LAT_MAX = 37.8
const LNG_MIN = -122.5, LNG_MAX = -122.3

function latToY(lat: number, h: number) {
  return h - ((lat - LAT_MIN) / (LAT_MAX - LAT_MIN)) * h
}
function lngToX(lng: number, w: number) {
  return ((lng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * w
}

export default function FleetMap() {
  const { robots, isLoading, refresh } = useRobots({ per_page: 100 })
  const [selected, setSelected] = useState<Robot | null>(null)
  const navigate = useNavigate()

  const positioned = robots.filter((r) => r.location_lat != null && r.location_lng != null)
  const unpositioned = robots.filter((r) => r.location_lat == null)

  const W = 800, H = 500

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Fleet Map</h2>
          <p className="text-gray-500 text-sm">{robots.length} robots tracked</p>
        </div>
        <button onClick={refresh} className="btn-secondary">
          <FiRefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        {/* Map Canvas */}
        <div className="xl:col-span-3 card relative overflow-hidden" style={{ minHeight: 480 }}>
          {/* Grid background */}
          <div className="absolute inset-0 bg-dark-920"
            style={{
              backgroundImage: `
                linear-gradient(rgba(8,145,178,0.06) 1px, transparent 1px),
                linear-gradient(90deg, rgba(8,145,178,0.06) 1px, transparent 1px)
              `,
              backgroundSize: '40px 40px',
            }}
          />

          {/* Map label */}
          <div className="absolute top-3 left-3 flex items-center gap-2 bg-dark-900/80 border border-gray-800 rounded-lg px-3 py-1.5">
            <FiMapPin className="w-3.5 h-3.5 text-primary-400" />
            <span className="text-xs text-gray-400">San Francisco Bay Area</span>
          </div>

          {/* Status legend */}
          <div className="absolute top-3 right-3 flex flex-col gap-1.5 bg-dark-900/80 border border-gray-800 rounded-lg px-3 py-2">
            {Object.entries(STATUS_COLORS).map(([s, c]) => (
              <div key={s} className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ background: c }} />
                <span className="text-xs text-gray-400 capitalize">{s}</span>
              </div>
            ))}
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center h-80">
              <LoadingSpinner label="Loading fleet..." />
            </div>
          ) : (
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="w-full h-auto"
              style={{ maxHeight: 500 }}
            >
              {/* Grid lines */}
              {Array.from({ length: 10 }).map((_, i) => (
                <g key={i}>
                  <line
                    x1={0} y1={(i / 10) * H} x2={W} y2={(i / 10) * H}
                    stroke="rgba(8,145,178,0.08)" strokeWidth={1}
                  />
                  <line
                    x1={(i / 10) * W} y1={0} x2={(i / 10) * W} y2={H}
                    stroke="rgba(8,145,178,0.08)" strokeWidth={1}
                  />
                </g>
              ))}

              {/* Robot pins */}
              {positioned.map((robot) => {
                const x = lngToX(robot.location_lng!, W)
                const y = latToY(robot.location_lat!, H)
                const color = STATUS_COLORS[robot.status] ?? '#6b7280'
                const isSelected = selected?.id === robot.id

                return (
                  <g
                    key={robot.id}
                    transform={`translate(${x}, ${y})`}
                    onClick={() => setSelected(robot === selected ? null : robot)}
                    className="cursor-pointer"
                  >
                    {/* Pulse ring for online */}
                    {robot.status === 'online' && (
                      <circle r={14} fill={color} opacity={0.15}>
                        <animate attributeName="r" values="10;18;10" dur="2s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.2;0;0.2" dur="2s" repeatCount="indefinite" />
                      </circle>
                    )}
                    {/* Selection ring */}
                    {isSelected && (
                      <circle r={16} fill="none" stroke={color} strokeWidth={2} opacity={0.8} />
                    )}
                    {/* Main dot */}
                    <circle r={7} fill={color} opacity={0.9} />
                    <circle r={3} fill="white" opacity={0.9} />
                  </g>
                )
              })}
            </svg>
          )}

          {/* Selected robot tooltip */}
          {selected && (
            <div className="absolute bottom-3 left-3 bg-dark-900/95 border border-gray-700 rounded-xl p-4 min-w-52 shadow-xl">
              <div className="flex items-center gap-2 mb-2">
                <FiCpu className="text-primary-400 w-4 h-4" />
                <span className="text-white font-semibold text-sm">{selected.name}</span>
              </div>
              <div className="space-y-1 text-xs text-gray-400">
                <div className="flex justify-between gap-6">
                  <span>Status</span>
                  <StatusBadge type="robot" value={selected.status} />
                </div>
                <div className="flex justify-between">
                  <span>Battery</span>
                  <span className="text-white">{selected.battery_level}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Location</span>
                  <span className="text-white">{selected.location_name ?? 'Unknown'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Model</span>
                  <span className="text-white">{selected.model}</span>
                </div>
              </div>
              <button
                onClick={() => navigate(`/robots/${selected.id}`)}
                className="mt-3 btn-primary w-full justify-center text-xs py-1.5"
              >
                View Details
              </button>
            </div>
          )}
        </div>

        {/* Robot list sidebar */}
        <div className="card overflow-hidden flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white">All Robots</h3>
            <span className="text-xs text-gray-500">{robots.length} total</span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 -mx-1 px-1">
            {robots.map((robot) => (
              <button
                key={robot.id}
                onClick={() => setSelected(robot === selected ? null : robot)}
                className={`w-full text-left p-2.5 rounded-lg border transition-all duration-150 ${
                  selected?.id === robot.id
                    ? 'bg-primary-600/10 border-primary-600/30'
                    : 'bg-dark-800/50 border-gray-800 hover:border-gray-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-white truncate">{robot.name}</span>
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0 ml-1"
                    style={{ background: STATUS_COLORS[robot.status] }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500 capitalize">{robot.type}</span>
                  <span className="text-xs text-gray-400">{robot.battery_level}%</span>
                </div>
                {robot.location_name && (
                  <p className="text-xs text-gray-600 mt-0.5 truncate">{robot.location_name}</p>
                )}
                {unpositioned.includes(robot) && (
                  <p className="text-xs text-yellow-600 mt-0.5">No GPS</p>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
