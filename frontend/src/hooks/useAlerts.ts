import { useState, useEffect, useCallback } from 'react'
import { alertsApi, AlertFilters } from '../services/api'
import { useSocket } from '../services/socket'
import type { Alert, AlertStats } from '../types'

interface UseAlertsReturn {
  alerts: Alert[]
  total: number
  stats: AlertStats | null
  isLoading: boolean
  error: string | null
  refresh: () => void
  filters: AlertFilters
  setFilters: (f: AlertFilters) => void
  acknowledge: (id: string) => Promise<void>
  resolve: (id: string) => Promise<void>
}

export function useAlerts(initialFilters: AlertFilters = {}): UseAlertsReturn {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<AlertStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<AlertFilters>(initialFilters)

  const fetchAlerts = useCallback(async () => {
    try {
      setError(null)
      const [listRes, statsRes] = await Promise.all([
        alertsApi.getAll(filters),
        alertsApi.getStats(),
      ])
      setAlerts(listRes.data)
      setTotal(listRes.total)
      setStats(statsRes)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load alerts')
    } finally {
      setIsLoading(false)
    }
  }, [filters])

  useEffect(() => {
    setIsLoading(true)
    fetchAlerts()
  }, [fetchAlerts])

  // Real-time alert events via socket
  useSocket('alert_triggered', (alert) => {
    setAlerts((prev) => [alert, ...prev])
    setTotal((t) => t + 1)
    setStats((s) =>
      s
        ? {
            ...s,
            total: s.total + 1,
            open: s.open + 1,
            by_severity: {
              ...s.by_severity,
              [alert.severity]: (s.by_severity[alert.severity] ?? 0) + 1,
            },
          }
        : s,
    )
  })

  const acknowledge = useCallback(async (id: string) => {
    const updated = await alertsApi.acknowledge(id)
    setAlerts((prev) => prev.map((a) => (a.id === id ? updated : a)))
  }, [])

  const resolve = useCallback(async (id: string) => {
    const updated = await alertsApi.resolve(id)
    setAlerts((prev) => prev.map((a) => (a.id === id ? updated : a)))
  }, [])

  const refresh = useCallback(() => {
    setIsLoading(true)
    fetchAlerts()
  }, [fetchAlerts])

  return {
    alerts,
    total,
    stats,
    isLoading,
    error,
    refresh,
    filters,
    setFilters,
    acknowledge,
    resolve,
  }
}
