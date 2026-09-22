import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/NavUS/' : '/',
  plugins: [react()],
  server: {
    proxy: {
      '/valhalla': {
        target: 'http://127.0.0.1:8002',
        rewrite: (path) => path.replace(/^\/valhalla/, ''),
      },
    },
  },
}))
