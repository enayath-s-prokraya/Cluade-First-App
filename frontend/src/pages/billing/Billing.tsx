import React from 'react'
import {
  FiCreditCard, FiCheck, FiZap, FiStar, FiAward, FiShield,
  FiDownload, FiTrendingUp,
} from 'react-icons/fi'
import { useAuth } from '../../context/AuthContext'

interface Plan {
  id: string
  name: string
  price: number
  period: string
  robots: number
  features: string[]
  icon: React.ReactNode
  color: string
  popular?: boolean
}

const PLANS: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    price: 99,
    period: 'month',
    robots: 5,
    icon: <FiZap />,
    color: 'text-blue-400',
    features: [
      'Up to 5 robots',
      'Basic telemetry (5 min delay)',
      'Command center',
      '30-day data retention',
      'Email support',
    ],
  },
  {
    id: 'professional',
    name: 'Professional',
    price: 499,
    period: 'month',
    robots: 25,
    icon: <FiStar />,
    color: 'text-primary-400',
    popular: true,
    features: [
      'Up to 25 robots',
      'Real-time telemetry',
      'NLP commands & tasks',
      '90-day data retention',
      'Fleet map & analytics',
      'Priority support',
      'API access',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 1999,
    period: 'month',
    robots: -1,
    icon: <FiAward />,
    color: 'text-purple-400',
    features: [
      'Unlimited robots',
      'Real-time telemetry',
      'Advanced NLP & AI',
      'Custom data retention',
      'SSO / SAML',
      'Dedicated support',
      'Custom integrations',
      'SLA guarantee',
    ],
  },
]

const INVOICES = [
  { id: 'INV-2026-003', date: 'Mar 1, 2026', amount: 499, status: 'paid', plan: 'Professional' },
  { id: 'INV-2026-002', date: 'Feb 1, 2026', amount: 499, status: 'paid', plan: 'Professional' },
  { id: 'INV-2026-001', date: 'Jan 1, 2026', amount: 499, status: 'paid', plan: 'Professional' },
  { id: 'INV-2025-012', date: 'Dec 1, 2025', amount: 99,  status: 'paid', plan: 'Starter' },
]

export default function Billing() {
  const { user } = useAuth()
  const currentPlan = 'professional'

  return (
    <div className="max-w-5xl space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-white">Billing & Plans</h2>
        <p className="text-gray-500 text-sm">Manage your subscription and payment details</p>
      </div>

      {/* Current plan summary */}
      <div className="card flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary-600/20 border border-primary-600/30 flex items-center justify-center">
            <FiStar className="text-primary-400 w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Current Plan</p>
            <p className="text-lg font-bold text-white">Professional</p>
            <p className="text-sm text-gray-400">$499/month · Renews Apr 1, 2026</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right mr-4">
            <p className="text-xs text-gray-500">Robots Used</p>
            <p className="text-white font-semibold">12 / 25</p>
          </div>
          <button className="btn-secondary">
            <FiCreditCard className="w-4 h-4" />
            Manage Billing
          </button>
        </div>
      </div>

      {/* Usage */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Robots',          used: 12, max: 25,     unit: '' },
          { label: 'API Calls (mo)',  used: 45230, max: 100000, unit: '' },
          { label: 'Data Storage',    used: 3.2, max: 50,     unit: 'GB' },
        ].map(({ label, used, max, unit }) => {
          const pct = (used / max) * 100
          return (
            <div key={label} className="card">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-400">{label}</span>
                <span className="text-xs text-gray-500">{used}{unit} / {max}{unit}</span>
              </div>
              <div className="h-2 bg-dark-700 rounded-full overflow-hidden mb-1">
                <div
                  className={`h-full rounded-full transition-all ${
                    pct > 80 ? 'bg-red-500' : pct > 60 ? 'bg-yellow-500' : 'bg-primary-500'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-xs text-gray-600">{pct.toFixed(0)}% used</p>
            </div>
          )
        })}
      </div>

      {/* Plans */}
      <div>
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <FiTrendingUp className="text-primary-400" />
          Available Plans
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PLANS.map((plan) => {
            const isCurrent = plan.id === currentPlan
            return (
              <div
                key={plan.id}
                className={`card relative flex flex-col transition-all duration-200 ${
                  plan.popular
                    ? 'border-primary-600/40 shadow-glow-sm'
                    : 'hover:border-gray-700'
                } ${isCurrent ? 'opacity-90' : ''}`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-primary-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-xl ${plan.color}`}>{plan.icon}</span>
                  <span className="font-bold text-white">{plan.name}</span>
                </div>

                <div className="mb-4">
                  <span className="text-3xl font-bold text-white">${plan.price}</span>
                  <span className="text-gray-500 text-sm">/{plan.period}</span>
                </div>

                <ul className="space-y-2 flex-1 mb-5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <FiCheck className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                      <span className="text-gray-300">{f}</span>
                    </li>
                  ))}
                </ul>

                {isCurrent ? (
                  <div className="flex items-center justify-center gap-2 py-2 rounded-lg bg-primary-600/10 border border-primary-600/20 text-primary-400 text-sm font-medium">
                    <FiCheck className="w-4 h-4" />
                    Current Plan
                  </div>
                ) : (
                  <button className={plan.popular ? 'btn-primary justify-center' : 'btn-secondary justify-center'}>
                    {plan.price > 499 ? 'Contact Sales' : 'Upgrade'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Payment method */}
      <div className="card">
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <FiCreditCard className="text-primary-400" />
          Payment Method
        </h3>
        <div className="flex items-center justify-between p-4 bg-dark-800/50 border border-gray-800 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-7 bg-blue-600 rounded flex items-center justify-center">
              <span className="text-white text-xs font-bold">VISA</span>
            </div>
            <div>
              <p className="text-sm text-white font-medium">•••• •••• •••• 4242</p>
              <p className="text-xs text-gray-500">Expires 12/2027</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 bg-green-500/10 text-green-400 rounded-full border border-green-500/20">
              Default
            </span>
            <button className="btn-secondary text-xs py-1.5">Update</button>
          </div>
        </div>
      </div>

      {/* Invoices */}
      <div className="card overflow-hidden p-0">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <FiShield className="text-primary-400" />
            Billing History
          </h3>
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
            {INVOICES.map((inv) => (
              <tr key={inv.id}>
                <td>
                  <span className="font-mono text-xs text-gray-300">{inv.id}</span>
                </td>
                <td>{inv.date}</td>
                <td>{inv.plan}</td>
                <td>
                  <span className="font-semibold text-white">${inv.amount}</span>
                </td>
                <td>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-500/10 text-green-400 border border-green-500/20">
                    <FiCheck className="w-3 h-3" />
                    {inv.status}
                  </span>
                </td>
                <td>
                  <button className="flex items-center gap-1 text-xs text-gray-500 hover:text-white transition-colors">
                    <FiDownload className="w-3 h-3" />
                    PDF
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
