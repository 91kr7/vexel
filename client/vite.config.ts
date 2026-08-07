import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Proxies API/event-stream calls to the server workspace so the client
    // dev server and the API share an origin (no CORS, SSE passes through).
    // `ws: true` also forwards the exec/attach session WebSocket upgrades.
    proxy: {
      '/api': { target: 'http://localhost:3000', ws: true },
    },
  },
})
