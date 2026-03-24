import React from 'react'
import clsx from 'clsx'
import type { RobotStatus, AlertSeverity, CommandStatus, TaskStatus } from '../../types'

type BadgeType = 'robot' | 'alert' | 'command' | 'task'

interface StatusBadgeProps {
  type: BadgeType
  value: string
  className?: string
}

function getRobotColors(status: RobotStatus): string {
  switch (status) {
    case 'online':      return 'bg-green-500/20 text-green-400 border-green-500/30'
    case 'offline':     return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
    case 'error':       return 'bg-red-500/20 text-red-400 border-red-500/30'
    case 'maintenance': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
    case 'idle':        return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
    default:            return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
  }
}

function getAlertColors(severity: AlertSeverity | string): string {
  switch (severity) {
    case 'info':     return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
    case 'warning':  return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
    case 'error':    return 'bg-red-500/20 text-red-400 border-red-500/30'
    case 'critical': return 'bg-red-600/30 text-red-300 border-red-600/50'
    // alert status values
    case 'open':         return 'bg-orange-500/20 text-orange-400 border-orange-500/30'
    case 'acknowledged': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
    case 'resolved':     return 'bg-green-500/20 text-green-400 border-green-500/30'
    default:             return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
  }
}

function getCommandColors(status: CommandStatus): string {
  switch (status) {
    case 'pending':   return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
    case 'sent':      return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
    case 'executing': return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
    case 'completed': return 'bg-green-500/20 text-green-400 border-green-500/30'
    case 'failed':    return 'bg-red-500/20 text-red-400 border-red-500/30'
    case 'cancelled': return 'bg-gray-600/20 text-gray-500 border-gray-600/30'
    default:          return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
  }
}

function getTaskColors(status: TaskStatus): string {
  switch (status) {
    case 'queued':    return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
    case 'assigned':  return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
    case 'executing': return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
    case 'completed': return 'bg-green-500/20 text-green-400 border-green-500/30'
    case 'failed':    return 'bg-red-500/20 text-red-400 border-red-500/30'
    case 'cancelled': return 'bg-gray-600/20 text-gray-500 border-gray-600/30'
    default:          return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
  }
}

function getDotColor(type: BadgeType, value: string): string {
  if (type === 'robot') {
    switch (value as RobotStatus) {
      case 'online': return 'bg-green-400'
      case 'offline': return 'bg-gray-400'
      case 'error': return 'bg-red-400'
      case 'maintenance': return 'bg-yellow-400'
      case 'idle': return 'bg-blue-400'
    }
  }
  return 'bg-gray-400'
}

export default function StatusBadge({ type, value, className }: StatusBadgeProps) {
  let colorClasses = ''
  switch (type) {
    case 'robot':   colorClasses = getRobotColors(value as RobotStatus); break
    case 'alert':   colorClasses = getAlertColors(value as AlertSeverity); break
    case 'command': colorClasses = getCommandColors(value as CommandStatus); break
    case 'task':    colorClasses = getTaskColors(value as TaskStatus); break
  }

  const showDot = type === 'robot'

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border',
        colorClasses,
        className,
      )}
    >
      {showDot && (
        <span
          className={clsx(
            'w-1.5 h-1.5 rounded-full',
            getDotColor(type, value),
            value === 'online' && 'animate-pulse',
          )}
        />
      )}
      {value.charAt(0).toUpperCase() + value.slice(1)}
    </span>
  )
}
