import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronRight, Copy, Check, ExternalLink } from 'lucide-react'
import { supabase } from '../supabase.js'
import { useSnapshot } from '../useSnapshot.js'
import PageHeader from '../components/PageHeader.jsx'
import { ago, fmtDay } from '../lib.js'

// Jobs: Graham's Job Hub (jobs, packets, application status) plus the newest daily digest.
// The hourly sync writes both into the 'jobs' snapshot (scripts/jobs-snapshot.mjs).
// Apply / Skip insert an approved claude_requests row (action 'job') that the sync carries out.

const LABEL = { approved: 'Getting submitted', applied: 'Applied', interview: 'Interview', offer: 'Offer', accepted: 'Hired', rejected: 'Denied', skipped: 'Skipped' }
const SENT = ['applied', 'interview', 'offer', 'accepted']
const CLOSED = ['rejected', 'skipped']

const today = () => new Date(new Date().toDateString())
const daysLeft = (iso) => Math.round((new Date(iso + 'T12:00:00') - today()) / 864e5)
const shortDay = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

function Due({ due, text }) {
  if (!due) return text ? <span className="meta">{text}</span> : null
  const n = daysLeft(due)
  const label = n < 0 ? `Closed ${shortDay(due)}` : n === 0 ? 'Due today' : n === 1 ? 'Due tomorrow' : n <= 14 ? `Due in ${n} days` : `Due ${shortDay(due)}`
  return <span className={'meta' + (n >= 0 && n <= 7 ? ' needs' : '')} title={shortDay(due)}>{label}</span>
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

function Decide({ id, title, picked, onPick, apply = 'Yes, apply' }) {
  if (picked) return <p className="sending">{picked === 'apply' ? 'Sent to Claude to apply.' : 'Skipped.'}</p>
  return (
    <div className="row gap">
      <button className="btn primary sm" onClick={() => onPick(id, 'apply', title)}>{apply}</button>
      <button className="btn sm" onClick={() => onPick(id, 'skip', title)}>Skip</button>
    </div>
  )
}

function JobRow({ j, open, onToggle, picked, onPick }) {
  const a = j.app
  const status = a?.status
  const pill = picked ? (picked === 'apply' ? 'Sent to Claude' : 'Skipped') : status ? LABEL[status] : j.statusText === 'New' ? null : j.statusText
  const updates = [...(a?.updates || [])].sort((x, y) => (y.date || y.at || '').localeCompare(x.date || x.at || ''))
  return (
    <li className={'job' + (open ? ' open' : '')}>
      <button className="job-head" onClick={onToggle} aria-expanded={open}>
        <ChevronRight size={15} className="chev" />
        <span className="grow col">
          <span className="job-role">{j.role}</span>
          <span className="meta clamp">{[j.short || j.org?.split(' · ')[0], j.pay].filter(Boolean).join(' · ')}</span>
        </span>
        {a?.needsYou && status === 'approved' && <span className="tag">Needs you</span>}
        {pill && <span className={'pill' + (a?.needsYou ? ' ok' : '')}>{pill}</span>}
        {!status && <Due due={j.due} text={j.dueText} />}
        {j.grade && <span className="grade" title={`Fit score ${j.score}`}>{j.grade}</span>}
      </button>
      {open && (
        <div className="job-body">
          {j.org && j.org !== j.short && <p className="meta">{j.org}</p>}
          {a?.waitingOn && <p className={a.needsYou ? 'job-next' : ''}>{a.needsYou && <span className="spark-head">✦</span>}{a.waitingOn}</p>}
          {!a && j.why && <p>{j.why}</p>}
          {!a && j.next && <p className="job-next"><span className="spark-head">✦</span>{j.next}</p>}
          {j.todo && !SENT.includes(status) && <p className="note">{j.todo}</p>}

          {!status && <Decide id={`job:${j.slug}`} title={`${j.role} at ${j.short || j.org}`} picked={picked} onPick={onPick} />}

          {(j.actions.length > 0 || a?.finishUrl) && (
            <div className="row gap wrap">
              {a?.finishUrl && <a className="btn primary sm" href={a.finishUrl} target="_blank" rel="noreferrer">Finish application <ExternalLink size={12} /></a>}
              {j.actions.map((x) => (
                <a key={x.href} className={'btn sm' + (x.primary && status && !a?.finishUrl ? ' primary' : '')} href={x.href} target="_blank" rel="noreferrer">{x.label} <ExternalLink size={12} /></a>
              ))}
            </div>
          )}

          {a?.needsYou && a.asks?.length > 0 && (
            <div className="job-sec">
              <span className="eyebrow">Questions only you can answer</span>
              <ol className="job-steps">{a.asks.map((q) => <li key={q.q}>{q.q}{q.hint && <span className="meta"> ({q.hint})</span>}</li>)}</ol>
            </div>
          )}

          {!SENT.includes(status) && j.steps?.length > 0 && (
            <div className="job-sec">
              <span className="eyebrow">Steps</span>
              <ol className="job-steps">{j.steps.map((s) => <li key={s}>{s}</li>)}</ol>
            </div>
          )}

          {!SENT.includes(status) && j.paste?.length > 0 && (
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

          {j.docs?.length > 0 && <p className="meta">Documents in the Job Hub: {j.docs.join(', ')}</p>}

          {updates.length > 0 && (
            <div className="job-sec">
              <span className="eyebrow">Progress</span>
              <ul className="job-updates">
                {updates.map((u, i) => <li key={i}><span className="meta when">{fmtDay(u.date || u.at)}</span><span>{u.text}</span></li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </li>
  )
}

function DigestRow({ p, digest, open, onToggle, picked, onPick }) {
  return (
    <li className={'job' + (open ? ' open' : '')}>
      <button className="job-head" onClick={onToggle} aria-expanded={open}>
        <ChevronRight size={15} className="chev" />
        <span className="num job-n">{p.n}</span>
        <span className="grow col">
          <span className="job-role">{p.role}</span>
          <span className="meta clamp">{[p.org, p.pay].filter(Boolean).join(' · ')}</span>
        </span>
        {picked && <span className="pill">{picked === 'apply' ? 'Sent to Claude' : 'Skipped'}</span>}
        <Due due={p.deadline} />
      </button>
      {open && (
        <div className="job-body">
          <p className="meta">{p.where}</p>
          <p>{p.why}</p>
          {p.apply && <p className="meta">How to apply: {p.apply}</p>}
          <div className="row gap wrap">
            <Decide id={`digest:${digest.thread_id}#${p.n}`} title={`${p.role} at ${p.org}`} picked={picked} onPick={onPick} apply="Make a packet" />
            <a className="btn sm" href={p.url} target="_blank" rel="noreferrer">Posting <ExternalLink size={12} /></a>
          </div>
        </div>
      )}
    </li>
  )
}

export default function Jobs() {
  const snap = useSnapshot('jobs')
  const [params] = useSearchParams()
  const [tab, setTab] = useState(params.get('tab') || 'digest')
  const [open, setOpen] = useState(params.get('open'))
  const [picks, setPicks] = useState({})

  // Decisions already sent to Claude (so the buttons don't come back before the next sync)
  useEffect(() => {
    supabase.from('claude_requests').select('note,status').eq('action', 'job').order('created_at', { ascending: true })
      .then(({ data }) => {
        const out = {}
        for (const r of data || []) {
          const [id, choice] = (r.note || '').split('|')
          if (r.status !== 'failed' && r.status !== 'dismissed') out[id] = choice?.trim().split(':')[0].toLowerCase()
        }
        setPicks(out)
      })
  }, [])

  async function pick(id, choice, title) {
    setPicks((p) => ({ ...p, [id]: choice }))
    const verb = choice === 'apply' ? 'Apply' : 'Skip'
    const { error } = await supabase.from('claude_requests').insert({
      action: 'job', status: 'approved', note: `${id}| ${verb}: ${title}`,
      approval_ask: `${verb} ${title}?`, summary: `${verb}: ${title}`,
    })
    if (error) setPicks((p) => { const n = { ...p }; delete n[id]; return n })
  }

  if (!snap) {
    return (
      <div className="page">
        <PageHeader title="Jobs" />
        <p className="empty">Your jobs appear here after the next sync.</p>
      </div>
    )
  }

  const p = snap.payload
  const jobs = p.jobs || []
  const digest = p.digest
  const isOpen = (j) => !j.due || daysLeft(j.due) >= 0
  const groups = {
    new: jobs.filter((j) => !j.app && isOpen(j) && !picks[`job:${j.slug}`]).sort((x, y) => (y.score || 0) - (x.score || 0)),
    progress: jobs.filter((j) => j.app?.status === 'approved' || (!j.app && picks[`job:${j.slug}`] === 'apply'))
      .sort((x, y) => (y.app?.needsYou ? 1 : 0) - (x.app?.needsYou ? 1 : 0)),
    sent: jobs.filter((j) => SENT.includes(j.app?.status)).sort((x, y) => (y.app.appliedAt || '').localeCompare(x.app.appliedAt || '')),
    closed: jobs.filter((j) => CLOSED.includes(j.app?.status) || (!j.app && picks[`job:${j.slug}`] === 'skip')),
  }
  const needsYou = groups.progress.filter((j) => j.app?.needsYou).length
  const interviews = jobs.filter((j) => ['interview', 'offer'].includes(j.app?.status)).length
  const tabs = [
    digest && { k: 'digest', label: 'Digest', n: digest.picks.length },
    { k: 'new', label: 'New', n: groups.new.length },
    { k: 'progress', label: 'In progress', n: groups.progress.length },
    { k: 'sent', label: 'Applied', n: groups.sent.length },
    { k: 'closed', label: 'Closed', n: groups.closed.length },
  ].filter(Boolean)
  const current = tabs.some((t) => t.k === tab) ? tab : tabs[0].k
  const toggle = (k) => setOpen((o) => (o === k ? null : k))

  return (
    <div className="page">
      <PageHeader eyebrow={`Job Hub · synced ${ago(snap.synced_at)}`} title="Jobs">
        <a className="btn" href={p.hub_url} target="_blank" rel="noreferrer">Open Job Hub <ExternalLink size={12} /></a>
      </PageHeader>

      <div className="stats even">
        <button className="tile stat" onClick={() => setTab('progress')}><span className="eyebrow">Need you</span><span className={'big' + (needsYou ? ' hot' : '')}>{needsYou}</span></button>
        <button className="tile stat" onClick={() => setTab('new')}><span className="eyebrow">New</span><span className="big">{groups.new.length + (digest?.picks.length || 0)}</span></button>
        <button className="tile stat" onClick={() => setTab('sent')}><span className="eyebrow">Applied</span><span className="big">{groups.sent.length}</span></button>
        <button className="tile stat" onClick={() => setTab('sent')}><span className="eyebrow">Interviews</span><span className="big">{interviews}</span></button>
      </div>

      <div className="seg tabs-seg">
        {tabs.map((t) => (
          <button key={t.k} aria-pressed={current === t.k} onClick={() => { setTab(t.k); setOpen(null) }}>{t.label} <span className="seg-n">{t.n}</span></button>
        ))}
      </div>

      {current === 'digest' && digest && (
        <section className="tile">
          <div className="tile-head">
            <h2>Top 5 from {fmtDay(digest.date + 'T12:00:00')}</h2>
            <a className="link" href={digest.url} target="_blank" rel="noreferrer">Open email</a>
          </div>
          {digest.intro && <p className="meta digest-intro">{digest.intro}</p>}
          <ul className="list jobs">
            {digest.picks.map((x) => (
              <DigestRow key={x.n} p={x} digest={digest} open={open === `d${x.n}`} onToggle={() => toggle(`d${x.n}`)}
                picked={picks[`digest:${digest.thread_id}#${x.n}`]} onPick={pick} />
            ))}
          </ul>
          {digest.closing?.length > 0 && (
            <div className="job-sec digest-more">
              <span className="eyebrow">Closing soon</span>
              <ul className="links">
                {digest.closing.map((c) => (
                  <li key={c.text}>
                    {c.url ? <a href={c.url} target="_blank" rel="noreferrer">{c.text}<ExternalLink size={12} /></a> : <span>{c.text}</span>}
                    {c.deadline && <span className="meta"> · {shortDay(c.deadline)}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {digest.also?.length > 0 && (
            <div className="job-sec digest-more">
              <span className="eyebrow">Also open</span>
              <ul className="links">
                {digest.also.map((c) => <li key={c.url}><a href={c.url} target="_blank" rel="noreferrer">{c.text}<ExternalLink size={12} /></a></li>)}
              </ul>
            </div>
          )}
        </section>
      )}

      {current !== 'digest' && (
        groups[current].length === 0
          ? <p className="empty">{current === 'new' ? 'No new jobs. The digest has today’s picks.' : 'Nothing here yet.'}</p>
          : (
            <ul className="tile list jobs">
              {groups[current].map((j) => (
                <JobRow key={j.slug} j={j} open={open === j.slug} onToggle={() => toggle(j.slug)} picked={picks[`job:${j.slug}`]} onPick={pick} />
              ))}
            </ul>
          )
      )}
    </div>
  )
}
