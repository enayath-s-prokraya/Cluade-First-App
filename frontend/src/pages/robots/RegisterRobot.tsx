import React, { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { FiArrowLeft, FiSave, FiCpu } from 'react-icons/fi'
import { robotsApi } from '../../services/api'
import type { RobotType } from '../../types'

const ROBOT_TYPES: RobotType[] = ['humanoid', 'wheeled', 'drone', 'arm', 'mobile']

export default function RegisterRobot() {
  const navigate = useNavigate()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    name: '',
    type: 'humanoid' as RobotType,
    model: '',
    serial_number: '',
    firmware_version: '1.0.0',
    ip_address: '',
    location_name: '',
    tags: '',
  })

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      const tags = form.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)

      const robot = await robotsApi.register({
        name: form.name,
        type: form.type,
        model: form.model,
        serial_number: form.serial_number,
        firmware_version: form.firmware_version,
        ip_address: form.ip_address || null,
        location_name: form.location_name || null,
        tags,
      })
      navigate(`/robots/${robot.id}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to register robot')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/robots')}
          className="p-2 text-gray-400 hover:text-white hover:bg-dark-800 rounded-lg transition-colors"
        >
          <FiArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-xl font-bold text-white">Register New Robot</h2>
          <p className="text-gray-500 text-sm">Add a robot to your fleet</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Identity */}
        <div className="card space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <FiCpu className="text-primary-400 w-4 h-4" />
            <h3 className="text-sm font-semibold text-white">Robot Identity</h3>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">
                Robot Name <span className="text-red-400">*</span>
              </label>
              <input
                name="name"
                value={form.name}
                onChange={handleChange}
                required
                placeholder="e.g. Alpha-7"
                className="input-dark"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">
                Type <span className="text-red-400">*</span>
              </label>
              <select
                name="type"
                value={form.type}
                onChange={handleChange}
                required
                className="input-dark"
              >
                {ROBOT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">
                Model <span className="text-red-400">*</span>
              </label>
              <input
                name="model"
                value={form.model}
                onChange={handleChange}
                required
                placeholder="e.g. HX-2000"
                className="input-dark"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">
                Serial Number <span className="text-red-400">*</span>
              </label>
              <input
                name="serial_number"
                value={form.serial_number}
                onChange={handleChange}
                required
                placeholder="e.g. SN-2024-001"
                className="input-dark font-mono"
              />
            </div>
          </div>
        </div>

        {/* Technical */}
        <div className="card space-y-4">
          <h3 className="text-sm font-semibold text-white">Technical Details</h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">
                Firmware Version
              </label>
              <input
                name="firmware_version"
                value={form.firmware_version}
                onChange={handleChange}
                placeholder="1.0.0"
                className="input-dark font-mono"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">
                IP Address
              </label>
              <input
                name="ip_address"
                value={form.ip_address}
                onChange={handleChange}
                placeholder="192.168.1.100"
                className="input-dark font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">
              Location Name
            </label>
            <input
              name="location_name"
              value={form.location_name}
              onChange={handleChange}
              placeholder="e.g. Warehouse A, Floor 2"
              className="input-dark"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">
              Tags (comma-separated)
            </label>
            <input
              name="tags"
              value={form.tags}
              onChange={handleChange}
              placeholder="production, assembly, critical"
              className="input-dark"
            />
            <p className="text-xs text-gray-600 mt-1">Separate tags with commas</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate('/robots')}
            className="btn-secondary"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="btn-primary"
          >
            {isSubmitting ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <FiSave className="w-4 h-4" />
            )}
            {isSubmitting ? 'Registering...' : 'Register Robot'}
          </button>
        </div>
      </form>
    </div>
  )
}
