// Preview screenshots of the app with sample data (no login, no real data).
// Usage: node scripts/screenshot.mjs <name> [route ...]
//   e.g. node scripts/screenshot.mjs mic-button / /brain-dump
// Saves desktop + phone PNGs to public/previews/<name>/ and prints their live URLs.
import { execSync, spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

const [name = 'preview', ...routes] = process.argv.slice(2)
const paths = routes.length ? routes : ['/']
const out = `public/previews/${name}`
mkdirSync(out, { recursive: true })

execSync('npx vite build --mode demo --outDir dist-demo', { stdio: 'inherit' })
const server = spawn('npx', ['vite', 'preview', '--outDir', 'dist-demo', '--port', '4319', '--strictPort'], { stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 2500))

const browser = await puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: true })
const sizes = [{ tag: 'desktop', width: 1280, height: 860, scale: 2 }, { tag: 'phone', width: 390, height: 844, scale: 3 }]
const urls = []
try {
  for (const route of paths) {
    const slug = route === '/' ? 'today' : route.replace(/^\//, '').replace(/\//g, '-')
    for (const s of sizes) {
      const page = await browser.newPage()
      await page.setViewport({ width: s.width, height: s.height, deviceScaleFactor: s.scale })
      await page.goto(`http://localhost:4319/life-dashboard/#${route}`, { waitUntil: 'networkidle0' })
      await new Promise((r) => setTimeout(r, 600))
      const file = `${out}/${slug}-${s.tag}.png`
      await page.screenshot({ path: file, fullPage: s.tag === 'desktop' })
      urls.push(`https://grahamivyco.github.io/life-dashboard/previews/${name}/${slug}-${s.tag}.png`)
      await page.close()
    }
  }
} finally {
  await browser.close()
  server.kill()
}
console.log(urls.join('\n'))
