import React, { ReactNode } from 'react'
import clsx from 'clsx'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  message?: string
  action?: ReactNode
  className?: string
}

export default function EmptyState({ icon, title, message, action, className }: EmptyStateProps) {
  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-center py-16 px-6 text-center',
        className,
      )}
    >
      {icon && (
        <div className="mb-4 p-4 rounded-full bg-dark-800 text-gray-600 text-4xl">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-gray-300 mb-1">{title}</h3>
      {message && <p className="text-sm text-gray-500 max-w-xs mb-4">{message}</p>}
      {action && <div>{action}</div>}
    </div>
  )
}
