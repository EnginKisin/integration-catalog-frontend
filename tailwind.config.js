export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#11131b',
        surface2: '#171a24',
        border: '#2f3340',
        text: '#e5e7eb',
        muted: '#9ca3af',
        success: '#22c55e',
        warning: '#f59e0b',
        danger: '#ef4444',
        accent: '#7c3aed',
        accentSoft: '#6d28d9',
      },
      boxShadow: {
        panel: '0 20px 80px rgba(15, 23, 42, 0.35)',
      },
    },
  },
  plugins: [],
}
