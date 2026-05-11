import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Proxy na /api jen když explicitně nastavíš VITE_API_PROXY_TARGET (např. http://127.0.0.1:3000
// při běžícím `vercel dev` v druhém terminálu). Bez toho `npm run dev` nevolá neexistující backend.
const apiProxy = process.env.VITE_API_PROXY_TARGET

export default defineConfig({
  plugins: [react()],
  ...(apiProxy
    ? {
        server: {
          proxy: {
            '/api': {
              target: apiProxy.replace(/\/$/, ''),
              changeOrigin: true,
            },
          },
        },
      }
    : {}),
})
