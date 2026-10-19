import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const BUILD = String(Date.now())

// Writes version.json next to the app so open copies (home-screen app) notice a new deploy
const version = {
  name: 'version',
  generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD }) }) },
}

// base matches the GitHub Pages path: https://grahamivyco.github.io/life-dashboard/
export default defineConfig({
  base: '/life-dashboard/',
  plugins: [react(), version],
  define: { __BUILD__: JSON.stringify(BUILD) },
})
