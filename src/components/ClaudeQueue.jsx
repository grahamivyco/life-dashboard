import { useCallback, useEffect, useState } from 'react'
import { ChevronRight, Check, X, ExternalLink } from 'lucide-react'
import { supabase } from '../supabase.js'
import { ago } from '../lib.js'

function Links({ links }) {
  if (!links?.length) return null
  const images = links.filter((l) => l.image)
  const rest = links.filter((l) => !l.image)
  return (
    <>
      {images.length > 0 && (
        <div className="shots">
          {images.map((l, i) => (
            <a key={i} href={l.url} target="_blank" rel="noreferrer" className="shot">
              <img src={l.url} alt={l.title || 'Preview'} loading="lazy" />
              {l.title && <span className="meta">{l.title}</span>}
            </a>
          ))}
        </div>
      )}
      <LinkList links={rest} />
    </>
  )
}

function LinkList({ links }) {
  if (!links.length) return null
  return (
    <ul className="links">
      {links.map((l, i) => (
        <li key={i}><a href={l.url} target="_blank" rel="noreferrer">{l.title || l.url}<ExternalLink size={12} /></a></li>
      ))}
    </ul>
  )
}

function Row({ r, open, onToggle, children }) {
  const unread = r.status === 'done' && !r.seen_at
  return (
    <li className={'q-row' + (open ? ' open' : '')}>
      <div className="dump-head">
        <button className="dump-toggle" onClick={onToggle} aria-expanded={open}>
          <ChevronRight size={15} className="chev" />
          {unread && <span className="unread" />}
          <span className="grow clamp">{r.item?.title || r.note || 'Request'}</span>
          <span className="meta">{r.status === 'needs_approval' ? 'Needs you' : r.status === 'failed' ? 'Stuck' : ago(r.updated_at)}</span>
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
    </li>
  )
}

// Claude's finished work and anything waiting on your OK. Lives on Today.
export default function ClaudeQueue() {
  const [reqs, setReqs] = useState([])
  const [open, setOpen] = useState(null)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('claude_requests')
      .select('*, item:items(title, kind)')
      .neq('status', 'dismissed')
      .order('updated_at', { ascending: false })
      .limit(60)
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
      const now = new Date().toISOString()
      await supabase.from('claude_requests').update({ seen_at: now }).eq('id', r.id)
      setReqs((xs) => xs.map((x) => (x.id === r.id ? { ...x, seen_at: now } : x)))
    }
  }

  const shown = reqs.filter((r) => ['needs_approval', 'done', 'failed'].includes(r.status))
  const working = reqs.filter((r) => ['queued', 'working', 'approved'].includes(r.status)).length

  return (
    <section className="tile">
      <div className="tile-head">
        <h2><span className="spark-head">✦</span> Claude</h2>
        <span className="meta">{working ? `${working} in progress` : 'All caught up'}</span>
      </div>
      {shown.length === 0 ? (
        <p className="empty">Claude works through your tasks and ideas every hour. Results show up here.</p>
      ) : (
        <ul className="list q-list">
          {shown.map((r) => (
            <Row key={r.id} r={r} open={open === r.id} onToggle={() => toggle(r)}>
              {r.status === 'needs_approval' && (
                <button className="icon-btn ok" onClick={() => setStatus(r.id, 'approved')} aria-label="Approve" title="Approve"><Check size={16} /></button>
              )}
              <button className="icon-btn" onClick={() => setStatus(r.id, 'dismissed')} aria-label="Dismiss" title="Dismiss"><X size={16} /></button>
            </Row>
          ))}
        </ul>
      )}
    </section>
  )
}
