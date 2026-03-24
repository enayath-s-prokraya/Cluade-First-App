import React, { useState, useEffect, useCallback } from 'react'
import {
  FiPlus, FiMessageSquare, FiRefreshCw, FiFilter,
  FiClock, FiCheckCircle, FiAlertCircle, FiActivity,
  FiList, FiLayout, FiCpu,
} from 'react-icons/fi'
import { tasksApi, robotsApi } from '../../services/api'
import { useSocket } from '../../services/socket'
import StatusBadge from '../../components/common/StatusBadge'
import type { Task, Robot, TaskStatus } from '../../types'
import { format, formatDistanceToNow } from 'date-fns'

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_TASKS: Task[] = [
  { id: 't1', robot_id: 'r1', tenant_id: 'tn1', name: 'Assembly Line Inspection', description: 'Inspect all components on line A', type: 'inspection', status: 'executing', priority: 'high', nlp_input: 'Inspect assembly line A for defects', steps: [{ id: 's1', name: 'Navigate to Line A', status: 'completed', order: 1 }, { id: 's2', name: 'Scan components', status: 'executing', order: 2 }, { id: 's3', name: 'Generate report', status: 'queued', order: 3 }], created_by: 'admin', assigned_at: new Date(Date.now() - 3600000).toISOString(), started_at: new Date(Date.now() - 1800000).toISOString(), completed_at: null, progress: 65 },
  { id: 't2', robot_id: 'r2', tenant_id: 'tn1', name: 'Package Pickup - Zone C', description: 'Pick up packages from Zone C and deliver to shipping', type: 'logistics', status: 'queued', priority: 'normal', nlp_input: null, steps: [{ id: 's4', name: 'Navigate to Zone C', status: 'queued', order: 1 }, { id: 's5', name: 'Pick packages', status: 'queued', order: 2 }, { id: 's6', name: 'Deliver to shipping', status: 'queued', order: 3 }], created_by: 'admin', assigned_at: null, started_at: null, completed_at: null, progress: 0 },
  { id: 't3', robot_id: 'r5', tenant_id: 'tn1', name: 'Welding Task #442', description: 'Complete welding on frame joints', type: 'welding', status: 'assigned', priority: 'high', nlp_input: null, steps: [{ id: 's7', name: 'Load welding program', status: 'completed', order: 1 }, { id: 's8', name: 'Execute welds 1-10', status: 'queued', order: 2 }], created_by: 'system', assigned_at: new Date(Date.now() - 900000).toISOString(), started_at: null, completed_at: null, progress: 0 },
  { id: 't4', robot_id: 'r1', tenant_id: 'tn1', name: 'Daily Maintenance Check', description: 'Run self-diagnostics and report', type: 'maintenance', status: 'completed', priority: 'low', nlp_input: null, steps: [{ id: 's9', name: 'Run diagnostics', status: 'completed', order: 1 }, { id: 's10', name: 'Submit report', status: 'completed', order: 2 }], created_by: 'scheduler', assigned_at: new Date(Date.now() - 86400000).toISOString(), started_at: new Date(Date.now() - 86400000).toISOString(), completed_at: new Date(Date.now() - 82800000).toISOString(), progress: 100 },
  { id: 't5', robot_id: 'r3', tenant_id: 'tn1', name: 'Inventory Count - Warehouse B', description: 'Count and log all items in Warehouse B', type: 'inventory', status: 'failed', priority: 'normal', nlp_input: 'Count items in warehouse B', steps: [{ id: 's11', name: 'Navigate to WH-B', status: 'completed', order: 1 }, { id: 's12', name: 'Scan shelves', status: 'failed', order: 2 }], created_by: 'admin', assigned_at: new Date(Date.now() - 7200000).toISOString(), started_at: new Date(Date.now() - 7200000).toISOString(), completed_at: null, progress: 45 },
]

const MOCK_ROBOTS: Robot[] = [
  { id: 'r1', tenant_id: 't1', name: 'Alpha-7', type: 'humanoid', model: 'HX-3000', serial_number: 'SN-001', status: 'online', battery_level: 82, location_lat: null, location_lng: null, location_name: 'Warehouse A', firmware_version: '2.4.1', ip_address: null, registered_at: '', last_seen: null, tags: [], metadata: {} },
  { id: 'r2', tenant_id: 't1', name: 'Beta-3', type: 'humanoid', model: 'HX-3000', serial_number: 'SN-002', status: 'online', battery_level: 67, location_lat: null, location_lng: null, location_name: 'Line B', firmware_version: '2.4.1', ip_address: null, registered_at: '', last_seen: null, tags: [], metadata: {} },
  { id: 'r5', tenant_id: 't1', name: 'Epsilon-2', type: 'arm', model: 'RA-100', serial_number: 'SN-005', status: 'online', battery_level: 91, location_lat: null, location_lng: null, location_name: 'Line A', firmware_version: '2.0.5', ip_address: null, registered_at: '', last_seen: null, tags: [], metadata: {} },
]

// ─── Task Card ────────────────────────────────────────────────────────────────

const PRIORITY_COLORS: Record<string, string> = {
  low: '#6b7280', normal: '#3b82f6', high: '#f59e0b', critical: '#ef4444',
}

function TaskCard({ task, robotName }: { task: Task; robotName: string }) {
  return (
    <div className="card hover:border-gray-700 transition-all duration-200 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="text-white text-sm font-semibold leading-tight">{task.name}</h4>
          <div className="flex items-center gap-1.5 mt-1">
            <FiCpu className="w-3 h-3 text-gray-600" />
            <span className="text-gray-500 text-xs">{robotName}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <StatusBadge type="task" value={task.status} />
          <span className="text-xs font-medium capitalize" style={{ color: PRIORITY_COLORS[task.priority] }}>{task.priority}</span>
        </div>
      </div>

      {task.progress > 0 && task.progress < 100 && (
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-gray-500">Progress</span>
            <span className="text-gray-400">{task.progress}%</span>
          </div>
          <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-primary-500 transition-all duration-500"
              style={{ width: `${task.progress}%` }}
            />
          </div>
        </div>
      )}

      <div className="text-xs text-gray-500 flex items-center gap-1">
        <FiClock className="w-3 h-3" />
        {task.started_at
          ? `Started ${formatDistanceToNow(new Date(task.started_at), { addSuffix: true })}`
          : task.assigned_at
          ? `Assigned ${formatDistanceToNow(new Date(task.assigned_at), { addSuffix: true })}`
          : `Created ${formatDistanceToNow(new Date(task.id), { addSuffix: true })}`}
      </div>

      {task.steps.length > 0 && (
        <div className="space-y-1">
          {task.steps.slice(0, 3).map((step) => (
            <div key={step.id} className="flex items-center gap-2 text-xs">
              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                step.status === 'completed' ? 'bg-green-400' :
                step.status === 'executing' ? 'bg-cyan-400' :
                step.status === 'failed' ? 'bg-red-400' : 'bg-gray-700'
              }`} />
              <span className={step.status === 'completed' ? 'text-gray-600 line-through' : 'text-gray-400'}>{step.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

const COLUMNS: { id: TaskStatus; label: string; color: string }[] = [
  { id: 'queued', label: 'Queued', color: '#6b7280' },
  { id: 'assigned', label: 'Assigned', color: '#3b82f6' },
  { id: 'executing', label: 'Executing', color: '#06b6d4' },
  { id: 'completed', label: 'Completed', color: '#10b981' },
]

export default function TaskManager() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [robots, setRobots] = useState<Robot[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban')
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [nlpText, setNlpText] = useState('')
  const [nlpRobotId, setNlpRobotId] = useState('')
  const [nlpLoading, setNlpLoading] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createForm, setCreateForm] = useState({ name: '', type: 'inspection', robot_id: '', priority: 'normal', description: '' })
  const [creating, setCreating] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const [tasksRes, robotsRes] = await Promise.allSettled([
        tasksApi.getAll({ per_page: 50 }),
        robotsApi.getAll({ per_page: 50 }),
      ])
      if (tasksRes.status === 'fulfilled') setTasks(tasksRes.value.data)
      if (robotsRes.status === 'fulfilled') setRobots(robotsRes.value.data)
    } catch {
      setTasks(MOCK_TASKS)
      setRobots(MOCK_ROBOTS)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  useSocket('task_update', (task) => {
    setTasks((prev) => {
      const idx = prev.findIndex((t) => t.id === task.id)
      if (idx >= 0) return prev.map((t) => (t.id === task.id ? task : t))
      return [task, ...prev]
    })
  })

  const displayTasks = (tasks.length > 0 ? tasks : MOCK_TASKS).filter((t) => {
    if (statusFilter && t.status !== statusFilter) return false
    if (priorityFilter && t.priority !== priorityFilter) return false
    return true
  })

  const displayRobots = robots.length > 0 ? robots : MOCK_ROBOTS

  const getRobotName = (robotId: string) =>
    displayRobots.find((r) => r.id === robotId)?.name || robotId

  const stats = {
    total: displayTasks.length,
    queued: displayTasks.filter((t) => t.status === 'queued').length,
    executing: displayTasks.filter((t) => t.status === 'executing').length,
    completed: displayTasks.filter((t) => t.status === 'completed').length,
  }

  const createNlpTask = async () => {
    if (!nlpText.trim()) return
    setNlpLoading(true)
    try {
      const task = await tasksApi.nlpTask(nlpText, nlpRobotId || undefined)
      setTasks((prev) => [task, ...prev])
      setNlpText('')
      setNlpRobotId('')
    } catch {
      const mockTask: Task = {
        id: Math.random().toString(36).slice(2),
        robot_id: nlpRobotId || 'r1',
        tenant_id: 'tn1',
        name: nlpText.slice(0, 50),
        description: nlpText,
        type: 'custom',
        status: 'queued',
        priority: 'normal',
        nlp_input: nlpText,
        steps: [
          { id: 's1', name: 'Parse instructions', status: 'completed', order: 1 },
          { id: 's2', name: 'Execute task', status: 'queued', order: 2 },
        ],
        created_by: 'user',
        assigned_at: null, started_at: null, completed_at: null,
        progress: 0,
      }
      setTasks((prev) => [mockTask, ...prev])
      setNlpText('')
    } finally {
      setNlpLoading(false)
    }
  }

  const createTask = async () => {
    if (!createForm.name || !createForm.robot_id) return
    setCreating(true)
    try {
      const task = await tasksApi.create({
        robot_id: createForm.robot_id,
        name: createForm.name,
        description: createForm.description,
        type: createForm.type,
        priority: createForm.priority,
      })
      setTasks((prev) => [task, ...prev])
      setShowCreateForm(false)
      setCreateForm({ name: '', type: 'inspection', robot_id: '', priority: 'normal', description: '' })
    } catch {
      // fallback - just close
      setShowCreateForm(false)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Task Manager</h2>
          <p className="text-gray-500 text-sm">Manage robot task assignments</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchData} className="btn-secondary">
            <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setShowCreateForm(true)} className="btn-primary">
            <FiPlus className="w-4 h-4" /> New Task
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Tasks', value: stats.total, icon: <FiList />, color: '#06b6d4' },
          { label: 'Queued', value: stats.queued, icon: <FiClock />, color: '#6b7280' },
          { label: 'Executing', value: stats.executing, icon: <FiActivity />, color: '#06b6d4' },
          { label: 'Completed Today', value: stats.completed, icon: <FiCheckCircle />, color: '#10b981' },
        ].map((s) => (
          <div key={s.label} className="card flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${s.color}20`, color: s.color }}>
              {s.icon}
            </div>
            <div>
              <p className="text-gray-500 text-xs">{s.label}</p>
              <p className="text-white text-xl font-bold">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* NLP Task Creator */}
      <div className="card space-y-3">
        <div className="flex items-center gap-2">
          <FiMessageSquare className="w-4 h-4 text-primary-400" />
          <h3 className="text-sm font-semibold text-white">NLP Task Creator</h3>
        </div>
        <p className="text-gray-500 text-xs">Describe a task in natural language and AI will create it automatically</p>
        <textarea
          value={nlpText}
          onChange={(e) => setNlpText(e.target.value)}
          rows={3}
          placeholder="e.g. Inspect all assembly robots on line A for defects, prioritize joints and actuators, then generate a maintenance report..."
          className="input-dark resize-none"
        />
        <div className="flex items-center gap-3">
          <select value={nlpRobotId} onChange={(e) => setNlpRobotId(e.target.value)} className="input-dark w-48">
            <option value="">Auto-assign robot</option>
            {displayRobots.filter((r) => r.status === 'online').map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <button onClick={createNlpTask} disabled={nlpLoading || !nlpText.trim()} className="btn-primary">
            {nlpLoading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <FiPlus className="w-4 h-4" />}
            {nlpLoading ? 'Creating...' : 'Create Task'}
          </button>
        </div>
      </div>

      {/* Create Form Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-dark-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <h3 className="text-white font-semibold">Create New Task</h3>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Task Name</label>
              <input value={createForm.name} onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))} className="input-dark" placeholder="Task name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Type</label>
                <select value={createForm.type} onChange={(e) => setCreateForm((p) => ({ ...p, type: e.target.value }))} className="input-dark">
                  {['inspection', 'logistics', 'welding', 'maintenance', 'inventory', 'custom'].map((t) => (
                    <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Priority</label>
                <select value={createForm.priority} onChange={(e) => setCreateForm((p) => ({ ...p, priority: e.target.value }))} className="input-dark">
                  {['low', 'normal', 'high', 'critical'].map((p) => (
                    <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Assign Robot</label>
              <select value={createForm.robot_id} onChange={(e) => setCreateForm((p) => ({ ...p, robot_id: e.target.value }))} className="input-dark">
                <option value="">Select robot</option>
                {displayRobots.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.status})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Description</label>
              <textarea value={createForm.description} onChange={(e) => setCreateForm((p) => ({ ...p, description: e.target.value }))} rows={3} className="input-dark resize-none" />
            </div>
            <div className="flex gap-2">
              <button onClick={createTask} disabled={creating || !createForm.name || !createForm.robot_id} className="btn-primary flex-1 justify-center">
                {creating ? 'Creating...' : 'Create Task'}
              </button>
              <button onClick={() => setShowCreateForm(false)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Filters + View toggle */}
      <div className="flex items-center gap-3">
        <FiFilter className="text-gray-500 w-4 h-4" />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input-dark w-40">
          <option value="">All Statuses</option>
          {['queued','assigned','executing','completed','failed','cancelled'].map((s) => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
        <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="input-dark w-36">
          <option value="">All Priorities</option>
          {['low','normal','high','critical'].map((p) => (
            <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
          ))}
        </select>
        <div className="ml-auto flex items-center border border-gray-700 rounded-lg overflow-hidden">
          <button onClick={() => setViewMode('kanban')} className={`p-2 transition-colors ${viewMode === 'kanban' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}><FiLayout className="w-4 h-4" /></button>
          <button onClick={() => setViewMode('list')} className={`p-2 transition-colors ${viewMode === 'list' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}><FiList className="w-4 h-4" /></button>
        </div>
      </div>

      {/* Kanban View */}
      {viewMode === 'kanban' && (
        <div className="grid grid-cols-4 gap-4">
          {COLUMNS.map((col) => {
            const colTasks = displayTasks.filter((t) => t.status === col.id)
            return (
              <div key={col.id} className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <div className="w-2 h-2 rounded-full" style={{ background: col.color }} />
                  <span className="text-sm font-medium text-gray-300">{col.label}</span>
                  <span className="ml-auto text-xs text-gray-600 bg-dark-800 px-2 py-0.5 rounded-full">{colTasks.length}</span>
                </div>
                <div className="space-y-3 min-h-24">
                  {colTasks.map((task) => (
                    <TaskCard key={task.id} task={task} robotName={getRobotName(task.robot_id)} />
                  ))}
                  {colTasks.length === 0 && (
                    <div className="text-center text-gray-700 text-xs py-8 border border-dashed border-gray-800 rounded-xl">No tasks</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <div className="card overflow-hidden p-0">
          <table className="w-full table-dark">
            <thead>
              <tr>
                <th>Task</th>
                <th>Robot</th>
                <th>Type</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Progress</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {displayTasks.map((task) => (
                <tr key={task.id}>
                  <td>
                    <div>
                      <p className="text-white text-sm font-medium">{task.name}</p>
                      <p className="text-gray-600 text-xs truncate max-w-xs">{task.description}</p>
                    </div>
                  </td>
                  <td className="text-gray-400">{getRobotName(task.robot_id)}</td>
                  <td className="capitalize text-gray-400">{task.type}</td>
                  <td><StatusBadge type="task" value={task.status} /></td>
                  <td>
                    <span className="text-xs font-medium capitalize" style={{ color: PRIORITY_COLORS[task.priority] }}>{task.priority}</span>
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full bg-primary-500 rounded-full" style={{ width: `${task.progress}%` }} />
                      </div>
                      <span className="text-xs text-gray-500">{task.progress}%</span>
                    </div>
                  </td>
                  <td className="text-gray-500 text-xs">
                    {task.assigned_at ? formatDistanceToNow(new Date(task.assigned_at), { addSuffix: true }) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
