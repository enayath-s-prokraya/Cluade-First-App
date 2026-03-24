import React, { useState } from 'react'
import {
  FiSettings, FiUsers, FiKey, FiBell, FiLink,
  FiPlus, FiCopy, FiTrash2, FiCheck, FiEdit2, FiX,
  FiShield, FiMail,
} from 'react-icons/fi'
import { usersApi } from '../../services/api'
import type { User, UserRole } from '../../types'
import { format, formatDistanceToNow } from 'date-fns'

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_USERS: User[] = [
  { id: 'u1', tenant_id: 't1', email: 'admin@hccp.io', name: 'Admin User', role: 'tenant_admin', status: 'active', last_login: new Date(Date.now() - 3600000).toISOString(), created_at: '2024-01-01T00:00:00Z' },
  { id: 'u2', tenant_id: 't1', email: 'manager@hccp.io', name: 'Fleet Manager', role: 'fleet_manager', status: 'active', last_login: new Date(Date.now() - 86400000).toISOString(), created_at: '2024-02-01T00:00:00Z' },
  { id: 'u3', tenant_id: 't1', email: 'operator@hccp.io', name: 'Ops Operator', role: 'operator', status: 'active', last_login: new Date(Date.now() - 7200000).toISOString(), created_at: '2024-02-15T00:00:00Z' },
  { id: 'u4', tenant_id: 't1', email: 'viewer@hccp.io', name: 'Read Only', role: 'viewer', status: 'inactive', last_login: null, created_at: '2024-03-01T00:00:00Z' },
]

interface ApiKey {
  id: string
  name: string
  key: string
  created_at: string
  last_used: string | null
  permissions: string[]
}

const MOCK_KEYS: ApiKey[] = [
  { id: 'k1', name: 'Production Integration', key: 'hccp_sk_prod_••••••••••••••••••ab12', created_at: '2024-01-15T10:00:00Z', last_used: new Date(Date.now() - 3600000).toISOString(), permissions: ['read', 'write'] },
  { id: 'k2', name: 'Monitoring Webhook', key: 'hccp_sk_mon_••••••••••••••••••cd34', created_at: '2024-02-01T10:00:00Z', last_used: new Date(Date.now() - 86400000).toISOString(), permissions: ['read'] },
]

const ROLE_PERMISSIONS: Record<UserRole, Record<string, boolean>> = {
  super_admin:   { 'Manage Tenants': true, 'Manage Users': true, 'Send Commands': true, 'View Telemetry': true, 'Create Tasks': true, 'Manage Alerts': true, 'API Access': true, 'Billing': true },
  tenant_admin:  { 'Manage Tenants': false, 'Manage Users': true, 'Send Commands': true, 'View Telemetry': true, 'Create Tasks': true, 'Manage Alerts': true, 'API Access': true, 'Billing': true },
  fleet_manager: { 'Manage Tenants': false, 'Manage Users': false, 'Send Commands': true, 'View Telemetry': true, 'Create Tasks': true, 'Manage Alerts': true, 'API Access': false, 'Billing': false },
  operator:      { 'Manage Tenants': false, 'Manage Users': false, 'Send Commands': true, 'View Telemetry': true, 'Create Tasks': false, 'Manage Alerts': false, 'API Access': false, 'Billing': false },
  viewer:        { 'Manage Tenants': false, 'Manage Users': false, 'Send Commands': false, 'View Telemetry': true, 'Create Tasks': false, 'Manage Alerts': false, 'API Access': false, 'Billing': false },
}

const ROLE_DISPLAY: Record<UserRole, { label: string; color: string }> = {
  super_admin:   { label: 'Super Admin', color: '#ef4444' },
  tenant_admin:  { label: 'Admin', color: '#f97316' },
  fleet_manager: { label: 'Fleet Manager', color: '#8b5cf6' },
  operator:      { label: 'Operator', color: '#06b6d4' },
  viewer:        { label: 'Viewer', color: '#6b7280' },
}

type SettingsTab = 'general' | 'team' | 'integrations' | 'apikeys' | 'notifications'

export default function Settings() {
  const [tab, setTab] = useState<SettingsTab>('general')
  const [users, setUsers] = useState<User[]>(MOCK_USERS)
  const [apiKeys, setApiKeys] = useState<ApiKey[]>(MOCK_KEYS)
  const [showInvite, setShowInvite] = useState(false)
  const [inviteForm, setInviteForm] = useState({ email: '', name: '', role: 'operator' as UserRole })
  const [inviting, setInviting] = useState(false)
  const [copiedKey, setCopiedKey] = useState('')
  const [thresholds, setThresholds] = useState({ battery: 20, temp: 70, cpu: 90 })
  const [generalForm, setGeneralForm] = useState({ tenant_name: 'Acme Robotics Corp', plan: 'professional', timezone: 'America/New_York' })
  const [saved, setSaved] = useState(false)

  const invite = async () => {
    if (!inviteForm.email || !inviteForm.name) return
    setInviting(true)
    try {
      const user = await usersApi.create({ email: inviteForm.email, name: inviteForm.name, role: inviteForm.role })
      setUsers((prev) => [...prev, user])
    } catch {
      setUsers((prev) => [...prev, {
        id: Math.random().toString(36).slice(2),
        tenant_id: 't1',
        email: inviteForm.email,
        name: inviteForm.name,
        role: inviteForm.role,
        status: 'active',
        last_login: null,
        created_at: new Date().toISOString(),
      }])
    } finally {
      setInviting(false)
      setShowInvite(false)
      setInviteForm({ email: '', name: '', role: 'operator' })
    }
  }

  const copyKey = (key: string, id: string) => {
    navigator.clipboard.writeText(key).catch(() => {})
    setCopiedKey(id)
    setTimeout(() => setCopiedKey(''), 2000)
  }

  const revokeKey = (id: string) => {
    if (window.confirm('Revoke this API key? This cannot be undone.')) {
      setApiKeys((prev) => prev.filter((k) => k.id !== id))
    }
  }

  const generateKey = () => {
    const newKey: ApiKey = {
      id: Math.random().toString(36).slice(2),
      name: 'New API Key',
      key: `hccp_sk_${Math.random().toString(36).slice(2).padEnd(20, '0')}`,
      created_at: new Date().toISOString(),
      last_used: null,
      permissions: ['read'],
    }
    setApiKeys((prev) => [...prev, newKey])
  }

  const saveGeneral = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const TABS: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'general', label: 'General', icon: <FiSettings className="w-4 h-4" /> },
    { id: 'team', label: 'Team & RBAC', icon: <FiUsers className="w-4 h-4" /> },
    { id: 'integrations', label: 'Integrations', icon: <FiLink className="w-4 h-4" /> },
    { id: 'apikeys', label: 'API Keys', icon: <FiKey className="w-4 h-4" /> },
    { id: 'notifications', label: 'Notifications', icon: <FiBell className="w-4 h-4" /> },
  ]

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-white">Settings</h2>
        <p className="text-gray-500 text-sm">Manage your platform configuration</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-800">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.id
                ? 'text-primary-400 border-primary-500'
                : 'text-gray-500 border-transparent hover:text-gray-300'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* General Tab */}
      {tab === 'general' && (
        <div className="max-w-lg space-y-4">
          <div className="card space-y-4">
            <h3 className="text-sm font-semibold text-white">Organization</h3>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Tenant Name</label>
              <input value={generalForm.tenant_name} onChange={(e) => setGeneralForm((p) => ({ ...p, tenant_name: e.target.value }))} className="input-dark" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Current Plan</label>
              <div className="flex items-center gap-3">
                <span className="px-3 py-1 rounded-lg bg-purple-500/20 text-purple-400 text-sm font-medium border border-purple-500/30 capitalize">{generalForm.plan}</span>
                <a href="/billing" className="text-primary-400 text-xs hover:underline">Manage Plan →</a>
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Timezone</label>
              <select value={generalForm.timezone} onChange={(e) => setGeneralForm((p) => ({ ...p, timezone: e.target.value }))} className="input-dark">
                {['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'UTC', 'Europe/London', 'Europe/Berlin', 'Asia/Tokyo'].map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </div>
            <button onClick={saveGeneral} className="btn-primary">
              {saved ? <><FiCheck className="w-4 h-4" /> Saved!</> : 'Save Changes'}
            </button>
          </div>
        </div>
      )}

      {/* Team Tab */}
      {tab === 'team' && (
        <div className="space-y-5">
          {/* Invite Modal */}
          {showInvite && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
              <div className="bg-dark-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-white font-semibold">Invite User</h3>
                  <button onClick={() => setShowInvite(false)} className="text-gray-500 hover:text-gray-300"><FiX className="w-5 h-5" /></button>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Full Name</label>
                  <input value={inviteForm.name} onChange={(e) => setInviteForm((p) => ({ ...p, name: e.target.value }))} className="input-dark" placeholder="John Doe" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Email Address</label>
                  <input value={inviteForm.email} onChange={(e) => setInviteForm((p) => ({ ...p, email: e.target.value }))} className="input-dark" placeholder="user@company.com" type="email" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Role</label>
                  <select value={inviteForm.role} onChange={(e) => setInviteForm((p) => ({ ...p, role: e.target.value as UserRole }))} className="input-dark">
                    {(['tenant_admin', 'fleet_manager', 'operator', 'viewer'] as UserRole[]).map((r) => (
                      <option key={r} value={r}>{ROLE_DISPLAY[r].label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button onClick={invite} disabled={inviting} className="btn-primary flex-1 justify-center">
                    {inviting ? 'Sending...' : <><FiMail className="w-4 h-4" /> Send Invite</>}
                  </button>
                  <button onClick={() => setShowInvite(false)} className="btn-secondary">Cancel</button>
                </div>
              </div>
            </div>
          )}

          {/* User List */}
          <div className="card overflow-hidden p-0">
            <div className="p-4 flex items-center justify-between border-b border-gray-800">
              <h3 className="text-sm font-semibold text-white">Team Members ({users.length})</h3>
              <button onClick={() => setShowInvite(true)} className="btn-primary text-sm">
                <FiPlus className="w-4 h-4" /> Invite User
              </button>
            </div>
            <table className="w-full table-dark">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Last Login</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const roleCfg = ROLE_DISPLAY[user.role]
                  return (
                    <tr key={user.id}>
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white" style={{ background: roleCfg.color }}>
                            {user.name.charAt(0)}
                          </div>
                          <div>
                            <p className="text-white font-medium text-sm">{user.name}</p>
                            <p className="text-gray-500 text-xs">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium border" style={{ color: roleCfg.color, borderColor: `${roleCfg.color}40`, background: `${roleCfg.color}15` }}>
                          {roleCfg.label}
                        </span>
                      </td>
                      <td>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          user.status === 'active' ? 'text-green-400 bg-green-500/10' : 'text-gray-500 bg-gray-700/20'
                        }`}>
                          {user.status}
                        </span>
                      </td>
                      <td className="text-gray-500 text-xs">
                        {user.last_login ? formatDistanceToNow(new Date(user.last_login), { addSuffix: true }) : 'Never'}
                      </td>
                      <td className="text-gray-500 text-xs">{format(new Date(user.created_at), 'MMM d, yyyy')}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Role Permissions Matrix */}
          <div className="card overflow-hidden p-0">
            <div className="p-4 border-b border-gray-800">
              <div className="flex items-center gap-2">
                <FiShield className="w-4 h-4 text-primary-400" />
                <h3 className="text-sm font-semibold text-white">Role Permissions Matrix</h3>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase font-medium">Permission</th>
                    {(['tenant_admin', 'fleet_manager', 'operator', 'viewer'] as UserRole[]).map((role) => (
                      <th key={role} className="px-4 py-3 text-xs text-gray-500 uppercase font-medium text-center">
                        <span style={{ color: ROLE_DISPLAY[role].color }}>{ROLE_DISPLAY[role].label}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(ROLE_PERMISSIONS.tenant_admin).map((perm) => (
                    <tr key={perm} className="border-b border-gray-800/50 hover:bg-dark-800/30">
                      <td className="px-4 py-3 text-sm text-gray-300">{perm}</td>
                      {(['tenant_admin', 'fleet_manager', 'operator', 'viewer'] as UserRole[]).map((role) => (
                        <td key={role} className="px-4 py-3 text-center">
                          {ROLE_PERMISSIONS[role][perm]
                            ? <FiCheck className="w-4 h-4 text-green-400 mx-auto" />
                            : <FiX className="w-4 h-4 text-gray-700 mx-auto" />}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Integrations Tab */}
      {tab === 'integrations' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
          {[
            { name: 'Slack', desc: 'Receive alert notifications in Slack channels', connected: true, icon: '💬' },
            { name: 'PagerDuty', desc: 'Escalate critical alerts to on-call engineers', connected: false, icon: '📟' },
            { name: 'Datadog', desc: 'Export telemetry metrics to Datadog', connected: true, icon: '📊' },
            { name: 'Webhook', desc: 'Send events to any custom HTTP endpoint', connected: false, icon: '🔗' },
          ].map((integration) => (
            <div key={integration.name} className="card flex items-center gap-4">
              <span className="text-2xl">{integration.icon}</span>
              <div className="flex-1">
                <p className="text-white font-medium text-sm">{integration.name}</p>
                <p className="text-gray-500 text-xs mt-0.5">{integration.desc}</p>
              </div>
              <button className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                integration.connected
                  ? 'text-green-400 border-green-500/30 bg-green-500/10 hover:bg-green-500/20'
                  : 'text-gray-400 border-gray-700 hover:border-gray-600'
              }`}>
                {integration.connected ? 'Connected' : 'Connect'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* API Keys Tab */}
      {tab === 'apikeys' && (
        <div className="space-y-4 max-w-2xl">
          <div className="flex justify-end">
            <button onClick={generateKey} className="btn-primary">
              <FiPlus className="w-4 h-4" /> Generate Key
            </button>
          </div>
          <div className="space-y-3">
            {apiKeys.map((key) => (
              <div key={key.id} className="card space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-white font-medium text-sm">{key.name}</p>
                  <button onClick={() => revokeKey(key.id)} className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1">
                    <FiTrash2 className="w-3.5 h-3.5" /> Revoke
                  </button>
                </div>
                <div className="flex items-center gap-2 bg-dark-800 rounded-lg px-3 py-2">
                  <code className="text-xs text-gray-300 font-mono flex-1 truncate">{key.key}</code>
                  <button onClick={() => copyKey(key.key, key.id)} className="text-gray-500 hover:text-gray-300 transition-colors">
                    {copiedKey === key.id ? <FiCheck className="w-3.5 h-3.5 text-green-400" /> : <FiCopy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span>Created {format(new Date(key.created_at), 'MMM d, yyyy')}</span>
                  {key.last_used && <span>Last used {formatDistanceToNow(new Date(key.last_used), { addSuffix: true })}</span>}
                  <div className="flex gap-1">
                    {key.permissions.map((p) => (
                      <span key={p} className="px-1.5 py-0.5 rounded bg-dark-800 border border-gray-800 text-gray-400">{p}</span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notifications Tab */}
      {tab === 'notifications' && (
        <div className="max-w-lg space-y-4">
          <div className="card space-y-5">
            <h3 className="text-sm font-semibold text-white">Alert Thresholds</h3>
            <p className="text-gray-500 text-xs">Configure when alerts should be triggered</p>

            <div>
              <div className="flex justify-between mb-2">
                <label className="text-sm text-gray-300">Low Battery Alert</label>
                <span className="text-primary-400 text-sm font-medium">{thresholds.battery}%</span>
              </div>
              <input
                type="range" min={5} max={50} value={thresholds.battery}
                onChange={(e) => setThresholds((p) => ({ ...p, battery: Number(e.target.value) }))}
                className="w-full accent-cyan-500"
              />
              <div className="flex justify-between text-xs text-gray-600 mt-1">
                <span>5%</span><span>50%</span>
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-2">
                <label className="text-sm text-gray-300">High Temperature Alert</label>
                <span className="text-primary-400 text-sm font-medium">{thresholds.temp}°C</span>
              </div>
              <input
                type="range" min={50} max={100} value={thresholds.temp}
                onChange={(e) => setThresholds((p) => ({ ...p, temp: Number(e.target.value) }))}
                className="w-full accent-cyan-500"
              />
              <div className="flex justify-between text-xs text-gray-600 mt-1">
                <span>50°C</span><span>100°C</span>
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-2">
                <label className="text-sm text-gray-300">High CPU Usage Alert</label>
                <span className="text-primary-400 text-sm font-medium">{thresholds.cpu}%</span>
              </div>
              <input
                type="range" min={60} max={100} value={thresholds.cpu}
                onChange={(e) => setThresholds((p) => ({ ...p, cpu: Number(e.target.value) }))}
                className="w-full accent-cyan-500"
              />
              <div className="flex justify-between text-xs text-gray-600 mt-1">
                <span>60%</span><span>100%</span>
              </div>
            </div>

            <h3 className="text-sm font-semibold text-white pt-2">Notification Channels</h3>
            {[
              { label: 'Email notifications', desc: 'Receive alerts via email', enabled: true },
              { label: 'In-app notifications', desc: 'Show alerts in the dashboard', enabled: true },
              { label: 'Critical alerts only', desc: 'Only notify for critical severity', enabled: false },
              { label: 'Daily digest', desc: 'Summary email at 09:00 daily', enabled: false },
            ].map((setting) => (
              <div key={setting.label} className="flex items-center justify-between py-2 border-b border-gray-800/50 last:border-0">
                <div>
                  <p className="text-gray-200 text-sm">{setting.label}</p>
                  <p className="text-gray-600 text-xs">{setting.desc}</p>
                </div>
                <div className={`w-10 h-6 rounded-full relative cursor-pointer transition-colors ${setting.enabled ? 'bg-primary-600' : 'bg-gray-700'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${setting.enabled ? 'right-1' : 'left-1'}`} />
                </div>
              </div>
            ))}
            <button onClick={saveGeneral} className="btn-primary w-full justify-center">
              {saved ? <><FiCheck className="w-4 h-4" /> Saved!</> : 'Save Notification Settings'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
