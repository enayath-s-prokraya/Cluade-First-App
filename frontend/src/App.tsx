import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import MainLayout from './components/Layout/MainLayout'

// Pages
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import FleetMap from './pages/fleet/FleetMap'
import RobotList from './pages/robots/RobotList'
import RegisterRobot from './pages/robots/RegisterRobot'
import RobotDetail from './pages/robots/RobotDetail'
import CommandCenter from './pages/commands/CommandCenter'
import TaskManager from './pages/tasks/TaskManager'
import MonitoringDashboard from './pages/monitoring/MonitoringDashboard'
import AlertsPage from './pages/alerts/AlertsPage'
import UsersPage from './pages/users/UsersPage'
import Settings from './pages/settings/Settings'
import Billing from './pages/billing/Billing'

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />

          {/* Protected routes inside MainLayout */}
          <Route element={<MainLayout />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/fleet" element={<FleetMap />} />
            <Route path="/robots" element={<RobotList />} />
            <Route path="/robots/register" element={<RegisterRobot />} />
            <Route path="/robots/:id" element={<RobotDetail />} />
            <Route path="/commands" element={<CommandCenter />} />
            <Route path="/tasks" element={<TaskManager />} />
            <Route path="/monitoring" element={<MonitoringDashboard />} />
            <Route path="/alerts" element={<AlertsPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/billing" element={<Billing />} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </Router>
  )
}
