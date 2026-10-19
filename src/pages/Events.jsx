import { useState } from 'react'
import { ChevronRight, ExternalLink, MapPin, Repeat, Trash2 } from 'lucide-react'
import { supabase } from '../supabase.js'
import PageHeader from '../components/PageHeader.jsx'
import { useUpcoming, dayLabel } from '../events.js'
import { ago, fmtTime } from '../lib.js'

const ranges = [{ d: 7, label: '7 days' }, { d: 30, label: '30 days' }]

const timeOf = (e) => (e.allDay ? 'All day' : fmtTime(e.start))

function EventRow({ e, open, onToggle, onRemove }) {
  const hasMore = e.location || e.notes || e.url || e.end || e.source === 'app'
  return (
    <li className={'ev' + (open ? ' open' : '')}>
      <button className="ev-head" onClick={onToggle} aria-expanded={open} disabled={!hasMore}>
        <ChevronRight size={15} className="chev" />
        <span className="ev-time meta">{timeOf(e)}</span>
        <span className="ev-title grow clamp">{e.title}</span>
        {e.location && <span className="ev-loc meta clamp">{e.location}</span>}
      </button>
      {open && (
        <div className="ev-body">
          {!e.allDay && e.end && <span className="meta">{fmtTime(e.start)} to {fmtTime(e.end)}</span>}
          {e.location && <span className="row gap"><MapPin size={13} className="muted-icon" />{e.location}</span>}
          {e.notes && <p className="ev-notes">{e.notes}</p>}
          <div className="row between">
            <span className="meta">{e.calendar}</span>
            <span className="row gap">
              {e.url && <a className="link row gap" href={e.url} target="_blank" rel="noreferrer">Google Calendar <ExternalLink size={12} /></a>}
              {e.source === 'app' && <button className="icon-btn" onClick={() => onRemove(e.id)} aria-label="Delete event"><Trash2 size={15} /></button>}
            </span>
          </div>
        </div>
      )}
    </li>
  )
}

export default function Events() {
  const [days, setDays] = useState(30)
  const { groups, routines, syncedAt, reload, remove } = useUpcoming(days)
  const [open, setOpen] = useState(null)
  const [form, setForm] = useState({ title: '', date: '', time: '', location: '' })
  const [adding, setAdding] = useState(false)

  async function add(e) {
    e.preventDefault()
    if (!form.title || !form.date) return
    const starts = new Date(`${form.date}T${form.time || '00:00'}`)
    await supabase.from('events').insert({ title: form.title, starts_at: starts.toISOString(), all_day: !form.time, location: form.location || null })
    setForm({ title: '', date: '', time: '', location: '' })
    setAdding(false)
    reload()
  }

  return (
    <div className="page">
      <PageHeader eyebrow={syncedAt ? `Google Calendar · updated ${ago(syncedAt)}` : 'Google Calendar syncs hourly'} title="Events">
        <button className={'btn' + (adding ? '' : ' primary')} onClick={() => setAdding((a) => !a)}>{adding ? 'Cancel' : 'Add event'}</button>
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

      <div className="row between wrap">
        <div className="seg">
          {ranges.map((r) => <button key={r.d} aria-pressed={days === r.d} onClick={() => setDays(r.d)}>Next {r.label}</button>)}
        </div>
        {routines.length > 0 && (
          <div className="routines">
            <Repeat size={13} className="muted-icon" />
            {routines.map((r) => <span key={r.id} className="chip">{r.title} <span className="meta">{r.when}{!r.first.allDay && ` ${fmtTime(r.first.start)}`}</span></span>)}
          </div>
        )}
      </div>

      {groups.length === 0 && <p className="empty">Nothing coming up. Events from Google Calendar and your brain dumps show here.</p>}
      {groups.map((g) => (
        <section key={g.k} className="tile ev-day">
          <h2 className="ev-date">{dayLabel(g.at)}</h2>
          <ul className="list ev-list">
            {g.items.map((e) => (
              <EventRow key={e.id} e={e} open={open === e.id} onToggle={() => setOpen(open === e.id ? null : e.id)} onRemove={remove} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
