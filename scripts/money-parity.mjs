// Compares the server's port of the money reports with the Mac app's own payload.
//   cd mac && python3 -m money --demo --export-payload /tmp/py.json
//   python3 -c "...cloud.export_store..." > /tmp/store.json
//   node scripts/money-parity.mjs /tmp/store.json /tmp/py.json
import { readFileSync } from 'node:fs'
import { buildPayload } from '../supabase/functions/money/core.js'

const [storeFile, pyFile, today = new Date().toISOString().slice(0, 10)] = process.argv.slice(2)
const js = buildPayload(JSON.parse(readFileSync(storeFile, 'utf8')), today)
const py = JSON.parse(readFileSync(pyFile, 'utf8'))
let diffs = 0
function walk(a, b, path) {
  if (diffs > 40) return
  if (typeof a === 'number' && typeof b === 'number') {
    if (Math.abs(a - b) > 0.011) { diffs++; console.log(path, 'js', a, 'py', b) }
    return
  }
  if (typeof a === 'boolean' || typeof b === 'boolean') { if (!!a !== !!b) { diffs++; console.log(path, 'js', a, 'py', b) } return }
  if (Array.isArray(b)) {
    if (!Array.isArray(a) || a.length !== b.length) { diffs++; console.log(path, 'length js', a?.length, 'py', b.length); return }
    b.forEach((x, i) => walk(a[i], x, `${path}[${i}]`))
    return
  }
  if (b && typeof b === 'object') {
    if (!a || typeof a !== 'object') { diffs++; console.log(path, 'missing in js'); return }
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (k === 'demo') continue
      if (!(k in a)) { diffs++; console.log(`${path}.${k}`, 'missing in js'); continue }
      if (!(k in b)) { diffs++; console.log(`${path}.${k}`, 'extra in js'); continue }
      walk(a[k], b[k], `${path}.${k}`)
    }
    return
  }
  if (a !== b) { diffs++; console.log(path, 'js', JSON.stringify(a), 'py', JSON.stringify(b)) }
}
walk(js, py, '')
console.log(diffs ? `${diffs} differences` : 'match')
process.exit(diffs ? 1 : 0)
