import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Proxies API/event-stream calls to the server workspace so the client
    // dev server and the API share an origin (no CORS, SSE passes through).
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})
