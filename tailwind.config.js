/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        court: {
          dark: '#0f172a',
          board: '#1e293b',
          wood: '#451a03',
          woodLight: '#78350f',
          gold: '#f59e0b',
          goldLight: '#fde68a',
          crimson: '#dc2626',
          cyan: '#06b6d4',
          purple: '#9333ea',
        }
      },
      keyframes: {
        slam: {
          '0%': { transform: 'scale(3) rotate(-15deg)', opacity: '0' },
          '70%': { transform: 'scale(0.9) rotate(2deg)', opacity: '1' },
          '100%': { transform: 'scale(1) rotate(0deg)', opacity: '1' },
        },
        shake: {
          '0%, 100%': { transform: 'translate(0, 0) rotate(0deg)' },
          '20%': { transform: 'translate(-6px, 6px) rotate(-1.5deg)' },
          '40%': { transform: 'translate(6px, -4px) rotate(1.5deg)' },
          '60%': { transform: 'translate(-4px, 2px) rotate(-0.5deg)' },
          '80%': { transform: 'translate(4px, -2px) rotate(0.5deg)' },
        },
        gavel: {
          '0%': { transform: 'rotate(-45deg)' },
          '40%': { transform: 'rotate(25deg)' },
          '60%': { transform: 'rotate(0deg)' },
          '80%': { transform: 'rotate(10deg)' },
          '100%': { transform: 'rotate(0deg)' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 15px rgba(245, 158, 11, 0.4)' },
          '50%': { boxShadow: '0 0 35px rgba(245, 158, 11, 0.85)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-6px)' }
        }
      },
      animation: {
        slam: 'slam 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards',
        shake: 'shake 0.4s cubic-bezier(.36,.07,.19,.97) both',
        gavel: 'gavel 0.45s ease-out forwards',
        pulseGlow: 'pulseGlow 2s infinite',
        float: 'float 3s ease-in-out infinite'
      }
    },
  },
  plugins: [],
}
