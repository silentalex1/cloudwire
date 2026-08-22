import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${process.env.VITE_API_PORT || 3201}`,
        changeOrigin: true,
        secure: false,
      },
    },
    watch: {
      ignored: (file) => {
        const n = String(file).replace(/\\/g, '/')
        return n.includes('/server/data/') || n.includes('/server/hosted-sites/') || n.includes('/server/applications/') || n.includes('/server/databases/') || n.includes('/server/certificates/') || n.includes('/server/ca/')
      }
    }
  },
})
