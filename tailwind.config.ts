import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        raised: 'rgb(var(--raised) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        brand: 'rgb(var(--brand) / <alpha-value>)',
        'brand-hot': 'rgb(var(--brand-hot) / <alpha-value>)',
        'brand-deep': 'rgb(var(--brand-deep) / <alpha-value>)',
        'brand-ink': 'rgb(var(--brand-ink) / <alpha-value>)',
        win: 'rgb(var(--win) / <alpha-value>)',
        loss: 'rgb(var(--loss) / <alpha-value>)',
        push: 'rgb(var(--push) / <alpha-value>)',
        live: 'rgb(var(--live) / <alpha-value>)',
        gold: 'rgb(var(--gold) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        display: ['var(--font-anton)', 'var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      borderRadius: { xl: '0.875rem', '2xl': '1.125rem', '3xl': '1.5rem' },
      animation: {
        'pulse-live': 'pulse-live 1.6s ease-in-out infinite',
        'slide-up': 'slide-up 0.22s cubic-bezier(0.2, 0.9, 0.3, 1)',
        'pop-in': 'pop-in 0.2s ease-out both',
      },
    },
  },
  plugins: [],
} satisfies Config;
