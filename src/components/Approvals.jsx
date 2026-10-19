import { useCallback, useEffect, useState } from 'react'
import { Check, X } from 'lucide-react'
import { supabase } from '../supabase.js'
import { Links } from './ItemRow.jsx'

// Anything Claude needs your OK on. Only shows when something is waiting,
// and each one clears as soon as you approve or dismiss it.
export default function Approvals() {
  const [reqs, setReqs] = useState([])
  const [open, setOpen] = useState(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from('claude_requests').select('*, item:items(title, kind)')
      .eq('status', 'needs_approval').order('updated_at', { ascending: false })
    setReqs(data || [])
  }, [])

  useEffect(() => { load() }, [load])

  async function setStatus(id, status) {
    setReqs((xs) => xs.filter((x) => x.id !== id))
    await supabase.from('claude_requests').update({ status }).eq('id', id)
  }

  if (!reqs.length) return null

  return (
    <section className="tile">
      <div className="tile-head"><h2>Needs your OK</h2><span className="meta needs">{reqs.length}</span></div>
      <ul className="list">
        {reqs.map((r) => (
          <li key={r.id} className="item-row">
            <div className="check-row ok-row">
              <button className="ok-title grow" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}>
                <span>{r.item?.title || r.note || 'Request'}</span>
                {(r.approval_ask || r.summary) && <span className="meta">{r.approval_ask || r.summary}</span>}
              </button>
              <button className="btn primary sm" onClick={() => setStatus(r.id, 'approved')}><Check size={13} /> Approve</button>
              <button className="icon-btn" onClick={() => setStatus(r.id, 'dismissed')} aria-label="Dismiss" title="Dismiss"><X size={15} /></button>
            </div>
            {open === r.id && (
              <div className="result flush">
                {r.summary && r.approval_ask && <p><b>{r.summary}</b></p>}
                {r.result && <p className="dump-text">{r.result}</p>}
                <Links links={r.links} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
