import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/kumiko-grid/',
  plugins: [react()],
  test: {
    environment: 'node',
  },
})
