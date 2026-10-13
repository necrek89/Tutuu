import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Both the browser build and the prerender (SSR) build run in the same
// `npm run build`, so a day-granularity stamp is identical in both. The landing
// uses it to render the same crew counter on the server and in the browser's
// first pass (see LandingPage.jsx).
const BUILD_DAY = new Date().toISOString().slice(0, 10)

export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_DAY__: JSON.stringify(BUILD_DAY),
  },
})
