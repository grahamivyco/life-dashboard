// Builds the 'jobs' section snapshot from Graham's Job Hub artifact.
// Usage: node scripts/jobs-snapshot.mjs <hub.html> <apps-dir> [digest.json] > payload.json
//   hub.html: the hub page (Artifact read). apps-dir: the hub db's "apps" collection
//   saved with ArtifactData list + out_dir (one <slug>.json per job).
//   digest.json: the newest "Job digest" email as {date, url, thread_id, intro,
//   picks: [{n, role, org, url, where, pay, deadline, why, apply}], closing: [{text, url?, deadline?}], also: [{text, url}]}
import { readFileSync, readdirSync } from 'node:fs'
import vm from 'node:vm'

const HUB = 'https://claude.ai/code/artifact/94c1d4fb-5a22-4cb3-8c2d-bde80507dbd2'
const [htmlPath, appsDir, digestPath] = process.argv.slice(2)
const html = readFileSync(htmlPath, 'utf8')

// Pull a top-level `const NAME = ...;` literal out of the hub's script and evaluate it alone.
function literal(name, open, close) {
  const start = html.indexOf(`const ${name} = ${open}`)
  if (start < 0) return null
  const end = html.indexOf(`\n${close};`, start)
  return vm.runInNewContext('(' + html.slice(html.indexOf(open, start), end + 2) + ')')
}

const jobs = literal('jobs', '[', ']') || []
const next = literal('NEXT', '{', '}') || {}
const updated = html.match(/Updated ([A-Z][a-z]{2} \d{1,2}, \d{4})/)?.[1] || null

const apps = {}
for (const f of appsDir ? readdirSync(appsDir).filter((f) => f.endsWith('.json')) : []) {
  const d = JSON.parse(readFileSync(`${appsDir}/${f}`, 'utf8'))
  const a = d.data || d
  apps[a.slug || f.slice(0, -5)] = a
}

const grade = (s) => (s == null ? null : s >= 85 ? 'A' : s >= 70 ? 'B' : s >= 55 ? 'C' : s >= 40 ? 'D' : 'F')
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] != null && o[k] !== '').map((k) => [k, o[k]]))

const todayIso = new Date().toISOString().slice(0, 10)
// Jobs past their deadline that Graham never acted on are dropped
const out = jobs.filter((j) => apps[j.slug] || !j.due || j.due >= todayIso).map((j) => {
  const a = apps[j.slug]
  return {
    ...pick(j, ['slug', 'role', 'org', 'short', 'field', 'pay', 'payType', 'fit', 'score', 'why', 'added', 'due', 'dueText', 'statusText', 'todo', 'steps', 'outreach']),
    grade: grade(j.score),
    next: next[j.slug] || null,
    actions: (j.actions || []).map((x) => pick(x, ['label', 'href', 'primary'])).filter((x) => /^https?:/.test(x.href)),
    docs: (j.docs || []).map((x) => x.label),
    paste: j.paste || [],
    app: a ? pick(a, ['status', 'waitingOn', 'nextStep', 'needsYou', 'decidedAt', 'appliedAt', 'followedUpAt', 'finishUrl', 'skipReason', 'updates', 'asks']) : null,
  }
})

// Applications Claude is tracking for jobs no longer on the hub's list
for (const [slug, a] of Object.entries(apps)) {
  if (out.some((j) => j.slug === slug)) continue
  out.push({ slug, role: a.role, org: a.org, pay: a.pay, actions: [], docs: [], paste: [], app: pick(a, ['status', 'waitingOn', 'nextStep', 'needsYou', 'decidedAt', 'appliedAt', 'followedUpAt', 'finishUrl', 'skipReason', 'updates', 'asks']) })
}

const digest = digestPath ? JSON.parse(readFileSync(digestPath, 'utf8')) : null

process.stdout.write(JSON.stringify({ source: 'Job Hub', hub_url: HUB, updated, jobs: out, digest }))
