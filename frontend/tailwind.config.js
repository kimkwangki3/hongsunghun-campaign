/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'Noto Sans KR'", 'sans-serif'],
      },
      colors: {
        camp: {
          bg:      '#0d0d1a',
          surface: '#111127',
          border:  'rgba(255,255,255,0.08)',
          accent:  '#818cf8',
          primary: '#4f46e5',
          purple:  '#7c3aed',
        }
      }
    }
  },
  plugins: []
}
