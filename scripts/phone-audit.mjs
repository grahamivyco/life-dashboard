// Phone overflow check: loads each route at 390px (demo data) and lists anything wider than the screen.
// Usage: node scripts/phone-audit.mjs / /email "/jobs?tab=docs" ...   STRESS=1 makes every text very long first.
import { execSync, spawn } from 'node:child_process'
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'
execSync('npx vite build --mode demo --outDir dist-demo', { stdio: 'ignore' })
const server = spawn('npx', ['vite', 'preview', '--outDir', 'dist-demo', '--port', '4319', '--strictPort'], { stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 2500))
const browser = await puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: true })
const routes = process.argv.slice(2)
try {
  for (const r of routes) {
    const page = await browser.newPage()
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
    await page.goto(`http://localhost:4319/life-dashboard/#${r}`, { waitUntil: 'networkidle0' })
    await new Promise((x) => setTimeout(x, 500))
    if (process.env.STRESS) await page.evaluate(() => {
      const long = ' Administrative, Program and Communications Officer (part time) with a very long unbroken-name_like_this_one_that_never_ends_at_all.pdf'
      for (const el of document.querySelectorAll('.main span, .main b, .main a, .main p, .main h2, .main h3, .main td')) if (!el.children.length && el.textContent.trim()) el.textContent += long
    })
    await new Promise((x) => setTimeout(x, 200))
    const res = await page.evaluate(() => {
      const W = document.documentElement.clientWidth
      const bad = []
      for (const el of document.querySelectorAll('body *')) {
        const b = el.getBoundingClientRect()
        let clipped = false
        for (let a = el.parentElement; a && !a.classList.contains('main'); a = a.parentElement) {
          const o = getComputedStyle(a).overflowX
          if (o !== 'visible' && a.getBoundingClientRect().right <= W + 1) { clipped = true; break }
        }
        if (!clipped && b.width && b.right > W + 1 && getComputedStyle(el).position !== 'fixed') {
          // only report the outermost offenders
          if (!bad.some((p) => p.el.contains(el))) bad.push({ el, d: `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} right=${Math.round(b.right)} w=${Math.round(b.width)}` })
        }
      }
      return { sw: document.documentElement.scrollWidth, W, bad: bad.slice(0, 6).map((b) => b.d) }
    })
    console.log(r, res.sw > res.W ? `OVERFLOW ${res.sw}` : 'ok', res.bad.join(' | '))
    await page.close()
  }
} finally { await browser.close(); server.kill() }
