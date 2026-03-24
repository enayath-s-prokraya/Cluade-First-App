import { useState, useEffect, useCallback, useRef } from 'react'
import { robotsApi, RobotFilters } from '../services/api'
import { useSocket } from '../services/socket'
import type { Robot } from '../types'

interface UseRobotsReturn {
  robots: Robot[]
  total: number
  isLoading: boolean
  error: string | null
  refresh: () => void
  filters: RobotFilters
  setFilters: (f: RobotFilters) => void
}

export function useRobots(initialFilters: RobotFilters = {}): UseRobotsReturn {
  const [robots, setRobots] = useState<Robot[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<RobotFilters>(initialFilters)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetch = useCallback(async () => {
    try {
      setError(null)
      const res = await robotsApi.getAll(filters)
      setRobots(res.data)
      setTotal(res.total)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load robots')
    } finally {
      setIsLoading(false)
    }
  }, [filters])

  useEffect(() => {
    setIsLoading(true)
    fetch()

    // Refresh every 30 seconds
    intervalRef.current = setInterval(fetch, 30_000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetch])

  // Real-time status updates via socket
  useSocket('robot_status_change', ({ robot_id, status }) => {
    setRobots((prev) =>
      prev.map((r) => (r.id === robot_id ? { ...r, status } : r)),
    )
  })

  const refresh = useCallback(() => {
    setIsLoading(true)
    fetch()
  }, [fetch])

  return { robots, total, isLoading, error, refresh, filters, setFilters }
}
