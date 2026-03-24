/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#ecfeff',
          100: '#cffafe',
          200: '#a5f3fc',
          300: '#67e8f9',
          400: '#22d3ee',
          500: '#06b6d4',
          600: '#0891b2',
          700: '#0e7490',
          800: '#155e75',
          900: '#164e63',
          950: '#083344',
        },
        dark: {
          50:  '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#243044',
          850: '#1a2235',
          900: '#111827',
          920: '#0d1426',
          950: '#0a0f1e',
        },
        robot: {
          online:      '#22c55e',
          offline:     '#6b7280',
          error:       '#ef4444',
          maintenance: '#eab308',
          idle:        '#3b82f6',
        },
        alert: {
          info:     '#3b82f6',
          warning:  '#f59e0b',
          error:    '#ef4444',
          critical: '#dc2626',
        },
      },
      backgroundImage: {
        'grid-pattern': `linear-gradient(rgba(8, 145, 178, 0.05) 1px, transparent 1px),
          linear-gradient(90deg, rgba(8, 145, 178, 0.05) 1px, transparent 1px)`,
        'grid-pattern-sm': `linear-gradient(rgba(8, 145, 178, 0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(8, 145, 178, 0.03) 1px, transparent 1px)`,
      },
      backgroundSize: {
        'grid': '40px 40px',
        'grid-sm': '20px 20px',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      boxShadow: {
        'glow':      '0 0 20px rgba(8, 145, 178, 0.3)',
        'glow-sm':   '0 0 10px rgba(8, 145, 178, 0.2)',
        'glow-lg':   '0 0 40px rgba(8, 145, 178, 0.4)',
        'inner-glow':'inset 0 0 20px rgba(8, 145, 178, 0.1)',
      },
      animation: {
        'pulse-slow':  'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow-pulse':  'glowPulse 2s ease-in-out infinite',
        'scan-line':   'scanLine 3s linear infinite',
        'slide-in':    'slideIn 0.3s ease-out',
        'fade-in':     'fadeIn 0.2s ease-out',
      },
      keyframes: {
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 5px rgba(8,145,178,0.3)' },
          '50%':      { boxShadow: '0 0 20px rgba(8,145,178,0.7)' },
        },
        scanLine: {
          '0%':   { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        slideIn: {
          from: { transform: 'translateX(-10px)', opacity: '0' },
          to:   { transform: 'translateX(0)',     opacity: '1' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
