import React, { ReactNode } from 'react'
import clsx from 'clsx'
import { FiAlertTriangle, FiX } from 'react-icons/fi'

interface ConfirmModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning' | 'info'
  isLoading?: boolean
}

const variantMap = {
  danger:  { icon: 'text-red-400',    btn: 'bg-red-600 hover:bg-red-500 text-white', iconBg: 'bg-red-500/10' },
  warning: { icon: 'text-yellow-400', btn: 'bg-yellow-600 hover:bg-yellow-500 text-white', iconBg: 'bg-yellow-500/10' },
  info:    { icon: 'text-blue-400',   btn: 'bg-blue-600 hover:bg-blue-500 text-white', iconBg: 'bg-blue-500/10' },
}

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  isLoading,
}: ConfirmModalProps) {
  if (!isOpen) return null

  const v = variantMap[variant]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-dark-900 border border-gray-800 rounded-xl shadow-xl w-full max-w-md animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className={clsx('p-2 rounded-lg', v.iconBg)}>
              <FiAlertTriangle className={clsx('w-5 h-5', v.icon)} />
            </div>
            <h2 className="text-base font-semibold text-white">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors"
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          <div className="text-sm text-gray-400 leading-relaxed">{message}</div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 pb-5">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="btn-secondary"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              v.btn,
            )}
          >
            {isLoading && (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            )}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
