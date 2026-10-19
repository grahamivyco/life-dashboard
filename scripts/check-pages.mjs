// Page checker: loads every page (sample data) at phone and desktop width and lists what looks broken.
// Usage: node scripts/check-pages.mjs [route ...]   STRESS=1 also makes every text very long.
// Checks: JS errors, failed requests, sideways overflow on phone, raw error or placeholder text
// (NaN, undefined, [object Object], "Error:", stack traces), pages that render nothing, and text
// cut off or overlapping the floating tab bar is left to the screenshots. Exit code 1 if anything is found.
import { execSync, spawn } from 'node:child_process'
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

const ROUTES = [
  '/', '/email', '/email?tab=inbox', '/email?tab=outbox', '/timeline',
  '/finances', '/finances?tab=spending', '/finances?tab=transactions',
  '/jobs', '/jobs?tab=digest&view=list', '/jobs?tab=tracker', '/jobs?tab=docs', '/jobs?tab=profile',
  '/events', '/events?view=day', '/events?view=month', '/events?tab=explore',
  '/housing', '/clients', '/profile',
]
const routes = process.argv.slice(2).length ? process.argv.slice(2) : ROUTES
const SIZES = [{ tag: 'phone', width: 390, height: 844, mobile: true }, { tag: 'desktop', width: 1280, height: 860, mobile: false }]

execSync('npx vite build --mode demo --outDir dist-demo', { stdio: 'ignore' })
const server = spawn('npx', ['vite', 'preview', '--outDir', 'dist-demo', '--port', '4319', '--strictPort'], { stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 2500))
const browser = await puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: true })

const problems = []
try {
  for (const route of routes) {
    for (const s of SIZES) {
      const page = await browser.newPage()
      const found = []
      page.on('pageerror', (e) => found.push(`JS error: ${e.message.split('\n')[0]}`))
      page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) found.push(`console: ${m.text().slice(0, 160)}`) })
      page.on('requestfailed', (r) => { if (!/supabase|googleapis|google\.com/.test(r.url())) found.push(`request failed: ${r.url().slice(0, 120)}`) })
      await page.setViewport({ width: s.width, height: s.height, deviceScaleFactor: 1, isMobile: s.mobile, hasTouch: s.mobile })
      await page.goto(`http://localhost:4319/life-dashboard/#${route}`, { waitUntil: 'networkidle0' })
      await new Promise((x) => setTimeout(x, 700))
      if (process.env.STRESS) await page.evaluate(() => {
        const long = ' Administrative, Program and Communications Officer (part time) with a very long unbroken-name_like_this_one_that_never_ends_at_all.pdf'
        for (const el of document.querySelectorAll('.main span, .main b, .main a, .main p, .main h2, .main h3, .main td')) if (!el.children.length && el.textContent.trim()) el.textContent += long
      })
      const res = await page.evaluate((phone) => {
        const out = []
        const main = document.querySelector('.main') || document.body
        const text = main.innerText || ''
        if (text.trim().length < 20) out.push('page is empty')
        const bad = text.match(/\bNaN\b|\bundefined\b|\[object Object\]|\bnull\b(?! ?(?:island|hypothesis))|Infinity|TypeError|ReferenceError|Error:|at \w+ \(|\$-|-\$0\b|Invalid Date/g)
        if (bad) out.push(`raw text on page: ${[...new Set(bad)].join(', ')}`)
        if (phone) {
          const W = document.documentElement.clientWidth
          if (document.documentElement.scrollWidth > W + 1) {
            const wide = []
            for (const el of main.querySelectorAll('*')) {
              const b = el.getBoundingClientRect()
              let clipped = false
              for (let a = el.parentElement; a && a !== main; a = a.parentElement) {
                const o = getComputedStyle(a).overflowX
                if (o !== 'visible' && a.getBoundingClientRect().right <= W + 1) { clipped = true; break }
              }
              if (!clipped && b.width && b.right > W + 1 && getComputedStyle(el).position !== 'fixed' && !wide.some((p) => p.el.contains(el)))
                wide.push({ el, d: `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}` })
            }
            out.push(`overflows sideways (${document.documentElement.scrollWidth}px): ${wide.slice(0, 4).map((w) => w.d).join(' | ')}`)
          }
        }
        // images that failed to load
        for (const img of main.querySelectorAll('img')) if (img.complete && img.naturalWidth === 0 && img.src && !img.src.startsWith('data:')) out.push(`broken image: ${img.src.slice(0, 100)}`)
        return out
      }, s.mobile)
      for (const p of [...new Set([...found, ...res])]) problems.push(`${route} [${s.tag}] ${p}`)
      await page.close()
    }
  }
} finally { await browser.close(); server.kill() }

if (problems.length) { console.log(problems.join('\n')); process.exitCode = 1 } else console.log(`ok: ${routes.length} pages, phone and desktop`)
