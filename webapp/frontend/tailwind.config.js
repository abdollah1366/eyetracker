/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: 'var(--color-primary)',
          hover: 'var(--color-primary-hover)',
          active: 'var(--color-primary-active)',
          soft: 'var(--color-primary-soft)',
        },
        'on-primary': 'var(--color-on-primary)',
        accent: {
          DEFAULT: 'var(--color-accent)',
          hover: 'var(--color-accent-hover)',
          soft: 'var(--color-accent-soft)',
        },
        canvas: 'var(--color-bg)',
        surface: 'var(--color-surface)',
        'surface-2': 'var(--color-surface-2)',
        border: 'var(--color-border)',
        'border-strong': 'var(--color-border-strong)',
        ink: {
          DEFAULT: 'var(--color-text)',
          muted: 'var(--color-text-muted)',
          subtle: 'var(--color-text-subtle)',
        },
        success: {
          DEFAULT: 'var(--color-success)',
          soft: 'var(--color-success-soft)',
        },
        error: {
          DEFAULT: 'var(--color-error)',
          soft: 'var(--color-error-soft)',
        },
        warning: {
          DEFAULT: 'var(--color-warning)',
          soft: 'var(--color-warning-soft)',
        },
        info: {
          DEFAULT: 'var(--color-info)',
          soft: 'var(--color-info-soft)',
        },
        sidebar: {
          DEFAULT: 'var(--color-sidebar)',
          hover: 'var(--color-sidebar-hover)',
          text: 'var(--color-sidebar-text)',
        },
      },
      fontFamily: {
        sans: ['Vazirmatn', 'Inter', 'system-ui', 'sans-serif'],
        number: ['Inter', 'Vazirmatn', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '14px',
        lg: '16px',
        md: '12px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(15, 71, 87, 0.04), 0 8px 24px rgba(15, 71, 87, 0.06)',
        'card-hover': '0 2px 4px rgba(15, 71, 87, 0.06), 0 12px 32px rgba(15, 71, 87, 0.10)',
        modal: '0 24px 64px rgba(15, 71, 87, 0.24)',
      },
      spacing: {
        // 8px scale helpers (Tailwind default already uses 4px base; these complement it)
        18: '4.5rem',
        22: '5.5rem',
      },
      transitionTimingFunction: {
        clinical: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      },
      keyframes: {
        // Opacity-only: a `transform` here would create a containing block and
        // break `position: fixed` overlays (calibration / stimuli / modals).
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.97)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.45' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.28s cubic-bezier(0.2, 0.8, 0.2, 1) both',
        'scale-in': 'scale-in 0.2s cubic-bezier(0.2, 0.8, 0.2, 1) both',
        'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
