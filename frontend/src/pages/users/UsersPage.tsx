import React, { useState, useEffect, useCallback } from 'react'
import {
  FiUsers, FiPlus, FiRefreshCw, FiEdit, FiTrash2, FiX, FiCheck,
  FiMail, FiUser,
} from 'react-icons/fi'
import { formatDistanceToNow } from 'date-fns'
import { usersApi } from '../../services/api'
import LoadingSpinner from '../../components/common/LoadingSpinner'
import EmptyState from '../../components/common/EmptyState'
import ConfirmModal from '../../components/common/ConfirmModal'
import type { User, UserRole } from '../../types'

const ROLES: UserRole[] = ['super_admin', 'tenant_admin', 'fleet_manager', 'operator', 'viewer']

const ROLE_COLORS: Record<UserRole, string> = {
  super_admin:    'bg-red-500/20 text-red-400 border-red-500/30',
  tenant_admin:   'bg-purple-500/20 text-purple-400 border-purple-500/30',
  fleet_manager:  'bg-blue-500/20 text-blue-400 border-blue-500/30',
  operator:       'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  viewer:         'bg-gray-500/20 text-gray-400 border-gray-500/30',
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const [form, setForm] = useState({
    name: '',
    email: '',
    role: 'operator' as UserRole,
    password: '',
  })

  const fetchUsers = useCallback(async () => {
    try {
      const res = await usersApi.getAll()
      setUsers(res.data)
    } catch (err) {
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const handleCreate = async () => {
    setIsCreating(true)
    try {
      const user = await usersApi.create({
        name: form.name,
        email: form.email,
        role: form.role,
        password: form.password,
      })
      setUsers((prev) => [user, ...prev])
      setShowCreate(false)
      setForm({ name: '', email: '', role: 'operator', password: '' })
    } catch (err) {
      console.error(err)
    } finally {
      setIsCreating(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      await usersApi.delete(deleteTarget.id)
      setUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch (err) {
      console.error(err)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Users</h2>
          <p className="text-gray-500 text-sm">{users.length} team members</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchUsers} className="btn-secondary">
            <FiRefreshCw className="w-4 h-4" />
          </button>
          <button onClick={() => setShowCreate(true)} className="btn-primary">
            <FiPlus className="w-4 h-4" />
            Invite User
          </button>
        </div>
      </div>

      {/* Create user modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowCreate(false)} />
          <div className="relative bg-dark-900 border border-gray-800 rounded-xl shadow-xl w-full max-w-md animate-fade-in">
            <div className="flex items-center justify-between p-5 border-b border-gray-800">
              <h3 className="font-semibold text-white">Invite New User</h3>
              <button onClick={() => setShowCreate(false)} className="text-gray-500 hover:text-gray-300">
                <FiX className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Full Name *</label>
                <div className="relative">
                  <FiUser className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Jane Doe"
                    className="input-dark pl-9"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Email *</label>
                <div className="relative">
                  <FiMail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="jane@company.com"
                    className="input-dark pl-9"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Role *</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
                  className="input-dark"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">
                  Temporary Password
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="••••••••"
                  className="input-dark"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-5 pb-5">
              <button onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
              <button onClick={handleCreate} disabled={isCreating || !form.name || !form.email} className="btn-primary">
                {isCreating ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <FiCheck className="w-4 h-4" />
                )}
                Create User
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Users table */}
      <div className="card overflow-hidden p-0">
        {isLoading ? (
          <div className="py-12">
            <LoadingSpinner label="Loading users..." className="mx-auto" />
          </div>
        ) : users.length === 0 ? (
          <EmptyState
            icon={<FiUsers />}
            title="No users"
            message="Invite your first team member"
            action={
              <button onClick={() => setShowCreate(true)} className="btn-primary">
                <FiPlus className="w-4 h-4" /> Invite User
              </button>
            }
          />
        ) : (
          <table className="w-full table-dark">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last Login</th>
                <th>Joined</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary-600/20 border border-primary-600/20 flex items-center justify-center">
                        <span className="text-primary-400 font-semibold text-xs">
                          {user.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="text-white font-medium text-sm">{user.name}</p>
                        <p className="text-gray-500 text-xs">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium border capitalize ${ROLE_COLORS[user.role]}`}>
                      {user.role.replace('_', ' ')}
                    </span>
                  </td>
                  <td>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs ${
                      user.status === 'active'
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-gray-500/20 text-gray-400'
                    }`}>
                      {user.status}
                    </span>
                  </td>
                  <td>
                    <span className="text-xs text-gray-400">
                      {user.last_login
                        ? formatDistanceToNow(new Date(user.last_login), { addSuffix: true })
                        : 'Never'}
                    </span>
                  </td>
                  <td>
                    <span className="text-xs text-gray-500">
                      {formatDistanceToNow(new Date(user.created_at), { addSuffix: true })}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <button className="p-1.5 text-gray-500 hover:text-white hover:bg-dark-700 rounded-lg transition-colors">
                        <FiEdit className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(user)}
                        className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                      >
                        <FiTrash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete User"
        message={
          <>
            Remove <strong className="text-white">{deleteTarget?.name}</strong> from the platform?
            They will lose all access immediately.
          </>
        }
        confirmLabel="Delete User"
        isLoading={isDeleting}
        variant="danger"
      />
    </div>
  )
}
