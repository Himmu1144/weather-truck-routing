import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// In development the browser talks to Vite only; /api/* is passed on to Django, so there
// is one origin and no CORS. In production Vercel does the same forwarding (vercel.json).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': process.env.API_TARGET ?? 'http://127.0.0.1:8000',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
  },
})
