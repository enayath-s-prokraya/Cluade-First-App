import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import clsx from 'clsx'
import { FiBell, FiSearch, FiUser, FiSettings, FiLogOut, FiWifi, FiWifiOff } from 'react-icons/fi'
import { format } from 'date-fns'
import { useAuth } from '../../context/AuthContext'
import { useSocketStatus } from '../../services/socket'
import { useAlerts } from '../../hooks/useAlerts'

const routeTitles: Record<string, string> = {
  '/dashboard':          'Dashboard',
  '/fleet':              'Fleet Map',
  '/robots':             'Robots',
  '/robots/register':    'Register Robot',
  '/commands':           'Command Center',
  '/tasks':              'Task Manager',
  '/monitoring':         'Live Monitor',
  '/alerts':             'Alerts',
  '/users':              'Users',
  '/settings':           'Settings',
  '/billing':            'Billing',
}

export default function Header() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const connected = useSocketStatus()
  const { stats: alertStats } = useAlerts({ status: 'open', per_page: 1 })

  const [clock, setClock] = useState(new Date())
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Clock tick
  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
        setNotifOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Get page title
  const pageTitle = (() => {
    if (location.pathname.startsWith('/robots/') && location.pathname !== '/robots/register') {
      return 'Robot Detail'
    }
    return routeTitles[location.pathname] ?? 'HCCP'
  })()

  const openAlerts = alertStats?.open ?? 0

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <header className="h-14 flex items-center justify-between px-6 bg-dark-950/90 backdrop-blur-sm border-b border-gray-800/60 flex-shrink-0">
      {/* Left: Page title */}
      <div className="flex items-center gap-3">
        <h1 className="text-base font-semibold text-white">{pageTitle}</h1>
      </div>

      {/* Center: Search */}
      <div className="flex-1 max-w-md mx-8">
        <div className="relative">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
          <input
            type="text"
            placeholder="Search robots, commands, alerts..."
            className="w-full bg-dark-800/60 border border-gray-800 hover:border-gray-700 focus:border-primary-500/50
                       focus:ring-1 focus:ring-primary-500/20 text-gray-300 placeholder-gray-600 text-sm
                       rounded-lg pl-9 pr-4 py-1.5 outline-none transition-all duration-200"
          />
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-3" ref={dropdownRef}>
        {/* Clock */}
        <span className="text-xs font-mono text-gray-500 hidden lg:block">
          {format(clock, 'HH:mm:ss')}
        </span>

        {/* Socket status */}
        <div
          className={clsx(
            'flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border',
            connected
              ? 'text-green-400 bg-green-500/10 border-green-500/20'
              : 'text-gray-500 bg-gray-800 border-gray-700',
          )}
        >
          {connected ? (
            <FiWifi className="w-3 h-3" />
          ) : (
            <FiWifiOff className="w-3 h-3" />
          )}
          <span className="hidden sm:block">{connected ? 'Live' : 'Offline'}</span>
        </div>

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => { setNotifOpen(!notifOpen); setDropdownOpen(false) }}
            className="relative p-2 text-gray-400 hover:text-white hover:bg-dark-800 rounded-lg transition-all duration-200"
          >
            <FiBell className="w-4.5 h-4.5" />
            {openAlerts > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {openAlerts > 9 ? '9+' : openAlerts}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 top-full mt-2 w-64 bg-dark-900 border border-gray-800 rounded-xl shadow-xl z-50">
              <div className="p-3 border-b border-gray-800">
                <p className="text-xs font-semibold text-gray-300">Notifications</p>
              </div>
              <div className="p-4 text-center">
                <p className="text-xs text-gray-500">
                  {openAlerts > 0
                    ? `${openAlerts} open alert${openAlerts > 1 ? 's' : ''}`
                    : 'No new notifications'}
                </p>
                {openAlerts > 0 && (
                  <button
                    className="mt-2 text-xs text-primary-400 hover:text-primary-300"
                    onClick={() => { navigate('/alerts'); setNotifOpen(false) }}
                  >
                    View all alerts
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* User dropdown */}
        <div className="relative">
          <button
            onClick={() => { setDropdownOpen(!dropdownOpen); setNotifOpen(false) }}
            className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-dark-800 transition-all duration-200"
          >
            <div className="w-7 h-7 rounded-full bg-primary-600/30 border border-primary-600/30 flex items-center justify-center">
              <span className="text-primary-400 font-semibold text-xs">
                {user?.name?.charAt(0).toUpperCase() ?? 'U'}
              </span>
            </div>
            <span className="text-sm text-gray-300 hidden md:block">{user?.name}</span>
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-52 bg-dark-900 border border-gray-800 rounded-xl shadow-xl z-50">
              <div className="p-3 border-b border-gray-800">
                <p className="text-sm font-medium text-white truncate">{user?.name}</p>
                <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                <span className="inline-block mt-1 px-2 py-0.5 bg-primary-600/20 text-primary-400 text-[10px] rounded-full capitalize">
                  {user?.role?.replace('_', ' ')}
                </span>
              </div>
              <div className="p-1">
                <button
                  onClick={() => { navigate('/settings'); setDropdownOpen(false) }}
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-dark-800 rounded-lg transition-colors"
                >
                  <FiUser className="w-4 h-4" />
                  Profile
                </button>
                <button
                  onClick={() => { navigate('/settings'); setDropdownOpen(false) }}
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-dark-800 rounded-lg transition-colors"
                >
                  <FiSettings className="w-4 h-4" />
                  Settings
                </button>
                <div className="border-t border-gray-800 my-1" />
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                >
                  <FiLogOut className="w-4 h-4" />
                  Logout
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
