import React, { ReactNode } from 'react'
import clsx from 'clsx'
import { FiTrendingUp, FiTrendingDown, FiMinus } from 'react-icons/fi'

interface StatCardProps {
  title: string
  value: string | number
  icon: ReactNode
  trend?: 'up' | 'down' | 'neutral'
  trendValue?: string
  color?: 'cyan' | 'green' | 'red' | 'yellow' | 'blue' | 'purple'
  subtitle?: string
  className?: string
}

const colorMap = {
  cyan:   { icon: 'text-cyan-400',   bg: 'bg-cyan-400/10',   border: 'border-cyan-500/20',   glow: 'hover:shadow-glow-sm' },
  green:  { icon: 'text-green-400',  bg: 'bg-green-400/10',  border: 'border-green-500/20',  glow: '' },
  red:    { icon: 'text-red-400',    bg: 'bg-red-400/10',    border: 'border-red-500/20',    glow: '' },
  yellow: { icon: 'text-yellow-400', bg: 'bg-yellow-400/10', border: 'border-yellow-500/20', glow: '' },
  blue:   { icon: 'text-blue-400',   bg: 'bg-blue-400/10',   border: 'border-blue-500/20',   glow: '' },
  purple: { icon: 'text-purple-400', bg: 'bg-purple-400/10', border: 'border-purple-500/20', glow: '' },
}

export default function StatCard({
  title,
  value,
  icon,
  trend,
  trendValue,
  color = 'cyan',
  subtitle,
  className,
}: StatCardProps) {
  const c = colorMap[color]

  const TrendIcon =
    trend === 'up' ? FiTrendingUp : trend === 'down' ? FiTrendingDown : FiMinus
  const trendColor =
    trend === 'up' ? 'text-green-400' : trend === 'down' ? 'text-red-400' : 'text-gray-500'

  return (
    <div
      className={clsx(
        'bg-dark-900 border rounded-xl p-5 transition-all duration-200',
        c.border,
        c.glow,
        className,
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-sm font-medium text-gray-400">{title}</span>
        <div className={clsx('p-2 rounded-lg', c.bg)}>
          <span className={clsx('text-xl', c.icon)}>{icon}</span>
        </div>
      </div>

      <div className="flex items-end justify-between">
        <div>
          <p className="text-2xl font-bold text-white tabular-nums">{value}</p>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>

        {trend && trendValue && (
          <div className={clsx('flex items-center gap-1 text-xs font-medium', trendColor)}>
            <TrendIcon className="w-3.5 h-3.5" />
            <span>{trendValue}</span>
          </div>
        )}
      </div>
    </div>
  )
}
