import React from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import Sidebar from './Sidebar'
import Header from './Header'
import LoadingSpinner from '../common/LoadingSpinner'

export default function MainLayout() {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return <LoadingSpinner fullPage label="Loading HCCP..." />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return (
    <div className="flex h-screen bg-dark-950 overflow-hidden">
      <Sidebar />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header />

        <main className="flex-1 overflow-y-auto bg-dark-950 bg-grid-pattern bg-grid">
          <div className="min-h-full p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
