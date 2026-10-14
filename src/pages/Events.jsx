import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase.js'
import PageHeader from '../components/PageHeader.jsx'
import { dayKey, fmtDay, fmtTime } from '../lib.js'

const LEGACY = 'https://claude.ai/code/artifact/0b17e4d1-5ad4-439f-b8fe-d52ab783e7ac'

export default function Events() {
  const [events, setEvents] = useState([])
  const [form, setForm] = useState({ title: '', date: '', time: '', location: '' })
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    const start = new Date(); start.setHours(0, 0, 0, 0)
    const { data } = await supabase.from('events').select('*').gte('starts_at', start.toISOString()).order('starts_at').limit(100)
    setEvents(data || [])
  }, [])

  useEffect(() => { load() }, [load])

  async function add(e) {
    e.preventDefault()
    if (!form.title || !form.date) return
    const allDay = !form.time
    const starts = new Date(`${form.date}T${form.time || '00:00'}`)
    await supabase.from('events').insert({ title: form.title, starts_at: starts.toISOString(), all_day: allDay, location: form.location || null })
    setForm({ title: '', date: '', time: '', location: '' })
    setAdding(false)
    load()
  }

  async function remove(id) {
    await supabase.from('events').delete().eq('id', id)
    setEvents((xs) => xs.filter((x) => x.id !== id))
  }

  const groups = []
  for (const ev of events) {
    const k = dayKey(ev.starts_at)
    if (groups.at(-1)?.k !== k) groups.push({ k, at: ev.starts_at, items: [] })
    groups.at(-1).items.push(ev)
  }

  return (
    <div className="page">
      <PageHeader eyebrow="Synced with Google Calendar in Phase 4" title="Events">
        <a className="btn" href={LEGACY} target="_blank" rel="noreferrer">Open current tracker</a>
        <button className="btn primary" onClick={() => setAdding((a) => !a)}>{adding ? 'Cancel' : 'Add event'}</button>
      </PageHeader>

      {adding && (
        <form className="tile form-grid" onSubmit={add}>
          <label className="field span2"><span>Title</span><input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
          <label className="field"><span>Date</span><input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
          <label className="field"><span>Time</span><input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></label>
          <label className="field span2"><span>Location</span><input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></label>
          <div className="span2 row end"><button className="btn primary">Save event</button></div>
        </form>
      )}

      {groups.length === 0 && <p className="empty">No upcoming events yet.</p>}
      {groups.map((g) => (
        <section key={g.k} className="tl-day">
          <h2 className="tl-date">{fmtDay(g.at)}</h2>
          <div className="ev-grid">
            {g.items.map((ev) => (
              <article key={ev.id} className="tile ev-card">
                <span className="meta">{ev.all_day ? 'All day' : fmtTime(ev.starts_at)}</span>
                <span className="ev-title">{ev.title}</span>
                {ev.location && <span className="meta">{ev.location}</span>}
                <button className="mini" onClick={() => remove(ev.id)}>Remove</button>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
