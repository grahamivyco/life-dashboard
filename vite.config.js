import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base matches the GitHub Pages path: https://grahamivyco.github.io/life-dashboard/
export default defineConfig({
  base: '/life-dashboard/',
  plugins: [react()],
})
