import React, { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  FiCheck, FiX, FiStar, FiZap, FiCreditCard,
  FiDownload, FiTrendingUp,
} from 'react-icons/fi'
import { format } from 'date-fns'

type Plan = 'free' | 'starter' | 'professional' | 'enterprise'

const PLANS: {
  id: Plan
  name: string
  price: string
  priceNum: number
  desc: string
  color: string
  icon: string
  robots: string
  features: Record<string, boolean | string>
}[] = [
  {
    id: 'free', name: 'Free', price: '$0/mo', priceNum: 0,
    desc: 'Get started with robotics',
    color: '#6b7280', icon: '🤖',
    robots: '3',
    features: {
      'Max Robots': '3',
      'Real-time monitoring': true,
      'Command & Control': true,
      'Task Manager': false,
      'NLP Commands': false,
      'Advanced Analytics': false,
      'API Access': false,
      'Priority Support': false,
      'SLA Guarantee': false,
      'Custom Integrations': false,
    },
  },
  {
    id: 'starter', name: 'Starter', price: '$99/mo', priceNum: 99,
    desc: 'For small robot fleets',
    color: '#06b6d4', icon: '🚀',
    robots: '25',
    features: {
      'Max Robots': '25',
      'Real-time monitoring': true,
      'Command & Control': true,
      'Task Manager': true,
      'NLP Commands': false,
      'Advanced Analytics': false,
      'API Access': true,
      'Priority Support': false,
      'SLA Guarantee': false,
      'Custom Integrations': false,
    },
  },
  {
    id: 'professional', name: 'Professional', price: '$499/mo', priceNum: 499,
    desc: 'For growing operations',
    color: '#8b5cf6', icon: '⚡',
    robots: '250',
    features: {
      'Max Robots': '250',
      'Real-time monitoring': true,
      'Command & Control': true,
      'Task Manager': true,
      'NLP Commands': true,
      'Advanced Analytics': true,
      'API Access': true,
      'Priority Support': true,
      'SLA Guarantee': '99.9%',
      'Custom Integrations': false,
    },
  },
  {
    id: 'enterprise', name: 'Enterprise', price: 'Custom', priceNum: 0,
    desc: 'Unlimited scale, dedicated support',
    color: '#f59e0b', icon: '🏢',
    robots: 'Unlimited',
    features: {
      'Max Robots': 'Unlimited',
      'Real-time monitoring': true,
      'Command & Control': true,
      'Task Manager': true,
      'NLP Commands': true,
      'Advanced Analytics': true,
      'API Access': true,
      'Priority Support': true,
      'SLA Guarantee': '99.99%',
      'Custom Integrations': true,
    },
  },
]

const MOCK_INVOICES = [
  { id: 'inv_001', date: '2026-02-01', amount: '$499.00', status: 'paid', plan: 'Professional' },
  { id: 'inv_002', date: '2026-01-01', amount: '$499.00', status: 'paid', plan: 'Professional' },
  { id: 'inv_003', date: '2025-12-01', amount: '$499.00', status: 'paid', plan: 'Professional' },
  { id: 'inv_004', date: '2025-11-01', amount: '$99.00', status: 'paid', plan: 'Starter' },
  { id: 'inv_005', date: '2025-10-01', amount: '$99.00', status: 'paid', plan: 'Starter' },
]

const USAGE_DATA = [
  { month: 'Oct', robots: 18, commands: 1200, data_gb: 4.2 },
  { month: 'Nov', robots: 20, commands: 1450, data_gb: 5.1 },
  { month: 'Dec', robots: 22, commands: 1800, data_gb: 6.3 },
  { month: 'Jan', robots: 24, commands: 2100, data_gb: 7.8 },
  { month: 'Feb', robots: 24, commands: 2350, data_gb: 8.4 },
  { month: 'Mar', robots: 25, commands: 1900, data_gb: 6.9 },
]

export default function Billing() {
  const currentPlan: Plan = 'professional'
  const [showUpgrade, setShowUpgrade] = useState(false)

  const currentPlanData = PLANS.find((p) => p.id === currentPlan)!
  const robotsUsed = 24
  const robotsMax = 250
  const commandsThisMonth = 1900
  const dataGB = 6.9

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-white">Billing & Subscription</h2>
        <p className="text-gray-500 text-sm">Manage your plan and usage</p>
      </div>

      {/* Current Plan */}
      <div className="card">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl" style={{ background: `${currentPlanData.color}20`, border: `1px solid ${currentPlanData.color}30` }}>
              {currentPlanData.icon}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-white text-lg font-bold">{currentPlanData.name}</h3>
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20">Active</span>
              </div>
              <p className="text-gray-400 text-sm mt-0.5">{currentPlanData.desc}</p>
              <p className="text-gray-500 text-xs mt-1">Renews on April 1, 2026</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-white text-2xl font-bold">{currentPlanData.price}</p>
            <p className="text-gray-500 text-xs">billed monthly</p>
            <button onClick={() => setShowUpgrade(true)} className="btn-primary mt-3">
              <FiStar className="w-4 h-4" /> Upgrade Plan
            </button>
          </div>
        </div>

        {/* Usage bars */}
        <div className="grid grid-cols-3 gap-4 mt-5 pt-5 border-t border-gray-800">
          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-gray-500">Robots</span>
              <span className="text-gray-300 font-medium">{robotsUsed} / {robotsMax}</span>
            </div>
            <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-primary-500" style={{ width: `${(robotsUsed / robotsMax) * 100}%` }} />
            </div>
            <p className="text-gray-600 text-xs mt-1">{((robotsUsed / robotsMax) * 100).toFixed(0)}% used</p>
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-gray-500">Commands</span>
              <span className="text-gray-300 font-medium">{commandsThisMonth.toLocaleString()} / 50,000</span>
            </div>
            <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-purple-500" style={{ width: `${(commandsThisMonth / 50000) * 100}%` }} />
            </div>
            <p className="text-gray-600 text-xs mt-1">{((commandsThisMonth / 50000) * 100).toFixed(0)}% used</p>
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-gray-500">Data Storage</span>
              <span className="text-gray-300 font-medium">{dataGB} GB / 100 GB</span>
            </div>
            <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-cyan-500" style={{ width: `${(dataGB / 100) * 100}%` }} />
            </div>
            <p className="text-gray-600 text-xs mt-1">{((dataGB / 100) * 100).toFixed(0)}% used</p>
          </div>
        </div>
      </div>

      {/* Usage Chart */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <FiTrendingUp className="w-4 h-4 text-primary-400" />
          <h3 className="text-sm font-semibold text-white">Usage History</h3>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={USAGE_DATA}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 11 }} />
            <YAxis yAxisId="left" tick={{ fill: '#6b7280', fontSize: 11 }} />
            <YAxis yAxisId="right" orientation="right" tick={{ fill: '#6b7280', fontSize: 11 }} />
            <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }} />
            <Bar yAxisId="left" dataKey="robots" fill="#06b6d4" radius={[4, 4, 0, 0]} name="Robots" />
            <Bar yAxisId="right" dataKey="commands" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Commands" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Plan Comparison */}
      {showUpgrade && (
        <div className="card overflow-hidden p-0">
          <div className="p-4 border-b border-gray-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Choose Your Plan</h3>
            <button onClick={() => setShowUpgrade(false)} className="text-gray-500 hover:text-gray-300">
              <FiX className="w-4 h-4" />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider w-1/3">Feature</th>
                  {PLANS.map((plan) => (
                    <th key={plan.id} className="px-6 py-4 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-lg">{plan.icon}</span>
                        <span className="text-white font-semibold">{plan.name}</span>
                        <span className="text-lg font-bold" style={{ color: plan.color }}>{plan.price}</span>
                        {plan.id === currentPlan ? (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-green-500/10 text-green-400 border border-green-500/20">Current</span>
                        ) : (
                          <button
                            className="px-3 py-1 rounded-lg text-xs font-medium text-white transition-colors"
                            style={{ background: plan.color }}
                          >
                            {plan.id === 'enterprise' ? 'Contact Sales' : `Upgrade → ${plan.price}`}
                          </button>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.keys(PLANS[0].features).map((feature) => (
                  <tr key={feature} className="border-b border-gray-800/50 hover:bg-dark-800/30">
                    <td className="px-6 py-3 text-sm text-gray-300">{feature}</td>
                    {PLANS.map((plan) => {
                      const val = plan.features[feature]
                      return (
                        <td key={plan.id} className="px-6 py-3 text-center">
                          {typeof val === 'boolean' ? (
                            val
                              ? <FiCheck className="w-4 h-4 text-green-400 mx-auto" />
                              : <FiX className="w-4 h-4 text-gray-700 mx-auto" />
                          ) : (
                            <span className="text-sm text-gray-300 font-medium">{val}</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Invoice History */}
      <div className="card overflow-hidden p-0">
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FiCreditCard className="w-4 h-4 text-primary-400" />
            <h3 className="text-sm font-semibold text-white">Invoice History</h3>
          </div>
        </div>
        <table className="w-full table-dark">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Date</th>
              <th>Plan</th>
              <th>Amount</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {MOCK_INVOICES.map((inv) => (
              <tr key={inv.id}>
                <td className="font-mono text-xs text-gray-400">{inv.id}</td>
                <td>{format(new Date(inv.date), 'MMM d, yyyy')}</td>
                <td>{inv.plan}</td>
                <td className="text-white font-medium">{inv.amount}</td>
                <td>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    inv.status === 'paid'
                      ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                      : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                  }`}>
                    {inv.status}
                  </span>
                </td>
                <td>
                  <button className="text-gray-500 hover:text-gray-300 flex items-center gap-1 text-xs">
                    <FiDownload className="w-3.5 h-3.5" /> PDF
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
