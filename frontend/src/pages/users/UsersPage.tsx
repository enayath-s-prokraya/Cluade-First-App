import React, { useState, useEffect, useCallback } from 'react'
import {
  FiUsers, FiPlus, FiEdit2, FiTrash2, FiCheck, FiX,
  FiMail, FiShield, FiRefreshCw, FiSearch,
} from 'react-icons/fi'
import { usersApi } from '../../services/api'
import type { User, UserRole } from '../../types'
import { format, formatDistanceToNow } from 'date-fns'

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_USERS: User[] = [
  { id: 'u1', tenant_id: 't1', email: 'admin@hccp.io', name: 'Alex Admin', role: 'tenant_admin', status: 'active', last_login: new Date(Date.now() - 3600000).toISOString(), created_at: '2024-01-01T00:00:00Z' },
  { id: 'u2', tenant_id: 't1', email: 'manager@hccp.io', name: 'Maria Manager', role: 'fleet_manager', status: 'active', last_login: new Date(Date.now() - 86400000).toISOString(), created_at: '2024-02-01T00:00:00Z' },
  { id: 'u3', tenant_id: 't1', email: 'ops@hccp.io', name: 'Oliver Operator', role: 'operator', status: 'active', last_login: new Date(Date.now() - 7200000).toISOString(), created_at: '2024-02-15T00:00:00Z' },
  { id: 'u4', tenant_id: 't1', email: 'viewer@hccp.io', name: 'Victoria Viewer', role: 'viewer', status: 'inactive', last_login: null, created_at: '2024-03-01T00:00:00Z' },
  { id: 'u5', tenant_id: 't1', email: 'sam@hccp.io', name: 'Sam Singh', role: 'operator', status: 'active', last_login: new Date(Date.now() - 172800000).toISOString(), created_at: '2024-03-15T00:00:00Z' },
]

const ROLE_CONFIG: Record<UserRole, { label: string; color: string; desc: string }> = {
  super_admin:   { label: 'Super Admin', color: '#ef4444', desc: 'Full platform access' },
  tenant_admin:  { label: 'Admin', color: '#f97316', desc: 'Full tenant access' },
  fleet_manager: { label: 'Fleet Manager', color: '#8b5cf6', desc: 'Manage fleet operations' },
  operator:      { label: 'Operator', color: '#06b6d4', desc: 'Send commands, view data' },
  viewer:        { label: 'Viewer', color: '#6b7280', desc: 'Read-only access' },
}

const ROLE_PERMS: Record<UserRole, string[]> = {
  super_admin:   ['Manage Tenants', 'Manage Users', 'Send Commands', 'View All Data', 'Create Tasks', 'Manage Alerts', 'API Access', 'Billing'],
  tenant_admin:  ['Manage Users', 'Send Commands', 'View All Data', 'Create Tasks', 'Manage Alerts', 'API Access', 'Billing'],
  fleet_manager: ['Send Commands', 'View All Data', 'Create Tasks', 'Manage Alerts'],
  operator:      ['Send Commands', 'View Telemetry', 'View Commands'],
  viewer:        ['View Telemetry', 'View Alerts'],
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showPanel, setShowPanel] = useState(false)
  const [editUser, setEditUser] = useState<User | null>(null)
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null)
  const [form, setForm] = useState({ name: '', email: '', role: 'operator' as UserRole })
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const fetchUsers = useCallback(async () => {
    try {
      const res = await usersApi.getAll()
      setUsers(res.data)
    } catch {
      setUsers(MOCK_USERS)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const displayUsers = (users.length > 0 ? users : MOCK_USERS).filter((u) =>
    !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())
  )

  const openInvite = () => {
    setEditUser(null)
    setForm({ name: '', email: '', role: 'operator' })
    setShowPanel(true)
  }

  const openEdit = (user: User) => {
    setEditUser(user)
    setForm({ name: user.name, email: user.email, role: user.role })
    setShowPanel(true)
  }

  const saveUser = async () => {
    if (!form.name || !form.email) return
    setSaving(true)
    try {
      if (editUser) {
        const updated = await usersApi.update(editUser.id, { name: form.name, role: form.role })
        setUsers((prev) => prev.map((u) => (u.id === editUser.id ? updated : u)))
      } else {
        const created = await usersApi.create({ email: form.email, name: form.name, role: form.role })
        setUsers((prev) => [...prev, created])
      }
      setShowPanel(false)
    } catch {
      if (editUser) {
        setUsers((prev) => prev.map((u) => u.id === editUser.id ? { ...u, name: form.name, role: form.role } : u))
      } else {
        setUsers((prev) => [...prev, {
          id: Math.random().toString(36).slice(2), tenant_id: 't1',
          email: form.email, name: form.name, role: form.role,
          status: 'active', last_login: null, created_at: new Date().toISOString(),
        }])
      }
      setShowPanel(false)
    } finally {
      setSaving(false)
    }
  }

  const toggleStatus = async (user: User) => {
    const newStatus = user.status === 'active' ? 'inactive' : 'active'
    try {
      await usersApi.update(user.id, { status: newStatus })
    } catch { /* ignore */ }
    setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, status: newStatus } : u))
  }

  const deleteUser = async (id: string) => {
    try {
      await usersApi.delete(id)
    } catch { /* ignore */ }
    setUsers((prev) => prev.filter((u) => u.id !== id))
    setDeleteConfirm(null)
  }

  return (
    <div className="flex gap-5 animate-fade-in">
      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">User Management</h2>
            <p className="text-gray-500 text-sm">{displayUsers.length} users</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchUsers} className="btn-secondary">
              <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={openInvite} className="btn-primary">
              <FiPlus className="w-4 h-4" /> Invite User
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="card">
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search users by name or email..."
              className="input-dark pl-9"
            />
          </div>
        </div>

        {/* User Table */}
        <div className="card overflow-hidden p-0">
          {loading ? (
            <div className="py-16 text-center text-gray-500">Loading users...</div>
          ) : (
            <table className="w-full table-dark">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Last Login</th>
                  <th>Joined</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayUsers.map((user) => {
                  const roleCfg = ROLE_CONFIG[user.role]
                  return (
                    <tr key={user.id}>
                      <td>
                        <div className="flex items-center gap-3">
                          <div
                            className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                            style={{ background: roleCfg.color }}
                          >
                            {user.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-white text-sm font-medium">{user.name}</p>
                            <p className="text-gray-500 text-xs">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span
                          className="px-2.5 py-0.5 rounded-full text-xs font-medium border"
                          style={{ color: roleCfg.color, borderColor: `${roleCfg.color}40`, background: `${roleCfg.color}15` }}
                        >
                          {roleCfg.label}
                        </span>
                      </td>
                      <td>
                        <button
                          onClick={() => toggleStatus(user)}
                          className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${
                            user.status === 'active'
                              ? 'bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20'
                              : 'bg-gray-700/30 text-gray-500 border border-gray-700 hover:bg-gray-700/50'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${user.status === 'active' ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`} />
                          {user.status === 'active' ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td className="text-gray-500 text-xs">
                        {user.last_login ? formatDistanceToNow(new Date(user.last_login), { addSuffix: true }) : 'Never'}
                      </td>
                      <td className="text-gray-500 text-xs">
                        {format(new Date(user.created_at), 'MMM d, yyyy')}
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <button onClick={() => openEdit(user)} className="p-1.5 text-gray-500 hover:text-gray-300 hover:bg-dark-700 rounded transition-colors">
                            <FiEdit2 className="w-3.5 h-3.5" />
                          </button>
                          {deleteConfirm === user.id ? (
                            <div className="flex items-center gap-1">
                              <button onClick={() => deleteUser(user.id)} className="p-1.5 text-red-400 hover:bg-red-500/10 rounded transition-colors">
                                <FiCheck className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => setDeleteConfirm(null)} className="p-1.5 text-gray-500 hover:bg-dark-700 rounded transition-colors">
                                <FiX className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => setDeleteConfirm(user.id)} className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors">
                              <FiTrash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Role Permissions Sidebar */}
      <div className="w-72 flex-shrink-0 space-y-4">
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <FiShield className="w-4 h-4 text-primary-400" />
            <h3 className="text-sm font-semibold text-white">Role Permissions</h3>
          </div>
          <div className="space-y-2">
            {(Object.keys(ROLE_CONFIG) as UserRole[]).filter(r => r !== 'super_admin').map((role) => {
              const cfg = ROLE_CONFIG[role]
              return (
                <button
                  key={role}
                  onClick={() => setSelectedRole(selectedRole === role ? null : role)}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    selectedRole === role
                      ? 'border-opacity-50 bg-opacity-10'
                      : 'border-gray-800 hover:border-gray-700'
                  }`}
                  style={selectedRole === role ? { borderColor: cfg.color, background: `${cfg.color}10` } : {}}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium" style={{ color: cfg.color }}>{cfg.label}</span>
                    <span className="text-gray-600 text-xs">{ROLE_PERMS[role].length} perms</span>
                  </div>
                  <p className="text-gray-600 text-xs mt-0.5">{cfg.desc}</p>
                </button>
              )
            })}
          </div>

          {selectedRole && (
            <div className="mt-4 pt-4 border-t border-gray-800">
              <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wide">
                {ROLE_CONFIG[selectedRole].label} Permissions
              </p>
              <div className="space-y-1.5">
                {ROLE_PERMS[selectedRole].map((perm) => (
                  <div key={perm} className="flex items-center gap-2 text-xs text-gray-300">
                    <FiCheck className="w-3 h-3 text-green-400 flex-shrink-0" />
                    {perm}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Slide-over panel */}
      {showPanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/50">
          <div className="w-full max-w-md h-full bg-dark-900 border-l border-gray-800 flex flex-col shadow-2xl">
            <div className="p-6 border-b border-gray-800 flex items-center justify-between">
              <div>
                <h3 className="text-white font-semibold">{editUser ? 'Edit User' : 'Invite User'}</h3>
                <p className="text-gray-500 text-sm mt-0.5">{editUser ? 'Update user details and role' : 'Send an invitation to join the platform'}</p>
              </div>
              <button onClick={() => setShowPanel(false)} className="p-2 text-gray-500 hover:text-gray-300 rounded-lg hover:bg-dark-800 transition-colors">
                <FiX className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Full Name</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  className="input-dark"
                  placeholder="John Doe"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Email Address</label>
                <div className="relative">
                  <FiMail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
                  <input
                    value={form.email}
                    onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                    className="input-dark pl-9"
                    placeholder="user@company.com"
                    type="email"
                    disabled={!!editUser}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-2">Role</label>
                <div className="space-y-2">
                  {(Object.keys(ROLE_CONFIG) as UserRole[]).filter(r => r !== 'super_admin').map((role) => {
                    const cfg = ROLE_CONFIG[role]
                    return (
                      <button
                        key={role}
                        onClick={() => setForm((p) => ({ ...p, role }))}
                        className={`w-full text-left p-3 rounded-lg border transition-all ${
                          form.role === role
                            ? 'border-opacity-50'
                            : 'border-gray-800 hover:border-gray-700'
                        }`}
                        style={form.role === role ? { borderColor: cfg.color, background: `${cfg.color}10` } : {}}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium" style={{ color: form.role === role ? cfg.color : '#d1d5db' }}>{cfg.label}</span>
                          {form.role === role && <FiCheck className="w-4 h-4" style={{ color: cfg.color }} />}
                        </div>
                        <p className="text-gray-600 text-xs mt-0.5">{cfg.desc}</p>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {ROLE_PERMS[role].slice(0, 3).map((p) => (
                            <span key={p} className="text-xs px-1.5 py-0.5 rounded bg-dark-800 text-gray-500">{p}</span>
                          ))}
                          {ROLE_PERMS[role].length > 3 && <span className="text-xs text-gray-600">+{ROLE_PERMS[role].length - 3} more</span>}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-800 flex gap-3">
              <button onClick={saveUser} disabled={saving || !form.name || !form.email} className="btn-primary flex-1 justify-center">
                {saving ? 'Saving...' : editUser ? <><FiCheck className="w-4 h-4" /> Save Changes</> : <><FiMail className="w-4 h-4" /> Send Invite</>}
              </button>
              <button onClick={() => setShowPanel(false)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
