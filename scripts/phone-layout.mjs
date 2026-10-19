// Phone layout check: every page at iPhone size (390x844 with the notch and home bar insets),
// the menu drawer open, and each bottom tab. Lists layout problems and saves a screenshot of each
// state to OUT (default dist-demo/phone-layout, not committed) so they can be looked at.
// Usage: node scripts/phone-layout.mjs [route ...]   CSS='...' injects a stylesheet to try a fix first.
// Spec (Graham, 2026-10-19): the top bar's content sits below the status bar, the bottom bar sits
// just above the visible bottom (12px, or the home bar inset), nothing hides under either bar,
// no overlapping controls, no big empty gaps, same on every page.
import { execSync, spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

const ROUTES = ['/', '/email', '/timeline', '/finances', '/jobs', '/events', '/housing', '/clients', '/profile']
const routes = process.argv.slice(2).length ? process.argv.slice(2) : ROUTES
const OUT = process.env.OUT || 'dist-demo/phone-layout'
const INSET = { top: 47, bottom: 34 } // iPhone 14/15 status bar and home indicator
const W = 390, H = 844

execSync('npx vite build --mode demo --outDir dist-demo', { stdio: 'ignore' })
mkdirSync(OUT, { recursive: true })
const server = spawn('npx', ['vite', 'preview', '--outDir', 'dist-demo', '--port', '4320', '--strictPort'], { stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 2500))
const browser = await puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: true })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

// Chrome has no notch, so swap env(safe-area-inset-*) for iPhone values in every stylesheet.
async function fakeInsets(page) {
  await page.evaluate((inset) => {
    for (const sheet of [...document.styleSheets]) {
      let css
      try { css = [...sheet.cssRules].map((r) => r.cssText).join('\n') } catch { continue } // other origins (fonts)
      if (!css.includes('safe-area-inset')) continue
      const style = document.createElement('style')
      style.textContent = css.replace(/env\(safe-area-inset-top\)/g, `${inset.top}px`).replace(/env\(safe-area-inset-bottom\)/g, `${inset.bottom}px`)
        .replace(/env\(safe-area-inset-(left|right)\)/g, '0px')
      document.head.appendChild(style)
      sheet.disabled = true
    }
  }, INSET)
  await wait(300)
}

// Layout rules, measured in the page.
function measure({ inset, state }) {
  const out = []
  const vh = window.innerHeight
  const r = (el) => el && el.getBoundingClientRect()
  const shown = (el) => el && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden' && r(el).height > 0
  const top = document.querySelector('.m-top')
  const tabs = document.querySelector('#m-tabs-slot')
  const main = document.querySelector('.main')
  if (!shown(top)) out.push('top bar missing')
  else {
    for (const el of top.querySelectorAll('button, a, .m-title')) {
      if (shown(el) && r(el).top < inset.top) { out.push(`top bar content under the status bar (${el.className || el.tagName} at ${Math.round(r(el).top)}px, needs >= ${inset.top})`); break }
    }
  }
  // fixed bars must stay put while the page scrolls
  if (document.scrollingElement.scrollHeight > vh + 300 && state !== 'drawer') {
    const t0 = shown(top) && r(top).top, b0 = shown(tabs) && r(tabs).bottom
    window.scrollTo(0, 300)
    if (shown(top) && Math.abs(r(top).top - t0) > 1) out.push('top bar scrolls away with the page')
    if (shown(tabs) && Math.abs(r(tabs).bottom - b0) > 1) out.push('bottom bar scrolls with the page')
    window.scrollTo(0, 0)
  }
  const barTop = shown(tabs) ? r(tabs).top : vh
  if (shown(tabs) && state !== 'drawer') { // with the menu open the page is a scaled card
    const gap = Math.round(vh - r(tabs).bottom)
    const want = Math.max(12, inset.bottom)
    if (Math.abs(gap - want) > 2) out.push(`bottom bar ${gap}px above the bottom, expected ${want}px`)
    if (r(tabs).left < 0 || r(tabs).right > window.innerWidth) out.push('bottom bar wider than the screen')
    const items = [...tabs.querySelectorAll(':scope > button, :scope > a')].filter(shown)
    for (let i = 1; i < items.length; i++) if (r(items[i]).left < r(items[i - 1]).right - 1) { out.push('bottom bar items overlap'); break }
    for (const t of items) if (t.scrollWidth > t.clientWidth + 1 && !t.querySelector('.m-tab-label, .m-tab-word')) out.push(`bottom bar item cut off: ${t.textContent.trim().slice(0, 20)}`)
  }
  if (main && state !== 'drawer') {
    const barBottom = shown(top) ? r(top).bottom : 0
    const first = [...main.querySelectorAll('.page > *, .route > *')].find((el) => shown(el) && r(el).height > 4)
    if (first && window.scrollY === 0) {
      if (r(first).top < barBottom - 1) out.push(`page starts under the top bar (${first.className || first.tagName})`)
      if (r(first).top - barBottom > 48) out.push(`${Math.round(r(first).top - barBottom)}px empty gap under the top bar`)
    }
    // tap targets covered by a bar (only what's on screen now)
    for (const el of main.querySelectorAll('button, a, input, textarea, select')) {
      if (!shown(el)) continue
      const b = r(el)
      if (b.bottom <= 0 || b.top >= vh) continue
      const cx = b.left + b.width / 2, cy = b.top + b.height / 2
      if (cx < 0 || cx > window.innerWidth) continue
      const hit = document.elementFromPoint(cx, cy)
      if (hit && !el.contains(hit) && !hit.contains(el) && hit.closest('.page, .route') && getComputedStyle(hit).position !== 'fixed' && !hit.closest('.m-top, .m-tabs')) {
        out.push(`"${(el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 24)}" covered by ${hit.className || hit.tagName}`)
        if (out.length > 8) break
      }
    }
    // at the end of the page the last thing must clear the bottom bar
    const docH = document.scrollingElement.scrollHeight
    window.scrollTo(0, docH)
    const kids = [...main.querySelectorAll('.page > *, .route > *')].filter(shown)
    const last = kids[kids.length - 1]
    if (last && r(last).bottom > barTop + 1 && docH > vh) out.push(`end of page hidden behind the bottom bar (${last.className || last.tagName})`)
    window.scrollTo(0, 0)
  }
  if (state === 'drawer') {
    const d = document.querySelector('.m-drawer')
    if (!shown(d)) out.push('menu did not open')
    else {
      const rows = [...d.querySelectorAll('a, button')].filter(shown)
      if (rows[0] && r(rows[0]).top < inset.top) out.push('menu starts under the status bar')
      const lastRow = rows[rows.length - 1]
      if (lastRow && r(lastRow).bottom > vh - inset.bottom) out.push('menu runs under the home bar')
    }
  }
  if (document.documentElement.scrollWidth > window.innerWidth + 1) out.push(`overflows sideways (${document.documentElement.scrollWidth}px)`)
  return out
}

const problems = []
let shots = 0
try {
  for (const route of routes) {
    const slug = route === '/' ? 'today' : route.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')
    const page = await browser.newPage()
    page.on('pageerror', (e) => problems.push(`${route} JS error: ${e.message.split('\n')[0]}`))
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
    await page.goto(`http://localhost:4320/life-dashboard/#${route}`, { waitUntil: 'networkidle0' })
    await wait(700)
    await fakeInsets(page)
    if (process.env.CSS) await page.addStyleTag({ content: process.env.CSS }) // try a CSS fix before making it
    const check = async (state, label) => {
      for (const p of await page.evaluate(measure, { inset: INSET, state })) problems.push(`${route} [${label}] ${p}`)
      await page.screenshot({ path: `${OUT}/${slug}-${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png` }); shots++
    }
    await check('page', 'page')
    // each bottom tab
    const tabCount = await page.$$eval('#m-tabs-slot > button, #m-tabs-slot > a', (els) => els.length)
    for (let i = 0; i < tabCount; i++) {
      const label = await page.$eval(`#m-tabs-slot > :is(button, a):nth-of-type(${i + 1})`, (el, n) => el.textContent.trim() || el.getAttribute("aria-label") || `tab ${n}`, i + 1)
      await page.click(`#m-tabs-slot > :is(button, a):nth-of-type(${i + 1})`).catch(() => {})
      await wait(500)
      await page.evaluate(() => window.scrollTo(0, 0)); await wait(100)
      await check('page', `tab ${label}`)
    }
    // the menu drawer
    if (route === routes[0] || route === '/') {
      await page.click('.m-menu').catch(() => problems.push(`${route} menu button not tappable`))
      await wait(600)
      await check('drawer', 'menu open')
    }
    await page.close()
  }
} finally { await browser.close(); server.kill() }

console.log(problems.length ? problems.join('\n') : `ok: ${routes.length} pages, every bottom tab and the menu at iPhone size`)
console.log(`${shots} screenshots in ${OUT}`)
if (problems.length) process.exitCode = 1
