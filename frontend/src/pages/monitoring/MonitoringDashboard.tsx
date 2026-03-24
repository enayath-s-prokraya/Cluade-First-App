import React, { useState, useEffect, useCallback } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { FiActivity, FiRefreshCw, FiCpu, FiWifi } from 'react-icons/fi'
import { format } from 'date-fns'
import { telemetryApi } from '../../services/api'
import { useSocket } from '../../services/socket'
import StatusBadge from '../../components/common/StatusBadge'
import LoadingSpinner from '../../components/common/LoadingSpinner'
import type { FleetTelemetry, Telemetry } from '../../types'

interface TelemetryPoint {
  time: string
  battery: number
  cpu: number
  temperature: number
  latency: number
}

export default function MonitoringDashboard() {
  const [fleet, setFleet] = useState<FleetTelemetry[]>([])
  const [history, setHistory] = useState<TelemetryPoint[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState(new Date())

  const fetchFleet = useCallback(async () => {
    try {
      const data = await telemetryApi.getFleet()
      setFleet(data)
      setLastUpdate(new Date())
    } catch (err) {
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchFleet()
    const id = setInterval(fetchFleet, 5000)
    return () => clearInterval(id)
  }, [fetchFleet])

  // Live telemetry via socket
  useSocket('telemetry_update', (t: Telemetry) => {
    setHistory((prev) => {
      const point: TelemetryPoint = {
        time: format(new Date(t.timestamp), 'HH:mm:ss'),
        battery: t.battery,
        cpu: t.cpu_usage,
        temperature: t.temperature,
        latency: t.network_latency,
      }
      return [...prev.slice(-59), point]
    })
    setLastUpdate(new Date())

    // Update fleet entry
    setFleet((prev) =>
      prev.map((f) =>
        f.robot_id === t.robot_id
          ? {
              ...f,
              battery: t.battery,
              cpu_usage: t.cpu_usage,
              temperature: t.temperature,
              last_update: t.timestamp,
            }
          : f,
      ),
    )
  })

  // Generate initial placeholder history
  useEffect(() => {
    const now = Date.now()
    setHistory(
      Array.from({ length: 30 }, (_, i) => ({
        time: format(new Date(now - (29 - i) * 5000), 'HH:mm:ss'),
        battery: 60 + Math.random() * 25,
        cpu: 25 + Math.random() * 40,
        temperature: 38 + Math.random() * 12,
        latency: 10 + Math.random() * 30,
      })),
    )
  }, [])

  const avgBattery = fleet.length ? fleet.reduce((s, f) => s + f.battery, 0) / fleet.length : 0
  const avgCpu = fleet.length ? fleet.reduce((s, f) => s + f.cpu_usage, 0) / fleet.length : 0
  const online = fleet.filter((f) => f.status === 'online').length

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Live Monitor</h2>
          <p className="text-gray-500 text-sm">
            Real-time fleet telemetry · Updated {format(lastUpdate, 'HH:mm:ss')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-green-400 bg-green-500/10 border border-green-500/20 px-3 py-1.5 rounded-lg">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Live
          </div>
          <button onClick={fetchFleet} className="btn-secondary">
            <FiRefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Fleet summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Fleet Online', value: `${online}/${fleet.length}`, icon: <FiWifi />, color: 'text-green-400' },
          { label: 'Avg Battery', value: `${avgBattery.toFixed(1)}%`, icon: <FiActivity />, color: 'text-cyan-400' },
          { label: 'Avg CPU', value: `${avgCpu.toFixed(1)}%`, icon: <FiCpu />, color: 'text-purple-400' },
          { label: 'Robots Tracked', value: fleet.length, icon: <FiCpu />, color: 'text-blue-400' },
        ].map(({ label, value, icon, color }) => (
          <div key={label} className="card">
            <div className="flex items-center gap-2 mb-2">
              <span className={color}>{icon}</span>
              <span className="text-xs text-gray-500">{label}</span>
            </div>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="card">
          <h3 className="text-sm font-semibold text-white mb-4">Fleet Telemetry (Live)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={history}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="time" tick={{ fill: '#6b7280', fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} />
              <Tooltip
                contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                labelStyle={{ color: '#e5e7eb' }}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
              <Line type="monotone" dataKey="battery" stroke="#06b6d4" strokeWidth={2} dot={false} name="Battery %" />
              <Line type="monotone" dataKey="cpu" stroke="#8b5cf6" strokeWidth={2} dot={false} name="CPU %" />
              <Line type="monotone" dataKey="temperature" stroke="#f97316" strokeWidth={2} dot={false} name="Temp °C" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 className="text-sm font-semibold text-white mb-4">Network Latency (Live)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={history}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="time" tick={{ fill: '#6b7280', fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} />
              <Tooltip
                contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                labelStyle={{ color: '#e5e7eb' }}
              />
              <Line type="monotone" dataKey="latency" stroke="#22c55e" strokeWidth={2} dot={false} name="Latency ms" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Fleet table */}
      <div className="card overflow-hidden p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-white">Robot Telemetry</h3>
          <span className="text-xs text-gray-500">{fleet.length} robots</span>
        </div>

        {isLoading ? (
          <div className="py-12">
            <LoadingSpinner label="Loading telemetry..." className="mx-auto" />
          </div>
        ) : fleet.length === 0 ? (
          <div className="py-8 text-center text-gray-600 text-sm">No telemetry data</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full table-dark">
              <thead>
                <tr>
                  <th>Robot</th>
                  <th>Status</th>
                  <th>Battery</th>
                  <th>CPU</th>
                  <th>Temperature</th>
                  <th>Last Update</th>
                </tr>
              </thead>
              <tbody>
                {fleet.map((f) => (
                  <tr key={f.robot_id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <FiCpu className="w-4 h-4 text-primary-400" />
                        <span className="text-white font-medium">{f.robot_name}</span>
                      </div>
                    </td>
                    <td>
                      <StatusBadge type="robot" value={f.status} />
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 bg-dark-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${f.battery > 60 ? 'bg-green-500' : f.battery > 30 ? 'bg-yellow-500' : 'bg-red-500'}`}
                            style={{ width: `${f.battery}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-400">{f.battery.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td>
                      <span className={`text-sm font-medium ${f.cpu_usage > 80 ? 'text-red-400' : f.cpu_usage > 60 ? 'text-yellow-400' : 'text-gray-300'}`}>
                        {f.cpu_usage.toFixed(1)}%
                      </span>
                    </td>
                    <td>
                      <span className={`text-sm font-medium ${f.temperature > 75 ? 'text-red-400' : f.temperature > 60 ? 'text-yellow-400' : 'text-gray-300'}`}>
                        {f.temperature.toFixed(1)}°C
                      </span>
                    </td>
                    <td>
                      <span className="text-xs text-gray-500">
                        {format(new Date(f.last_update), 'HH:mm:ss')}
                      </span>
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
