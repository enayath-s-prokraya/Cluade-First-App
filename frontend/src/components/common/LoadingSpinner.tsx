import React from 'react'
import clsx from 'clsx'

interface LoadingSpinnerProps {
  label?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
  fullPage?: boolean
}

const sizeMap = {
  sm: 'w-4 h-4 border-2',
  md: 'w-8 h-8 border-2',
  lg: 'w-12 h-12 border-[3px]',
}

export default function LoadingSpinner({
  label,
  size = 'md',
  className,
  fullPage,
}: LoadingSpinnerProps) {
  const spinner = (
    <div className={clsx('flex flex-col items-center justify-center gap-3', className)}>
      <div
        className={clsx(
          'rounded-full border-dark-700 border-t-primary-500 animate-spin',
          sizeMap[size],
        )}
      />
      {label && (
        <p className="text-sm text-gray-400 font-medium">{label}</p>
      )}
    </div>
  )

  if (fullPage) {
    return (
      <div className="fixed inset-0 bg-dark-950 flex items-center justify-center z-50">
        {spinner}
      </div>
    )
  }

  return spinner
}
