// Click check: on every page (sample data, phone size), taps each button, tab, menu and link one at a
// time on a fresh load and lists any that throw an error, show raw error text, or do nothing at all.
// Usage: node scripts/check-clicks.mjs [route ...]   MAX=40 controls per page (default 40), VERBOSE=1 prints each tap.
// Sample data uses a fake Supabase client (src/demo.js), so Send, Delete and Save never touch real data.
import { execSync, spawn } from 'node:child_process'
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

const ROUTES = [
  '/', '/email', '/email?tab=inbox', '/timeline', '/finances', '/finances?tab=spending', '/finances?tab=transactions',
  '/jobs', '/jobs?tab=tracker', '/jobs?tab=docs', '/jobs?tab=profile', '/events', '/events?tab=explore',
  '/housing', '/clients', '/profile',
]
const routes = process.argv.slice(2).length ? process.argv.slice(2) : ROUTES
const MAX = Number(process.env.MAX || 40)
const BASE = 'http://localhost:4322/life-dashboard/#'
const CONTROLS = '.main button, .main [role=tab], .main [role=button], .main summary, .main a[href^="#"], .main input[type=checkbox], #m-tabs-slot > *, .m-top button, .m-top a'
// Controls that do nothing in sample data on purpose (Finances sync talks to the Mac).
const DEMO_NOOP = /^Sync banks$/
const RAW = /\bNaN\b|\bundefined\b|\[object Object\]|TypeError|ReferenceError|Something went wrong|Invalid Date/

execSync('npx vite build --mode demo --outDir dist-demo', { stdio: 'ignore' })
const server = spawn('npx', ['vite', 'preview', '--outDir', 'dist-demo', '--port', '4322', '--strictPort'], { stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 2500))
const browser = await puppeteer.launch({
  args: [...chromium.args, '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 20000,
})
await browser.defaultBrowserContext().overridePermissions('http://localhost:4322', ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write'])
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function open(page, route) {
  await page.goto('about:blank')
  await page.goto(BASE + route, { waitUntil: 'networkidle0' })
  await wait(500)
}

// One page per route: list its controls, then click each on a fresh load.
async function checkRoute(route) {
  const found = []
  const page = await browser.newPage()
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })
  let errors = []
  let asked = false
  page.on('dialog', (d) => { asked = true; d.dismiss().catch(() => {}) }) // a confirm before Delete is fine; dismissing keeps the sample data
  page.on('pageerror', (e) => errors.push(`JS error: ${e.message.split('\n')[0].slice(0, 140)}`))
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon|GSI_LOGGER.*popup/.test(m.text())) errors.push(`console error: ${m.text().slice(0, 140)}`) })
  await page.evaluateOnNewDocument(() => {
    window.__opened = 0
    window.open = () => { window.__opened++; return null }
    window.addEventListener('unhandledrejection', (e) => console.error('unhandled promise: ' + (e.reason?.message || e.reason)))
  })
  await open(page, route)
  const list = await page.evaluate((sel) => {
    const seen = new Set()
    return [...document.querySelectorAll(sel)].map((el, i) => {
      const b = el.getBoundingClientRect(), s = getComputedStyle(el)
      const label = (el.getAttribute('aria-label') || el.textContent || el.title || el.tagName).replace(/\s+/g, ' ').trim().slice(0, 40)
      const selected = el.matches('[aria-pressed=true], [aria-selected=true], [aria-current=page], [aria-checked=true], .active, .on, .selected')
      const ok = !selected && b.width > 0 && b.height > 0 && s.visibility !== 'hidden' && !el.disabled && !el.closest('[aria-hidden=true]') && el.target !== '_blank'
      const key = label + '|' + el.tagName
      if (!ok || seen.has(key)) return null // the same control repeated down a list is tried once
      seen.add(key)
      return { i, label }
    }).filter(Boolean)
  }, CONTROLS)
  if (errors.length) found.push(...errors.map((e) => `on load: ${e}`))
  for (const { i, label } of list.slice(0, MAX)) {
    errors = []
    asked = false
    if (process.env.VERBOSE) console.error(route, i, label)
    try {
    await open(page, route)
    const before = await page.evaluate((sel, i) => {
      window.__mut = 0
      new MutationObserver((m) => { window.__mut += m.length }).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true })
      const el = document.querySelectorAll(sel)[i]
      if (el) el.scrollIntoView({ block: 'center' })
      return { hash: location.hash, text: document.body.innerText.length, active: document.activeElement?.outerHTML.slice(0, 80) }
    }, CONTROLS, i)
    const handle = (await page.$$(CONTROLS))[i]
    if (!handle) continue
    const picker = page.waitForFileChooser({ timeout: 600 }).then((c) => { c.cancel(); return true }).catch(() => false)
    try { await handle.click({ delay: 20 }) } catch { continue } // moved or covered after load: phone-layout.mjs reports covered controls
    await wait(450)
    const after = await page.evaluate((rawSrc) => ({
      hash: location.hash, mut: window.__mut, opened: window.__opened, active: document.activeElement?.outerHTML.slice(0, 80),
      field: /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '') || document.activeElement?.isContentEditable,
      dialog: !!document.querySelector('[role=dialog], [role=menu], [role=listbox], .menu-pop, .view-menu-list'),
      raw: (document.body.innerText.match(new RegExp(rawSrc, 'g')) || []).join(', '),
    }), RAW.source)
    const did = (await picker) || asked || after.mut > 0 || after.hash !== before.hash || after.opened > 0 || (after.field && after.active !== before.active) || after.dialog
    for (const e of errors) found.push(`tap "${label}": ${e}`)
    if (after.raw) found.push(`tap "${label}": raw text on page (${after.raw})`)
    if (!did && !DEMO_NOOP.test(label)) found.push(`tap "${label}": nothing happens`)
    } catch (e) {
      found.push(`tap "${label}": page stopped responding (${e.message.slice(0, 60)})`)
      await page.close().catch(() => {})
      return found.map((f) => `${route} ${f}`)
    }
  }
  await page.close()
  return found.map((f) => `${route} ${f}`)
}

const problems = []
try {
  // a few pages at a time
  for (let k = 0; k < routes.length; k += 4) {
    const batch = await Promise.all(routes.slice(k, k + 4).map(checkRoute))
    problems.push(...batch.flat())
  }
} finally { await browser.close(); server.kill() }

console.log(problems.length ? [...new Set(problems)].join('\n') : `ok: tapped every control on ${routes.length} pages`)
if (problems.length) process.exitCode = 1
