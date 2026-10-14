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

// A result like 'Approve "Mic button on Mac and iPhone" to ship both' points at another
// request waiting on approval. Returns that request so we can show its Approve button here.
function parentOf(r, pending) {
  const m = r.result?.match(/Approve "([^"]+)"/)
  if (!m || r.status === 'needs_approval') return null
  return pending.find((p) => (p.item?.title || p.note) === m[1]) || null
}

function Approval({ r, open, onToggle, onApprove, onDismiss }) {
  return (
    <li className="approval">
      <div className="approval-main">
        <div className="grow">
          <p className="approval-title">{r.item?.title || r.note || 'Request'}</p>
          {r.summary && <p className="meta">{r.summary}</p>}
        </div>
        <button className="btn primary" onClick={onApprove}><Check size={14} /> {r.approval_ask?.startsWith('Ship') ? 'Approve and ship' : 'Approve'}</button>
        <button className="icon-btn" onClick={onDismiss} aria-label="Dismiss" title="Dismiss"><X size={16} /></button>
      </div>
      <div className="approval-sub">
        {r.approval_ask && <span className="meta">{r.approval_ask}</span>}
        <button className="mini" onClick={onToggle}>{open ? 'Hide details' : 'See details'}</button>
      </div>
      {open && (
        <div className="dump-body">
          {r.result && <p className="dump-text">{r.result}</p>}
          <Links links={r.links} />
        </div>
      )}
    </li>
  )
}

function Row({ r, open, onToggle, parent, onApproveParent, children }) {
  const unread = r.status === 'done' && !r.seen_at
  return (
    <li className={'q-row' + (open ? ' open' : '')}>
      <div className="dump-head">
        <button className="dump-toggle" onClick={onToggle} aria-expanded={open}>
          <ChevronRight size={15} className="chev" />
          {unread && <span className="unread" />}
          <span className="grow clamp">{r.item?.title || r.note || 'Request'}</span>
          <span className="meta">{r.status === 'approved' ? 'Approved, ships next sync' : r.status === 'failed' ? 'Stuck' : ago(r.updated_at)}</span>
        </button>
        {children}
      </div>
      {open && (
        <div className="dump-body">
          {r.summary && <p><b>{r.summary}</b></p>}
          {r.approval_ask && <p className="ask">{r.approval_ask}</p>}
          {r.result && <p className="dump-text">{r.result}</p>}
          {parent && (
            <button className="btn primary dep-approve" onClick={onApproveParent}><Check size={14} /> Approve “{parent.item?.title || parent.note}”</button>
          )}
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

  // Instant chat answers stay in the Ask Claude panel; only worker results show here.
  const visible = (r) => !(r.action === 'ask' && !r.result && !r.summary)
  const pending = reqs.filter((r) => r.status === 'needs_approval' && visible(r))
  const shown = reqs.filter((r) => ['done', 'failed', 'approved'].includes(r.status) && visible(r))
  const working = reqs.filter((r) => ['queued', 'working', 'approved'].includes(r.status)).length

  return (
    <section className="tile">
      <div className="tile-head">
        <h2><span className="spark-head">✦</span> Claude</h2>
        <span className={'meta' + (pending.length ? ' needs' : '')}>
          {pending.length ? `${pending.length} need${pending.length === 1 ? 's' : ''} your OK` : working ? `${working} in progress` : 'All caught up'}
        </span>
      </div>
      {pending.length > 0 && (
        <ul className="approvals">
          {pending.map((r) => (
            <Approval key={r.id} r={r} open={open === r.id} onToggle={() => toggle(r)}
              onApprove={() => setStatus(r.id, 'approved')} onDismiss={() => setStatus(r.id, 'dismissed')} />
          ))}
        </ul>
      )}
      {shown.length === 0 && pending.length === 0 ? (
        <p className="empty">Claude works through your tasks and ideas every hour. Results show up here.</p>
      ) : (
        <ul className="list q-list">
          {shown.map((r) => (
            <Row key={r.id} r={r} open={open === r.id} onToggle={() => toggle(r)}
              parent={parentOf(r, pending)} onApproveParent={() => setStatus(parentOf(r, pending).id, 'approved')}>
              <button className="icon-btn" onClick={() => setStatus(r.id, 'dismissed')} aria-label="Dismiss" title="Dismiss"><X size={16} /></button>
            </Row>
          ))}
        </ul>
      )}
    </section>
  )
}
