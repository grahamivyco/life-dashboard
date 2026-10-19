import { useState } from 'react'
import { X, ExternalLink } from 'lucide-react'
import { supabase } from '../supabase.js'
import { fmtDay } from '../lib.js'

export function Links({ links }) {
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
      {rest.length > 0 && (
        <ul className="links">
          {rest.map((l, i) => (
            <li key={i}><a href={l.url} target="_blank" rel="noreferrer">{l.title || l.url}<ExternalLink size={12} /></a></li>
          ))}
        </ul>
      )}
    </>
  )
}

// Latest Claude request per item id
export async function loadRequests(ids) {
  if (!ids.length) return {}
  const { data } = await supabase.from('claude_requests').select('*').in('item_id', ids).order('updated_at', { ascending: true })
  const out = {}
  for (const r of data || []) out[r.item_id] = r
  return out
}

// Only new results and stuck work get a pill. Once you've opened a result it goes away.
const pillText = (r) => (!r ? null : r.status === 'done' && !r.seen_at ? 'Claude: done' : r.status === 'failed' ? 'Claude: stuck' : null)

// A task, goal or idea. If Claude has a new result for it, tap the pill to read it.
export default function ItemRow({ item, req, onToggle, children }) {
  const [open, setOpen] = useState(false)
  const [hidden, setHidden] = useState(false)
  const r = req
  const pill = !hidden && pillText(r)
  const done = item.status === 'done'

  async function openResult() {
    setOpen(true)
    if (r.status === 'done' && !r.seen_at) await supabase.from('claude_requests').update({ seen_at: new Date().toISOString() }).eq('id', r.id)
  }

  function close() {
    setOpen(false)
    if (r.status === 'done') setHidden(true)
  }

  async function dismiss() {
    setOpen(false); setHidden(true)
    await supabase.from('claude_requests').update({ status: 'dismissed' }).eq('id', r.id)
  }

  return (
    <li className={'item-row' + (done ? ' is-done' : '')}>
      <div className="check-row">
        <button className={'check' + (done ? ' on' : '')} onClick={() => onToggle(item)} aria-label={`Mark ${item.title} ${done ? 'not done' : 'done'}`} />
        <div className="grow col">
          <span>{item.title}</span>
          {item.body && <span className="meta">{item.body}</span>}
        </div>
        {children}
        {pill && !open && <button className={'pill claude ' + r.status} onClick={openResult}><span className="spark">✦</span>{pill}</button>}
        {item.due_date && <span className="meta">{fmtDay(item.due_date)}</span>}
      </div>
      {open && (
        <div className="result">
          {r.summary && <p><b>{r.summary}</b></p>}
          {r.result && <p className="dump-text">{r.result}</p>}
          <Links links={r.links} />
          <div className="row gap">
            <button className="mini" onClick={close}>Close</button>
            <button className="icon-btn" onClick={dismiss} aria-label="Dismiss" title="Dismiss"><X size={15} /></button>
          </div>
        </div>
      )}
    </li>
  )
}
