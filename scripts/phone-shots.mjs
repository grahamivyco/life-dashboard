import { execSync, spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'
const [name, ...shots] = process.argv.slice(2) // route or route@selector
const out = `public/previews/${name}`; mkdirSync(out, { recursive: true })
execSync('npx vite build --mode demo --outDir dist-demo', { stdio: 'ignore' })
const server = spawn('npx', ['vite', 'preview', '--outDir', 'dist-demo', '--port', '4319', '--strictPort'], { stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 2500))
const browser = await puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: true })
const urls = []
try {
  for (const shot of shots) {
    const [route, sel, slug] = shot.split('@')
    const page = await browser.newPage()
    page.on('pageerror', (e) => console.error('ERR', route, e.message))
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3 })
    await page.goto(`http://localhost:4319/life-dashboard/#${route}`, { waitUntil: 'networkidle0' })
    await new Promise((r) => setTimeout(r, 700))
    if (process.env.EVAL) await page.evaluate(process.env.EVAL)
    if (sel) { await page.click(sel); await new Promise((r) => setTimeout(r, 700)) }
    const file = `${out}/${slug}.png`
    await page.screenshot({ path: file })
    urls.push(`https://grahamivyco.github.io/life-dashboard/previews/${name}/${slug}.png`)
    await page.close()
  }
} finally { await browser.close(); server.kill() }
console.log(urls.join('\n'))
