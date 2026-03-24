import { io, Socket } from 'socket.io-client'
import { useEffect, useRef } from 'react'
import type { Telemetry, Alert, Robot, Command, Task } from '../types'

// ─── Event Map ───────────────────────────────────────────────────────────────

export interface SocketEvents {
  telemetry_update: Telemetry
  alert_triggered: Alert
  robot_status_change: { robot_id: string; status: Robot['status']; robot_name?: string }
  command_update: Command
  task_update: Task
}

export type SocketEventName = keyof SocketEvents

// ─── Socket Instance ─────────────────────────────────────────────────────────

let socketInstance: Socket | null = null

export function getSocket(): Socket {
  if (!socketInstance) {
    const token = localStorage.getItem('hccp_token')
    socketInstance = io('/', {
      auth: { token },
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    })

    socketInstance.on('connect', () => {
      console.log('[Socket] Connected:', socketInstance?.id)
    })

    socketInstance.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason)
    })

    socketInstance.on('connect_error', (err) => {
      console.warn('[Socket] Connection error:', err.message)
    })
  }
  return socketInstance
}

export function disconnectSocket() {
  if (socketInstance) {
    socketInstance.disconnect()
    socketInstance = null
  }
}

export function updateSocketAuth(token: string | null) {
  if (socketInstance) {
    socketInstance.auth = { token }
    if (!socketInstance.connected && token) {
      socketInstance.connect()
    } else if (!token) {
      socketInstance.disconnect()
    }
  }
}

// ─── Subscribe / Unsubscribe helpers ────────────────────────────────────────

export function subscribeToEvent<K extends SocketEventName>(
  event: K,
  handler: (data: SocketEvents[K]) => void,
) {
  const s = getSocket()
  s.on(event as string, handler as (data: unknown) => void)
  return () => s.off(event as string, handler as (data: unknown) => void)
}

// ─── React Hook ──────────────────────────────────────────────────────────────

export function useSocket<K extends SocketEventName>(
  event: K,
  handler: (data: SocketEvents[K]) => void,
  deps: unknown[] = [],
) {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    const s = getSocket()
    const cb = (data: unknown) => handlerRef.current(data as SocketEvents[K])
    s.on(event as string, cb)
    return () => {
      s.off(event as string, cb)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, ...deps])
}

// ─── Connection status hook ──────────────────────────────────────────────────

import { useState } from 'react'

export function useSocketStatus() {
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const s = getSocket()
    setConnected(s.connected)

    const onConnect = () => setConnected(true)
    const onDisconnect = () => setConnected(false)

    s.on('connect', onConnect)
    s.on('disconnect', onDisconnect)

    return () => {
      s.off('connect', onConnect)
      s.off('disconnect', onDisconnect)
    }
  }, [])

  return connected
}
