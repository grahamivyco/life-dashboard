import { useCallback, useEffect, useState } from 'react'
import { ChevronRight, Check, X, ExternalLink } from 'lucide-react'
import { supabase } from '../supabase.js'
import PageHeader from '../components/PageHeader.jsx'
import { ago } from '../lib.js'

const label = { queued: 'Queued', working: 'Working', approved: 'Approved, running next' }

function Links({ links }) {
  if (!links?.length) return null
  return (
    <ul className="links">
      {links.map((l, i) => (
        <li key={i}><a href={l.url} target="_blank" rel="noreferrer">{l.title || l.url}<ExternalLink size={12} /></a></li>
      ))}
    </ul>
  )
}

function Card({ r, open, onToggle, children }) {
  const unread = r.status === 'done' && !r.seen_at
  return (
    <article className={'tile dump' + (open ? ' open' : '')}>
      <div className="dump-head">
        <button className="dump-toggle" onClick={onToggle} aria-expanded={open}>
          <ChevronRight size={15} className="chev" />
          {unread && <span className="unread" />}
          <span className="grow clamp">{r.item?.title || 'Request'}</span>
          <span className="meta">{ago(r.updated_at)}</span>
        </button>
        {children}
      </div>
      {open && (
        <div className="dump-body">
          {r.summary && <p><b>{r.summary}</b></p>}
          {r.approval_ask && <p className="ask">{r.approval_ask}</p>}
          {r.result && <p className="dump-text">{r.result}</p>}
          <Links links={r.links} />
        </div>
      )}
    </article>
  )
}

export default function Inbox() {
  const [reqs, setReqs] = useState([])
  const [open, setOpen] = useState(null)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('claude_requests')
      .select('*, item:items(title, kind)')
      .not('status', 'in', '(dismissed)')
      .order('updated_at', { ascending: false })
      .limit(100)
    setReqs(data || [])
  }, [])

  useEffect(() => { load() }, [load])

  async function setStatus(id, status) {
    await supabase.from('claude_requests').update({ status }).eq('id', id)
    load()
  }

  async function toggle(r) {
    const next = open === r.id ? null : r.id
    setOpen(next)
    if (next && r.status === 'done' && !r.seen_at) {
      await supabase.from('claude_requests').update({ seen_at: new Date().toISOString() }).eq('id', r.id)
      setReqs((xs) => xs.map((x) => (x.id === r.id ? { ...x, seen_at: new Date().toISOString() } : x)))
    }
  }

  const needs = reqs.filter((r) => r.status === 'needs_approval')
  const done = reqs.filter((r) => r.status === 'done' || r.status === 'failed')
  const working = reqs.filter((r) => ['queued', 'working', 'approved'].includes(r.status))

  return (
    <div className="page">
      <PageHeader eyebrow="Claude works through your tasks and ideas every hour" title="Inbox" />

      <section className="stack">
        <h2 className="sec-title">Needs you <span className="count">{needs.length}</span></h2>
        {needs.length === 0 && <p className="empty">Nothing waiting on you.</p>}
        {needs.map((r) => (
          <Card key={r.id} r={r} open={open === r.id} onToggle={() => toggle(r)}>
            <button className="icon-btn ok" onClick={() => setStatus(r.id, 'approved')} aria-label="Approve" title="Approve"><Check size={16} /></button>
            <button className="icon-btn" onClick={() => setStatus(r.id, 'dismissed')} aria-label="Dismiss" title="Dismiss"><X size={16} /></button>
          </Card>
        ))}
      </section>

      <section className="stack">
        <h2 className="sec-title">Done</h2>
        {done.length === 0 && <p className="empty">Finished work shows up here.</p>}
        {done.map((r) => (
          <Card key={r.id} r={r} open={open === r.id} onToggle={() => toggle(r)}>
            <button className="icon-btn" onClick={() => setStatus(r.id, 'dismissed')} aria-label="Clear" title="Clear"><X size={16} /></button>
          </Card>
        ))}
      </section>

      <section className="stack">
        <h2 className="sec-title">In progress</h2>
        {working.length === 0 && <p className="empty">Nothing queued.</p>}
        <ul className="tile list">
          {working.map((r) => (
            <li key={r.id}>
              <span className="grow clamp">{r.item?.title || 'Request'}</span>
              <span className="pill">{label[r.status]}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
