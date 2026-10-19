import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const BUILD = String(Date.now())

// Writes version.json next to the app so open copies (home-screen app) notice a new deploy
const version = {
  name: 'version',
  generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD }) }) },
}

// Content Security Policy for the built app: scripts only from this site and Google sign-in,
// data only to Supabase and Gmail. Blocks injected scripts and javascript: links from email data.
// Build only, since the dev server injects an inline script.
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://accounts.google.com/gsi/client",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com/gsi/style",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src * data: blob:",
  "media-src 'self' blob: data:",
  "connect-src 'self' https://wruevdyyhuizyydibzar.supabase.co wss://wruevdyyhuizyydibzar.supabase.co https://gmail.googleapis.com https://www.googleapis.com https://oauth2.googleapis.com https://accounts.google.com/gsi/",
  "frame-src https://accounts.google.com/gsi/",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')
const csp = {
  name: 'csp',
  apply: 'build',
  transformIndexHtml: () => [
    { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' },
    { tag: 'meta', attrs: { name: 'referrer', content: 'strict-origin-when-cross-origin' }, injectTo: 'head-prepend' },
  ],
}

// base matches the GitHub Pages path: https://grahamivyco.github.io/life-dashboard/
export default defineConfig({
  base: '/life-dashboard/',
  plugins: [react(), version, csp],
  define: { __BUILD__: JSON.stringify(BUILD) },
})
