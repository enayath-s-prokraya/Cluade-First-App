import React, { useState } from 'react'
import {
  FiSettings, FiUser, FiBell, FiShield, FiDatabase,
  FiSave, FiCheck,
} from 'react-icons/fi'
import { useAuth } from '../../context/AuthContext'

type SettingsTab = 'profile' | 'notifications' | 'security' | 'system'

export default function Settings() {
  const { user } = useAuth()
  const [tab, setTab] = useState<SettingsTab>('profile')
  const [saved, setSaved] = useState(false)

  const [profile, setProfile] = useState({
    name: user?.name ?? '',
    email: user?.email ?? '',
    timezone: 'America/Los_Angeles',
  })

  const [notifications, setNotifications] = useState({
    critical_alerts: true,
    error_alerts: true,
    warning_alerts: false,
    task_updates: true,
    command_results: false,
    robot_offline: true,
    email_digest: true,
  })

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'profile',       label: 'Profile',       icon: <FiUser /> },
    { id: 'notifications', label: 'Notifications', icon: <FiBell /> },
    { id: 'security',      label: 'Security',      icon: <FiShield /> },
    { id: 'system',        label: 'System',        icon: <FiDatabase /> },
  ]

  return (
    <div className="max-w-4xl space-y-4 animate-fade-in">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-white">Settings</h2>
        <p className="text-gray-500 text-sm">Manage your account and platform preferences</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Tabs sidebar */}
        <div className="card p-2 space-y-0.5 h-fit">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === t.id
                  ? 'bg-primary-600/10 text-primary-400 border border-primary-600/20'
                  : 'text-gray-400 hover:text-white hover:bg-dark-800'
              }`}
            >
              <span className="text-base">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="md:col-span-3 card space-y-5">
          {/* Profile */}
          {tab === 'profile' && (
            <>
              <h3 className="font-semibold text-white flex items-center gap-2">
                <FiUser className="text-primary-400" />
                Profile Settings
              </h3>

              <div className="flex items-center gap-4 p-4 bg-dark-800/50 rounded-xl border border-gray-800">
                <div className="w-16 h-16 rounded-full bg-primary-600/20 border-2 border-primary-600/30 flex items-center justify-center">
                  <span className="text-primary-400 font-bold text-2xl">
                    {user?.name?.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="text-white font-semibold">{user?.name}</p>
                  <p className="text-gray-500 text-sm">{user?.email}</p>
                  <span className="inline-block mt-1 px-2 py-0.5 bg-primary-600/20 text-primary-400 text-xs rounded-full capitalize">
                    {user?.role?.replace('_', ' ')}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Full Name</label>
                  <input
                    value={profile.name}
                    onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                    className="input-dark"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Email</label>
                  <input
                    type="email"
                    value={profile.email}
                    onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                    className="input-dark"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Timezone</label>
                <select
                  value={profile.timezone}
                  onChange={(e) => setProfile({ ...profile, timezone: e.target.value })}
                  className="input-dark"
                >
                  {[
                    'America/Los_Angeles', 'America/Chicago', 'America/New_York',
                    'Europe/London', 'Europe/Berlin', 'Asia/Tokyo', 'Asia/Singapore',
                  ].map((tz) => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* Notifications */}
          {tab === 'notifications' && (
            <>
              <h3 className="font-semibold text-white flex items-center gap-2">
                <FiBell className="text-primary-400" />
                Notification Preferences
              </h3>

              <div className="space-y-1">
                {[
                  { key: 'critical_alerts', label: 'Critical Alerts', desc: 'Immediate notification for critical robot issues' },
                  { key: 'error_alerts', label: 'Error Alerts', desc: 'Notifications for robot errors' },
                  { key: 'warning_alerts', label: 'Warning Alerts', desc: 'Notifications for warnings' },
                  { key: 'task_updates', label: 'Task Updates', desc: 'Task completion and failure notifications' },
                  { key: 'command_results', label: 'Command Results', desc: 'Notification when commands complete' },
                  { key: 'robot_offline', label: 'Robot Offline', desc: 'Alert when a robot goes offline' },
                  { key: 'email_digest', label: 'Email Digest', desc: 'Daily email summary of fleet activity' },
                ].map(({ key, label, desc }) => (
                  <div
                    key={key}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-dark-800/50 transition-colors"
                  >
                    <div>
                      <p className="text-sm font-medium text-white">{label}</p>
                      <p className="text-xs text-gray-500">{desc}</p>
                    </div>
                    <button
                      onClick={() =>
                        setNotifications((prev) => ({ ...prev, [key]: !prev[key as keyof typeof prev] }))
                      }
                      className={`relative w-10 h-5 rounded-full transition-all duration-200 ${
                        notifications[key as keyof typeof notifications]
                          ? 'bg-primary-600'
                          : 'bg-dark-700 border border-gray-700'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${
                          notifications[key as keyof typeof notifications] ? 'translate-x-5' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Security */}
          {tab === 'security' && (
            <>
              <h3 className="font-semibold text-white flex items-center gap-2">
                <FiShield className="text-primary-400" />
                Security Settings
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Current Password</label>
                  <input type="password" placeholder="••••••••" className="input-dark" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">New Password</label>
                  <input type="password" placeholder="••••••••" className="input-dark" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Confirm New Password</label>
                  <input type="password" placeholder="••••••••" className="input-dark" />
                </div>
              </div>

              <div className="p-4 bg-dark-800/50 rounded-xl border border-gray-800">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-white">Two-Factor Authentication</p>
                    <p className="text-xs text-gray-500">Add an extra layer of security</p>
                  </div>
                  <button className="btn-secondary text-xs">
                    Enable 2FA
                  </button>
                </div>
              </div>
            </>
          )}

          {/* System */}
          {tab === 'system' && (
            <>
              <h3 className="font-semibold text-white flex items-center gap-2">
                <FiSettings className="text-primary-400" />
                System Settings
              </h3>

              <div className="space-y-3">
                {[
                  { label: 'Telemetry Poll Interval', value: '5 seconds', badge: 'live' },
                  { label: 'Dashboard Refresh Rate', value: '10 seconds', badge: 'live' },
                  { label: 'Robot List Refresh', value: '30 seconds', badge: 'polling' },
                  { label: 'Data Retention', value: '90 days', badge: 'config' },
                  { label: 'API Version', value: 'v1', badge: 'stable' },
                  { label: 'WebSocket', value: 'Socket.io', badge: 'connected' },
                ].map(({ label, value, badge }) => (
                  <div key={label} className="flex items-center justify-between p-3 bg-dark-800/50 rounded-lg border border-gray-800">
                    <span className="text-sm text-gray-400">{label}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-white font-medium">{value}</span>
                      <span className="text-xs px-1.5 py-0.5 bg-primary-600/10 text-primary-400 rounded">
                        {badge}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Save button */}
          <div className="flex justify-end pt-2 border-t border-gray-800">
            <button onClick={handleSave} className="btn-primary">
              {saved ? (
                <>
                  <FiCheck className="w-4 h-4 text-green-400" />
                  <span className="text-green-400">Saved!</span>
                </>
              ) : (
                <>
                  <FiSave className="w-4 h-4" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
