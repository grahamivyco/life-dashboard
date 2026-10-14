import { useEffect, useState } from 'react'
import { supabase } from '../supabase.js'
import PageHeader from '../components/PageHeader.jsx'
import { dayKey, fmtDay, fmtTime } from '../lib.js'

// Scroll back through your life day by day: brain dumps, events and finished items.
export default function Timeline() {
  const [days, setDays] = useState([])

  useEffect(() => {
    (async () => {
      const since = new Date(); since.setDate(since.getDate() - 60)
      const iso = since.toISOString()
      const [d, e, i] = await Promise.all([
        supabase.from('brain_dumps').select('id,content,created_at').gte('created_at', iso),
        supabase.from('events').select('id,title,starts_at').gte('starts_at', iso).lte('starts_at', new Date().toISOString()),
        supabase.from('items').select('id,kind,title,updated_at').eq('status', 'done').gte('updated_at', iso),
      ])
      const all = [
        ...(d.data || []).map((x) => ({ id: x.id, at: x.created_at, type: 'Brain dump', text: x.content })),
        ...(e.data || []).map((x) => ({ id: x.id, at: x.starts_at, type: 'Event', text: x.title })),
        ...(i.data || []).map((x) => ({ id: x.id, at: x.updated_at, type: `Done · ${x.kind}`, text: x.title })),
      ].sort((a, b) => new Date(b.at) - new Date(a.at))
      const groups = []
      for (const x of all) {
        const k = dayKey(x.at)
        if (groups.at(-1)?.k !== k) groups.push({ k, at: x.at, items: [] })
        groups.at(-1).items.push(x)
      }
      setDays(groups)
    })()
  }, [])

  return (
    <div className="page">
      <PageHeader eyebrow="Last 60 days" title="Timeline" />
      {days.length === 0 && <p className="empty">Your days fill in as you add brain dumps and events.</p>}
      <div className="timeline">
        {days.map((g) => (
          <section key={g.k} className="tl-day">
            <h2 className="tl-date">{fmtDay(g.at)}</h2>
            <ul className="list">
              {g.items.map((x) => (
                <li key={x.type + x.id} className="tl-row">
                  <span className="meta when">{fmtTime(x.at)}</span>
                  <span className="pill">{x.type}</span>
                  <span className="grow clamp">{x.text}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
