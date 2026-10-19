import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronRight, Copy, Check, ExternalLink, Layers, List, Search, SkipForward, Download, FileText, Upload, X } from 'lucide-react'
import { unzipSync } from 'fflate'
import { supabase } from '../supabase.js'
import { useSnapshot } from '../useSnapshot.js'
import PageHeader from '../components/PageHeader.jsx'
import { fmtDay } from '../lib.js'

// Jobs: public.jobs (moved from the Job Hub) and public.job_profile. PDFs live in the private
// job-docs bucket at <user id>/<doc path>. The daily digest's picks are jobs rows with extra.digest;
// its "closing soon" and "also open" links come from the 'jobs' snapshot.
// Apply / Skip / answers update the row and insert an approved claude_requests row
// (action 'job', note 'job:<slug>| …'); a search inserts note 'search| …'. The hourly sync does the work.

const LABEL = { new: 'New', approved: 'Getting submitted', applied: 'Applied', interview: 'Interview', offer: 'Offer', accepted: 'Hired', rejected: 'Denied', skipped: 'Skipped' }
const SENT = ['applied', 'interview', 'offer', 'accepted']
const HEARD = ['interview', 'offer', 'accepted', 'rejected']
const STEPS = ['Approved', 'Docs ready', 'Form filled', 'Submitted', 'Confirmed', 'Followed up', 'Heard back']
const BUCKET = 'job-docs'

const today = () => new Date(new Date().toDateString())
const daysLeft = (iso) => Math.round((new Date(iso + 'T12:00:00') - today()) / 864e5)
const shortDay = (iso) => new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
const grade = (s) => (s == null ? null : s >= 85 ? 'A' : s >= 70 ? 'B' : s >= 55 ? 'C' : s >= 40 ? 'D' : 'F')
const name = (j) => j.short || j.org?.split(' · ')[0]
const title = (j) => `${j.role} at ${name(j)}`
const isOpen = (j) => !j.due || daysLeft(j.due) >= 0
const now = () => new Date().toISOString()

function dueLabel(j) {
  if (!j.due) return j.due_text
  const n = daysLeft(j.due)
  return n < 0 ? `Closed ${shortDay(j.due)}` : n === 0 ? 'Due today' : n === 1 ? 'Due tomorrow' : n <= 14 ? `Due in ${n} days` : `Due ${shortDay(j.due)}`
}

function Due({ j }) {
  const label = dueLabel(j)
  if (!label) return null
  const soon = j.due && daysLeft(j.due) >= 0 && daysLeft(j.due) <= 7
  return <span className={'meta' + (soon ? ' needs' : '')}>{label}</span>
}

function CopyBtn({ text }) {
  const [done, setDone] = useState(false)
  return (
    <button className="icon-btn ok" title="Copy" aria-label="Copy"
      onClick={() => navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500) })}>
      {done ? <Check size={15} /> : <Copy size={15} />}
    </button>
  )
}

// ---------- data ----------

function useJobs() {
  const [jobs, setJobs] = useState(null)
  const [profile, setProfile] = useState(null)
  const [searches, setSearches] = useState([])
  const load = useCallback(() => {
    supabase.from('jobs').select('*').then(({ data }) => data && setJobs(data))
    supabase.from('job_profile').select('*').limit(1).then(({ data }) => setProfile(data?.[0] || {}))
    supabase.from('claude_requests').select('id,note,status,created_at').eq('action', 'job').in('status', ['approved', 'working']).like('note', 'search|%')
      .then(({ data }) => setSearches(data || []))
  }, [])
  useEffect(() => {
    load()
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    const ch = supabase.channel('jobs-live').on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, load).subscribe()
    return () => { document.removeEventListener('visibilitychange', onVisible); supabase.removeChannel(ch) }
  }, [load])
  return { jobs, setJobs, profile, setProfile, searches, reload: load }
}

// Signed links for every PDF the jobs and profile point at. Missing files come back without a url.
function useDocs(jobs, profile) {
  const [state, setState] = useState({ uid: null, urls: {}, ready: false })
  const paths = [...new Set([...(profile?.base_docs || []), ...(jobs || []).flatMap((j) => j.docs || [])].map((d) => d.path).filter(Boolean))]
  const key = paths.join('|')
  const load = useCallback(async () => {
    if (!paths.length) return
    const { data: { session } } = await supabase.auth.getSession()
    const uid = session?.user?.id
    if (!uid) return
    const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths.map((p) => `${uid}/${p}`), 3600)
    const urls = {}
    for (const r of data || []) if (r.signedUrl && !r.error) urls[r.path.slice(uid.length + 1)] = r.signedUrl
    setState({ uid, urls, ready: true })
  }, [key])
  useEffect(() => { load() }, [load])
  return { ...state, paths, reload: load }
}

async function download(uid, d) {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(`${uid}/${d.path}`, 600, { download: d.save || true })
  if (data?.signedUrl) window.location.href = data.signedUrl
}

// ---------- pieces ----------

function stepsDone(j) {
  const d = [!!j.decided_at || j.status !== 'new', !!j.decided_at || SENT.includes(j.status), !!(j.filling_at || j.applied_at) || SENT.includes(j.status),
    !!j.applied_at || SENT.includes(j.status), !!j.confirmed_at, !!j.followed_up_at, HEARD.includes(j.status)]
  return d
}

function Progress({ j, full }) {
  const d = stepsDone(j)
  const heard = HEARD.includes(j.status) ? LABEL[j.status] : null
  if (!full) return <span className="jprog" title={STEPS.filter((_, i) => d[i]).pop()}>{d.map((x, i) => <i key={i} className={x ? 'on' : ''} />)}</span>
  const dates = [j.decided_at, j.decided_at, j.filling_at || j.applied_at, j.applied_at, j.confirmed_at, j.followed_up_at, j.responded_at]
  return (
    <div className="jprog-full">
      <span className="jprog wide">{d.map((x, i) => <i key={i} className={x ? 'on' : ''} />)}</span>
      <ol className="jprog-steps">
        {STEPS.map((s, i) => (
          <li key={s} className={d[i] ? 'on' : ''}>{i === 6 && heard ? heard : s}{d[i] && dates[i] && <span className="meta"> {shortDay(dates[i])}</span>}</li>
        ))}
      </ol>
    </div>
  )
}

function DocLinks({ list, docs, bare }) {
  if (!list?.length) return null
  return (
    <div className="job-sec">
      {!bare && <span className="eyebrow">Documents</span>}
      <ul className="doc-list">
        {list.map((d) => (
          <li key={d.path || d.url}>
            <FileText size={14} />
            {d.url
              ? <a className="grow clamp" href={d.url} target="_blank" rel="noreferrer">{d.label}</a>
              : docs.urls[d.path]
              ? <><a className="grow clamp" href={docs.urls[d.path]} target="_blank" rel="noreferrer">{d.label}</a>
                  <button className="icon-btn ok" title="Download" aria-label={`Download ${d.label}`} onClick={() => download(docs.uid, d)}><Download size={14} /></button></>
              : <span className="grow clamp meta">{d.label}{docs.ready && ' · not uploaded yet'}</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

function Asks({ j, act }) {
  const [mine, setMine] = useState(() => ({ ...(j.my_answers || {}) }))
  const [msg, setMsg] = useState('')
  const send = async () => {
    const missing = j.asks.findIndex((q, i) => !q.optional && !(mine[i] || '').trim())
    if (missing >= 0) { setMsg('Answer every question first.'); return }
    setMsg('Sending…')
    setMsg((await act(j, 'answers', mine)) ? 'Saved. Claude adds them to your form answers.' : 'Couldn’t save. Try again.')
  }
  return (
    <div className="job-sec">
      <span className="eyebrow">Your answers</span>
      {j.asks.map((q, i) => (
        <label key={i} className="field ask-field">{q.q}
          <textarea rows={q.long ? 5 : 2} value={mine[i] || ''} placeholder={q.hint || ''} onChange={(e) => setMine({ ...mine, [i]: e.target.value })} />
        </label>
      ))}
      <div className="row gap"><button className="btn primary sm" onClick={send}>Send my answers</button>{msg && <span className="hint">{msg}</span>}</div>
    </div>
  )
}

function Prep({ prep, outreach }) {
  const [open, setOpen] = useState(false)
  if (!prep && !outreach) return null
  return (
    <div className="job-sec">
      <button className="mini" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Show'} interview prep{outreach ? ' and outreach' : ''}</button>
      {open && prep && (
        <div className="stack prep">
          {prep.about && <p>{prep.about}</p>}
          {prep.questions?.length > 0 && <><span className="eyebrow">They may ask</span><ul className="job-steps">{prep.questions.map((q) => <li key={q}>{q}</li>)}</ul></>}
          {prep.stories?.length > 0 && <><span className="eyebrow">Stories to tell</span><ul className="job-steps">{prep.stories.map((q) => <li key={q}>{q}</li>)}</ul></>}
          {prep.ask?.length > 0 && <><span className="eyebrow">Ask them</span><ul className="job-steps">{prep.ask.map((q) => <li key={q}>{q}</li>)}</ul></>}
        </div>
      )}
      {open && outreach && (
        <div className="paste">
          <div className="row between"><b>Message to {outreach.name}</b><CopyBtn text={outreach.note} /></div>
          <p className="dump-text">{outreach.note}</p>
          {outreach.url && <a className="link" href={outreach.url} target="_blank" rel="noreferrer">Profile</a>}
        </div>
      )}
    </div>
  )
}

function Decide({ j, act }) {
  return (
    <div className="row gap wrap">
      <button className="btn primary" onClick={() => act(j, 'apply')}>Apply</button>
      <button className="btn" onClick={() => act(j, 'skip')}><SkipForward size={13} /> Skip</button>
    </div>
  )
}

function JobDetail({ j, docs, act, card }) {
  const sent = SENT.includes(j.status)
  const updates = [...(j.updates || [])].sort((x, y) => (y.date || '').localeCompare(x.date || ''))
  const links = [...(j.finish_url ? [{ label: 'Finish application', href: j.finish_url, primary: true }] : []), ...(j.actions || [])]
  return (
    <>
      {[j.org !== j.short && j.org, card && j.pay, j.extra?.where].some(Boolean) && <p className="meta">{[j.org !== j.short && j.org, card && j.pay, j.extra?.where].filter(Boolean).join(' · ')}</p>}
      {j.status !== 'new' && j.status !== 'skipped' && <Progress j={j} full />}
      {j.waiting_on && <p className={j.needs_you ? 'job-next' : ''}>{j.needs_you && <span className="spark-head">✦</span>}{j.waiting_on}</p>}
      {(j.status === 'new' || !j.waiting_on) && j.why && <p>{j.why}</p>}
      {j.todo && !sent && j.status !== 'skipped' && <p className="note">{j.todo}</p>}
      {j.needs_you && j.asks?.length > 0 && <Asks j={j} act={act} />}
      {links.length > 0 && (
        <div className="row gap wrap">
          {links.map((x, i) => (
            <a key={x.href + i} className={'btn sm' + (x.primary && (i === 0) && j.status !== 'new' ? ' primary' : '')} href={x.href} target="_blank" rel="noreferrer">{x.label} <ExternalLink size={12} /></a>
          ))}
        </div>
      )}
      <DocLinks list={j.docs} docs={docs} />
      {!sent && j.paste?.length > 0 && (
        <div className="job-sec">
          <span className="eyebrow">Answers to paste</span>
          {j.paste.map((p) => (
            <div key={p.title} className="paste">
              <div className="row between"><b>{p.title}</b><CopyBtn text={p.text} /></div>
              <p className="dump-text">{p.text}</p>
            </div>
          ))}
        </div>
      )}
      {j.status === 'new' && j.steps?.length > 0 && (
        <div className="job-sec">
          <span className="eyebrow">How to apply</span>
          <ol className="job-steps">{j.steps.map((s) => <li key={s}>{s}</li>)}</ol>
        </div>
      )}
      <Prep prep={j.extra?.prep} outreach={j.extra?.outreach} />
      {updates.length > 0 && (
        <div className="job-sec">
          <span className="eyebrow">Updates</span>
          <ul className="job-updates">
            {updates.map((u, i) => <li key={i}><span className="meta when">{fmtDay(u.date)}</span><span>{u.text}</span></li>)}
          </ul>
        </div>
      )}
    </>
  )
}

function JobRow({ j, open, onToggle, docs, act, n, tracker }) {
  return (
    <li className={'job' + (open ? ' open' : '')}>
      <button className="job-head" onClick={onToggle} aria-expanded={open}>
        <ChevronRight size={15} className="chev" />
        {n != null && <span className="num job-n">{n}</span>}
        <span className="grow col">
          <span className="job-role">{j.role}</span>
          <span className="meta clamp">{[name(j), j.pay].filter(Boolean).join(' · ')}</span>
        </span>
        {j.needs_you && <span className="tag">Needs you</span>}
        {tracker ? <><span className="pill">{LABEL[j.status]}</span><Progress j={j} /></>
          : j.status === 'new' ? <Due j={j} /> : <span className="pill">{LABEL[j.status]}</span>}
        {!tracker && grade(j.score) && <span className="grade" title={`Fit score ${j.score}`}>{grade(j.score)}</span>}
      </button>
      {open && (
        <div className="job-body">
          <JobDetail j={j} docs={docs} act={act} />
          {j.status === 'new' && <Decide j={j} act={act} />}
        </div>
      )}
    </li>
  )
}

function OneAtATime({ queue, docs, act }) {
  const j = queue[0]
  if (!j) return <section className="tile empty-card"><b>All caught up.</b><span className="meta">No new jobs to look at. Search for more or check the tracker.</span></section>
  const d = j.extra?.digest
  return (
    <section key={j.slug} className="tile reply-card job-card">
      <div className="row between">
        <span className="meta">{queue.length === 1 ? 'Last one' : `1 of ${queue.length}`}{d ? ` · digest #${d.n}` : ''}</span>
        <span className="row gap"><Due j={j} />{grade(j.score) && <span className="grade" title={`Fit score ${j.score}`}>{grade(j.score)}</span>}</span>
      </div>
      <div className="reply-from"><b>{j.role}</b><span className="clamp">{name(j)}</span></div>
      <JobDetail j={j} docs={docs} act={act} card />
      <Decide j={j} act={act} />
    </section>
  )
}

// ---------- search ----------

const FILTERS = {
  Where: ['Remote anywhere', 'Spain', 'US contract', 'Travel'],
  Hours: ['Full time', 'Part time', 'Contract'],
  Field: ['Design', 'UX/UI', 'Marketing', 'Social media', 'Writing', 'Education', 'AI training', 'Admin'],
}

function SearchPanel({ profile, setProfile, onClose, onSent }) {
  const [q, setQ] = useState('')
  const [pick, setPick] = useState({})
  const [ig, setIg] = useState((profile?.search?.instagram || []).join(', '))
  const [useIg, setUseIg] = useState(!!profile?.search?.instagram?.length)
  const [msg, setMsg] = useState('')
  const toggle = (g, v) => setPick((p) => ({ ...p, [g]: p[g]?.includes(v) ? p[g].filter((x) => x !== v) : [...(p[g] || []), v] }))
  const go = async () => {
    const handles = ig.split(/[\s,]+/).map((h) => h.trim()).filter(Boolean).map((h) => (h.startsWith('@') ? h : '@' + h))
    const parts = [q.trim() || 'Jobs that fit my profile', ...Object.entries(pick).filter(([, v]) => v.length).map(([g, v]) => `${g}: ${v.join(', ')}`)]
    if (useIg && handles.length) parts.push(`Instagram: ${handles.join(' ')}`)
    setMsg('Sending…')
    if (handles.join() !== (profile?.search?.instagram || []).join()) {
      const search = { ...(profile?.search || {}), instagram: handles }
      await supabase.from('job_profile').update({ search }).eq('user_id', profile.user_id)
      setProfile({ ...profile, search })
    }
    const { error } = await supabase.from('claude_requests').insert({
      action: 'job', status: 'approved', note: `search| ${parts.join('; ')}`, summary: `Job search: ${parts[0]}`, approval_ask: 'Search for jobs?',
    })
    if (error) { setMsg('Couldn’t send. Try again.'); return }
    onSent(); onClose()
  }
  return (
    <section className="tile stack search-panel">
      <div className="tile-head"><h2>Search for jobs</h2><button className="icon-btn ok" aria-label="Close" onClick={onClose}><X size={15} /></button></div>
      <input className="plain" value={q} onChange={(e) => setQ(e.target.value)} placeholder="What to look for, e.g. museum design, part time" />
      {Object.entries(FILTERS).map(([g, vs]) => (
        <div key={g} className="filter-row">
          <span className="eyebrow">{g}</span>
          <div className="chips ex-cats">{vs.map((v) => <button key={v} className="chip" aria-pressed={!!pick[g]?.includes(v)} onClick={() => toggle(g, v)}>{v}</button>)}</div>
        </div>
      ))}
      <div className="filter-row">
        <label className="chip-check"><input type="checkbox" checked={useIg} onChange={(e) => setUseIg(e.target.checked)} /> Also check Instagram accounts</label>
        {useIg && <input className="plain" value={ig} onChange={(e) => setIg(e.target.value)} placeholder="@account, @another" />}
      </div>
      <div className="row gap"><button className="btn primary" onClick={go}><Search size={13} /> Search</button>{msg && <span className="hint">{msg}</span>}</div>
      <p className="hint">Claude runs the search on the next sync. New finds show up here under More jobs.</p>
    </section>
  )
}

// ---------- tabs ----------

function DigestTab({ jobs, snapDigest, view, docs, act, searches, startOpen }) {
  const [open, setOpen] = useState(startOpen)
  const toggle = (k) => setOpen((o) => (o === k ? null : k))
  const latest = jobs.map((j) => j.extra?.digest?.date).filter(Boolean).sort().pop()
  const picks = jobs.filter((j) => latest && j.extra?.digest?.date === latest).sort((a, b) => a.extra.digest.n - b.extra.digest.n)
  const more = jobs.filter((j) => j.status === 'new' && !picks.includes(j) && isOpen(j)).sort((a, b) => (b.score || 0) - (a.score || 0))
  const queue = [...picks.filter((j) => j.status === 'new'), ...more]
  const dg = snapDigest?.date === latest ? snapDigest : null
  return (
    <>
      {searches.length > 0 && <p className="hint">Searching: {searches.map((s) => s.note.slice(8).split(';')[0]).join(' · ')}. Results land in More jobs.</p>}
      {view === 'one' ? <OneAtATime queue={queue} docs={docs} act={act} /> : (
        <>
          {picks.length > 0 && (
            <section className="tile">
              <div className="tile-head">
                <h2>Top {picks.length} from {fmtDay(latest + 'T12:00:00')}</h2>
                {picks[0].extra.digest.url && <a className="link" href={picks[0].extra.digest.url} target="_blank" rel="noreferrer">Open email</a>}
              </div>
              {dg?.intro && <p className="meta digest-intro">{dg.intro}</p>}
              <ul className="list jobs">
                {picks.map((j) => <JobRow key={j.slug} j={j} n={j.extra.digest.n} open={open === j.slug} onToggle={() => toggle(j.slug)} docs={docs} act={act} />)}
              </ul>
              {dg?.closing?.length > 0 && (
                <div className="job-sec digest-more">
                  <span className="eyebrow">Closing soon</span>
                  <ul className="links">
                    {dg.closing.map((c) => (
                      <li key={c.text}>
                        {c.url ? <a href={c.url} target="_blank" rel="noreferrer">{c.text}<ExternalLink size={12} /></a> : <span>{c.text}</span>}
                        {c.deadline && <span className="meta"> · {shortDay(c.deadline)}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {dg?.also?.length > 0 && (
                <div className="job-sec digest-more">
                  <span className="eyebrow">Also open</span>
                  <ul className="links">{dg.also.map((c) => <li key={c.url}><a href={c.url} target="_blank" rel="noreferrer">{c.text}<ExternalLink size={12} /></a></li>)}</ul>
                </div>
              )}
            </section>
          )}
          {more.length > 0 && (
            <section className="tile">
              <div className="tile-head"><h2>More jobs</h2><span className="meta">{more.length} open, best fit first</span></div>
              <ul className="list jobs">
                {more.map((j) => <JobRow key={j.slug} j={j} open={open === j.slug} onToggle={() => toggle(j.slug)} docs={docs} act={act} />)}
              </ul>
            </section>
          )}
        </>
      )}
    </>
  )
}

function TrackerTab({ jobs, docs, act, startOpen }) {
  const [open, setOpen] = useState(startOpen)
  const [showClosed, setShowClosed] = useState(false)
  const toggle = (k) => setOpen((o) => (o === k ? null : k))
  const recent = (a, b) => (b.applied_at || b.decided_at || '').localeCompare(a.applied_at || a.decided_at || '')
  const groups = [
    { k: 'you', title: 'Needs you', rows: jobs.filter((j) => j.needs_you && !['rejected', 'skipped'].includes(j.status)) },
    { k: 'progress', title: 'In progress', rows: jobs.filter((j) => j.status === 'approved' && !j.needs_you) },
    { k: 'applied', title: 'Applied', rows: jobs.filter((j) => SENT.includes(j.status) && !j.needs_you).sort((a, b) => HEARD.includes(b.status) - HEARD.includes(a.status) || recent(a, b)) },
  ]
  const closed = jobs.filter((j) => ['rejected', 'skipped'].includes(j.status)).sort(recent)
  return (
    <>
      {groups.map((g) => g.rows.length > 0 && (
        <section key={g.k} className="tile">
          <div className="tile-head"><h2>{g.title}</h2><span className="meta">{g.rows.length}</span></div>
          <ul className="list jobs">{g.rows.map((j) => <JobRow key={j.slug} j={j} tracker open={open === j.slug} onToggle={() => toggle(j.slug)} docs={docs} act={act} />)}</ul>
        </section>
      ))}
      {groups.every((g) => !g.rows.length) && <p className="empty">Nothing in progress. Apply to something in Digest.</p>}
      {closed.length > 0 && (
        <div>
          <button className="mini" onClick={() => setShowClosed(!showClosed)}>{showClosed ? 'Hide' : 'Show'} closed ({closed.length})</button>
          {showClosed && <ul className="tile list jobs closed-list">{closed.map((j) => <JobRow key={j.slug} j={j} tracker open={open === j.slug} onToggle={() => toggle(j.slug)} docs={docs} act={act} />)}</ul>}
        </div>
      )}
    </>
  )
}

async function uploadDocs(files, uid, paths, onStep) {
  const byName = Object.fromEntries(paths.map((p) => [p.split('/').pop(), p]))
  const items = []
  for (const f of files) {
    if (/\.zip$/i.test(f.name)) {
      const out = unzipSync(new Uint8Array(await f.arrayBuffer()), { filter: (x) => /\.pdf$/i.test(x.name) && !x.name.includes('__MACOSX') })
      for (const [n, bytes] of Object.entries(out)) items.push([n, new Blob([bytes], { type: 'application/pdf' })])
    } else if (/\.pdf$/i.test(f.name)) items.push([f.name, f])
  }
  let done = 0, failed = 0
  for (const [n, body] of items) {
    const base = n.split('/').pop()
    const path = byName[base] || (n.includes('docs/') ? n.slice(n.indexOf('docs/')) : `docs/${base}`)
    const { error } = await supabase.storage.from(BUCKET).upload(`${uid}/${path}`, body, { contentType: 'application/pdf', upsert: false })
    if (error && !/exists|duplicate/i.test(error.message)) failed++
    onStep(++done, items.length, failed)
  }
  return { total: items.length, failed }
}

function DocsTab({ jobs, profile, docs }) {
  const [msg, setMsg] = useState('')
  const missing = docs.paths.filter((p) => !docs.urls[p])
  const base = profile?.base_docs || []
  const baseSet = new Set(base.map((d) => d.path))
  const groups = [...new Set(base.map((d) => d.group))]
  const withDocs = jobs.filter((j) => (j.docs || []).some((d) => !baseSet.has(d.path)))
    .sort((a, b) => (a.status === 'new') - (b.status === 'new') || (b.decided_at || '').localeCompare(a.decided_at || ''))
  const onFiles = async (e) => {
    const files = [...e.target.files]
    if (!files.length) return
    setMsg('Reading…')
    const r = await uploadDocs(files, docs.uid, docs.paths, (n, t, f) => setMsg(`Uploading ${n} of ${t}${f ? `, ${f} failed` : ''}…`))
    setMsg(r.failed ? `${r.failed} of ${r.total} didn’t upload. Try those again.` : `Uploaded ${r.total} files.`)
    e.target.value = ''
    docs.reload()
  }
  return (
    <>
      {docs.ready && missing.length > 0 && (
        <section className="tile stack">
          <div className="tile-head"><h2>{missing.length} of {docs.paths.length} documents still need uploading</h2></div>
          <p className="meta">Pick the Job Hub docs zip, or the PDFs themselves. Each one goes to the job it belongs to.</p>
          <div className="row gap wrap">
            <label className="btn primary"><Upload size={13} /> Upload zip or PDFs<input type="file" accept=".zip,application/pdf,application/zip" multiple hidden onChange={onFiles} /></label>
            {msg && <span className="hint">{msg}</span>}
          </div>
        </section>
      )}
      {groups.map((g) => (
        <section key={g} className="tile">
          <div className="tile-head"><h2>{g}</h2></div>
          <DocLinks list={base.filter((d) => d.group === g)} docs={docs} bare />
        </section>
      ))}
      {withDocs.length > 0 && (
        <section className="tile">
          <div className="tile-head"><h2>By job</h2><span className="meta">{withDocs.length}</span></div>
          <ul className="list">
            {withDocs.map((j) => (
              <li key={j.slug} className="doc-job">
                <span className="col"><b className="job-role">{name(j)}</b><span className="meta clamp">{j.role} · {LABEL[j.status]}</span></span>
                <DocLinks list={j.docs.filter((d) => !baseSet.has(d.path))} docs={docs} bare />
              </li>
            ))}
          </ul>
        </section>
      )}
      {!missing.length && msg && <p className="hint">{msg}</p>}
    </>
  )
}

const PICKS = [['roles', 'Roles'], ['causes', 'Causes'], ['org', 'Organizations'], ['level', 'Level'], ['hours', 'Hours'], ['where', 'Where'], ['pay', 'Pay']]

function ProfileTab({ profile }) {
  const p = profile || {}
  const weights = Object.entries(p.weights || {}).sort((a, b) => b[1] - a[1])
  const total = weights.reduce((s, [, v]) => s + v, 0) || 1
  return (
    <>
      <section className="tile">
        <div className="tile-head"><h2>Application info</h2><a className="link" href="#/profile">Edit in Profile</a></div>
        <ul className="list info-list">
          {(p.info || []).map(([k, v]) => (
            <li key={k}><span className="col grow"><span className="meta">{k}</span><span>{v}</span></span><CopyBtn text={v} /></li>
          ))}
        </ul>
      </section>
      <section className="tile">
        <div className="tile-head"><h2>What you’re looking for</h2></div>
        {PICKS.filter(([k]) => p.picks?.[k]?.length).map(([k, label]) => (
          <div key={k} className="filter-row">
            <span className="eyebrow">{label}</span>
            <ul className="chips">{p.picks[k].map((v) => <li key={v} className="chip">{v}</li>)}</ul>
          </div>
        ))}
        {p.more && <p className="meta more-note">{p.more}</p>}
      </section>
      {weights.length > 0 && (
        <section className="tile">
          <div className="tile-head"><h2>How jobs are scored</h2></div>
          <ul className="list weights">
            {weights.map(([k, v]) => <li key={k}><span className="grow">{k}</span><span className="wbar"><i style={{ width: `${(v / total) * 100}%` }} /></span><span className="meta num">{v}%</span></li>)}
          </ul>
        </section>
      )}
      {(p.watchlist?.length > 0 || p.search?.instagram?.length > 0) && (
        <section className="tile">
          <div className="tile-head"><h2>Watchlist</h2><span className="meta">{p.watchlist?.length || 0} organizations</span></div>
          <ul className="chips">{(p.watchlist || []).map((v) => <li key={v} className="chip">{v}</li>)}</ul>
          {p.search?.instagram?.length > 0 && (
            <div className="filter-row"><span className="eyebrow">Instagram accounts</span><ul className="chips">{p.search.instagram.map((v) => <li key={v} className="chip">{v}</li>)}</ul></div>
          )}
        </section>
      )}
    </>
  )
}

// ---------- page ----------

const VIEW_KEY = 'jobs-view'

export default function Jobs() {
  const { jobs, setJobs, profile, setProfile, searches, reload } = useJobs()
  const docs = useDocs(jobs, profile)
  const snap = useSnapshot('jobs')
  const [params] = useSearchParams()
  const [tab, setTab] = useState(params.get('tab') || 'digest')
  const [view, setView] = useState(() => { if (params.get('view')) return params.get('view'); try { return localStorage.getItem(VIEW_KEY) || 'one' } catch { return 'one' } })
  const [searching, setSearching] = useState(false)
  const [err, setErr] = useState('')

  const pickView = (v) => { setView(v); try { localStorage.setItem(VIEW_KEY, v) } catch { /* ignore */ } }

  // Apply, skip or send answers: update the row right away, then queue Claude to do the work.
  async function act(j, kind, answers) {
    const at = now()
    const patch = kind === 'apply'
      ? { status: 'approved', decided_at: at, needs_you: false, waiting_on: 'Claude is making your resume, cover letter and form answers.', updates: [...(j.updates || []), { date: at, text: 'You approved it.' }] }
      : kind === 'skip'
        ? { status: 'skipped', decided_at: at, needs_you: false, updates: [...(j.updates || []), { date: at, text: 'You skipped it.' }] }
        : { my_answers: answers, needs_you: false, waiting_on: 'Your answers are in. Claude adds them to the form answers.', updates: [...(j.updates || []), { date: at, text: 'You sent your answers.' }] }
    const verb = { apply: 'Apply', skip: 'Skip', answers: 'Answers' }[kind]
    const before = j
    setJobs((js) => js.map((x) => (x.slug === j.slug ? { ...x, ...patch } : x)))
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from('jobs').update(patch).eq('slug', j.slug),
      supabase.from('claude_requests').insert({ action: 'job', status: 'approved', note: `job:${j.slug}| ${verb}: ${title(j)}`, summary: `${verb}: ${title(j)}`, approval_ask: `${verb} ${title(j)}?` }),
    ])
    if (e1 || e2) {
      setJobs((js) => js.map((x) => (x.slug === j.slug ? before : x)))
      setErr('Couldn’t save that. Try again.')
      return false
    }
    setErr('')
    return true
  }

  const tabs = [
    { k: 'digest', label: 'Digest' },
    { k: 'tracker', label: 'Tracker', n: jobs?.filter((j) => j.needs_you && !['rejected', 'skipped'].includes(j.status)).length },
    { k: 'docs', label: 'Docs' },
    { k: 'profile', label: 'Profile' },
  ]
  const current = tabs.some((t) => t.k === tab) ? tab : 'digest'

  return (
    <div className="page">
      <PageHeader title="Jobs">
        {current === 'digest' && (
          <>
            <div className="seg icons">
              <button aria-pressed={view === 'one'} onClick={() => pickView('one')} aria-label="One at a time" title="One at a time"><Layers size={14} /></button>
              <button aria-pressed={view === 'list'} onClick={() => pickView('list')} aria-label="List" title="List"><List size={14} /></button>
            </div>
            <button className="btn" onClick={() => setSearching(!searching)}><Search size={13} /> Search</button>
          </>
        )}
      </PageHeader>

      <div className="seg tabs-seg">
        {tabs.map((t) => (
          <button key={t.k} aria-pressed={current === t.k} onClick={() => setTab(t.k)}>{t.label}{t.n ? <span className="seg-n hot"> {t.n}</span> : null}</button>
        ))}
      </div>

      {err && <p className="error">{err}</p>}
      {!jobs && <p className="empty">Loading…</p>}

      {jobs && current === 'digest' && searching && <SearchPanel profile={profile} setProfile={setProfile} onClose={() => setSearching(false)} onSent={reload} />}
      {jobs && current === 'digest' && <DigestTab jobs={jobs} snapDigest={snap?.payload?.digest} view={view} docs={docs} act={act} searches={searches} startOpen={params.get('open')} />}
      {jobs && current === 'tracker' && <TrackerTab jobs={jobs} docs={docs} act={act} startOpen={params.get('open')} />}
      {jobs && current === 'docs' && <DocsTab jobs={jobs} profile={profile} docs={docs} />}
      {jobs && current === 'profile' && <ProfileTab profile={profile} />}
    </div>
  )
}
