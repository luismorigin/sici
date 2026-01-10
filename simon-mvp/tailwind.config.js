/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Brand colors
        brand: {
          primary: '#3B82F6',
          'primary-hover': '#2563EB',
          dark: '#0F172A',
          'dark-card': '#1E2538',
        },
        // State colors
        state: {
          success: '#10B981',
          'success-bg': '#D1FAE5',
          warning: '#F59E0B',
          'warning-bg': '#FEF3C7',
          danger: '#EF4444',
          'danger-bg': '#FEE2E2',
        },
        // Premium/Gold
        premium: {
          gold: '#F59E0B',
          'gold-hover': '#D97706',
        },
        // Lens/Dashboard
        lens: {
          bg: '#0F172A',
          card: '#1E293B',
          border: '#334155',
          accent: '#60A5FA',
        },
        // Legacy simon colors
        simon: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
        },
        neutral: {
          850: '#1f1f23',
        }
      },
      fontFamily: {
        sans: ['Inter', 'SF Pro Display', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        display: ['Outfit', 'Inter', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'scale-in': 'scaleIn 0.3s ease-out',
        'float': 'float 6s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
      boxShadow: {
        'card': '0 20px 40px -5px rgba(59, 130, 246, 0.15)',
        'card-hover': '0 25px 50px -5px rgba(59, 130, 246, 0.25)',
      },
      borderRadius: {
        '2xl': '16px',
        '3xl': '24px',
      },
    },
  },
  plugins: [],
}
