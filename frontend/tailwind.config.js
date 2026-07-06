/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── Music Matters design tokens (dark navy system) ──
        'mm-bg': '#0d0f1c',        // app background
        'mm-surface': '#111328',   // header / sidebar
        'mm-panel': '#1a1830',     // cards / panels / inputs
        'mm-border': '#2a2840',    // 1px borders
        'mm-active': '#1e1c35',    // active nav / minor key badge bg
        'mm-purple': '#7F77DD',    // primary interactive / active nav
        'mm-teal': '#1D9E75',      // CTA / stemmed / positive
        'mm-muted': '#6b6890',     // muted text
        'mm-body': '#9490c0',      // body text
        'mm-text': '#e2e0f0',      // primary text
        'mm-key-major-bg': '#1a2e40',
        'mm-key-major': '#5DCAA5',
        'mm-key-minor': '#AFA9EC',
        'mm-amber': '#FAC775',     // warning / processing
        'mm-amber-deep': '#EF9F27',
        // Legacy aliases repointed at the new palette (used by index.css @apply)
        'dj-dark': '#0d0f1c',
        'dj-darker': '#111328',
        'dj-accent': '#1D9E75',
        'dj-accent-dim': '#17805f',
        'dj-purple': '#7F77DD',
        'dj-blue': '#3b82f6',
        'dj-red': '#ef4444',
        'dj-orange': '#EF9F27',
        'dj-yellow': '#FAC775',
      },
      fontFamily: {
        'mono': ['JetBrains Mono', 'Fira Code', 'monospace'],
        'sans': ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
}
