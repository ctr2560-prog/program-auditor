import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/program-auditor/',
  plugins: [react()],
  optimizeDeps: {
    include: ['mammoth'],
  },
})
