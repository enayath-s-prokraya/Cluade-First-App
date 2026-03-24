import React, { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import {
  FiGrid,
  FiMap,
  FiCpu,
  FiTerminal,
  FiCheckSquare,
  FiActivity,
  FiBell,
  FiUsers,
  FiSettings,
  FiCreditCard,
  FiChevronLeft,
  FiChevronRight,
  FiLogOut,
  FiZap,
} from 'react-icons/fi'
import { useAuth } from '../../context/AuthContext'

interface NavItem {
  label: string
  to: string
  icon: React.ReactNode
}

interface NavSection {
  title: string
  items: NavItem[]
}

const navSections: NavSection[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard',  to: '/dashboard', icon: <FiGrid /> },
      { label: 'Fleet Map',  to: '/fleet',     icon: <FiMap /> },
    ],
  },
  {
    title: 'Operations',
    items: [
      { label: 'Robots',          to: '/robots',   icon: <FiCpu /> },
      { label: 'Command Center',  to: '/commands', icon: <FiTerminal /> },
      { label: 'Tasks',           to: '/tasks',    icon: <FiCheckSquare /> },
    ],
  },
  {
    title: 'Monitoring',
    items: [
      { label: 'Live Monitor', to: '/monitoring', icon: <FiActivity /> },
      { label: 'Alerts',       to: '/alerts',     icon: <FiBell /> },
    ],
  },
  {
    title: 'Management',
    items: [
      { label: 'Users',    to: '/users',    icon: <FiUsers /> },
      { label: 'Settings', to: '/settings', icon: <FiSettings /> },
    ],
  },
  {
    title: 'Account',
    items: [
      { label: 'Billing', to: '/billing', icon: <FiCreditCard /> },
    ],
  },
]

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <aside
      className={clsx(
        'relative flex flex-col bg-dark-950 border-r border-gray-800/60 transition-all duration-300 flex-shrink-0',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-5 border-b border-gray-800/60">
        <div className="flex-shrink-0 w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center shadow-glow-sm">
          <FiZap className="text-white w-4 h-4" />
        </div>
        {!collapsed && (
          <div>
            <span className="font-bold text-white text-sm tracking-wide">HCCP</span>
            <p className="text-[10px] text-gray-500 leading-tight">Robot Cloud Platform</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-5">
        {navSections.map((section) => (
          <div key={section.title}>
            {!collapsed && (
              <p className="section-title">{section.title}</p>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    className={({ isActive }) =>
                      clsx(
                        'flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm font-medium transition-all duration-200',
                        isActive
                          ? 'text-primary-400 bg-primary-600/10 border border-primary-600/20'
                          : 'text-gray-400 hover:text-gray-100 hover:bg-dark-800',
                        collapsed && 'justify-center',
                      )
                    }
                    title={collapsed ? item.label : undefined}
                  >
                    <span className="flex-shrink-0 text-[18px]">{item.icon}</span>
                    {!collapsed && <span>{item.label}</span>}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* User info + logout */}
      <div className="border-t border-gray-800/60 p-3">
        {!collapsed ? (
          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-8 h-8 rounded-full bg-primary-600/30 border border-primary-600/30 flex items-center justify-center flex-shrink-0">
              <span className="text-primary-400 font-semibold text-xs">
                {user?.name?.charAt(0).toUpperCase() ?? 'U'}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white truncate">{user?.name}</p>
              <p className="text-[10px] text-gray-500 truncate capitalize">{user?.role?.replace('_', ' ')}</p>
            </div>
          </div>
        ) : (
          <div className="flex justify-center mb-2">
            <div className="w-8 h-8 rounded-full bg-primary-600/30 border border-primary-600/30 flex items-center justify-center">
              <span className="text-primary-400 font-semibold text-xs">
                {user?.name?.charAt(0).toUpperCase() ?? 'U'}
              </span>
            </div>
          </div>
        )}

        <button
          onClick={handleLogout}
          className={clsx(
            'flex items-center gap-2 w-full px-2.5 py-2 rounded-lg text-xs text-gray-500',
            'hover:text-red-400 hover:bg-red-500/10 transition-all duration-200',
            collapsed && 'justify-center',
          )}
          title={collapsed ? 'Logout' : undefined}
        >
          <FiLogOut className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-20 w-6 h-6 bg-dark-800 border border-gray-700 rounded-full
                   flex items-center justify-center text-gray-400 hover:text-white hover:border-gray-500
                   transition-all duration-200 z-10"
      >
        {collapsed ? (
          <FiChevronRight className="w-3 h-3" />
        ) : (
          <FiChevronLeft className="w-3 h-3" />
        )}
      </button>
    </aside>
  )
}
