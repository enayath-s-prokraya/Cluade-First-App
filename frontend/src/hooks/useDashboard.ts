import { useState, useEffect, useCallback, useRef } from 'react'
import { dashboardApi } from '../services/api'
import type { DashboardStats, ActivityItem } from '../types'

interface UseDashboardReturn {
  stats: DashboardStats | null
  activity: ActivityItem[]
  isLoading: boolean
  error: string | null
  refresh: () => void
}

export function useDashboard(): UseDashboardReturn {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetch = useCallback(async () => {
    try {
      setError(null)
      const [statsRes, activityRes] = await Promise.all([
        dashboardApi.getStats(),
        dashboardApi.getActivity(),
      ])
      setStats(statsRes)
      setActivity(activityRes)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    setIsLoading(true)
    fetch()

    // Refresh every 10 seconds
    intervalRef.current = setInterval(fetch, 10_000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetch])

  const refresh = useCallback(() => {
    setIsLoading(true)
    fetch()
  }, [fetch])

  return { stats, activity, isLoading, error, refresh }
}
