import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Proxy /api requests to the FastAPI backend during development
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
