import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CalendarDays, Check, ChevronLeft, ChevronRight, Columns3, ExternalLink, Grid3x3, MapPin, Plus, Search, Square, Trash2, X } from 'lucide-react'
import PageHeader from '../components/PageHeader.jsx'
import { useEvents, toDate, CATS } from '../events.js'
import { useProfile } from '../profile.js'
import { ago, dayKey, fmtTime } from '../lib.js'
import ViewMenu from '../components/ViewMenu.jsx'
import { Controls, Empty, Tabs } from '../components/Controls.jsx'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
// One accent only: the main calendar gets tomato, the others stay in ink tones.
const DOTS = { Graham: 'd-main', 'Brain dump': 'd-main d-ring', 'Dance & Movement': 'd-ink', 'B & G Calendar': 'd-grey', 'Self-Care & Mental Wellness': 'd-ink d-ring' }
const LEGEND = [['Graham', 'Main'], ['Dance & Movement', 'Dance'], ['B & G Calendar', 'B & G'], ['Self-Care & Mental Wellness', 'Self-Care'], ['Brain dump', 'Added here']]

const day0 = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const monday = (d) => addDays(day0(d), -((new Date(d).getDay() + 6) % 7))
const diffDays = (d) => Math.round((day0(d) - day0(new Date())) / 864e5)
const relTag = (d) => ({ 0: 'Today', 1: 'Tomorrow' })[diffDays(d)]

function range(view, c) {
  if (view === 'day') return [day0(c), addDays(day0(c), 1)]
  if (view === 'week') return [monday(c), addDays(monday(c), 7)]
  return [new Date(c.getFullYear(), c.getMonth(), 1), new Date(c.getFullYear(), c.getMonth() + 1, 1)]
}

function rangeTitle(view, from, to) {
  if (view === 'day') return `${WEEKDAYS[from.getDay()]} ${from.getDate()} ${MONTHS[from.getMonth()]}`
  if (view === 'month') return `${MONTHS[from.getMonth()]} ${from.getFullYear()}`
  const last = addDays(to, -1)
  return from.getMonth() === last.getMonth()
    ? `${from.getDate()}–${last.getDate()} ${MONTHS[from.getMonth()]}`
    : `${from.getDate()} ${MONTHS[from.getMonth()].slice(0, 3)} – ${last.getDate()} ${MONTHS[last.getMonth()].slice(0, 3)}`
}

const span = (e) => (e.allDay ? 'All day' : e.end ? `${fmtTime(e.start)}–${fmtTime(e.end)}` : fmtTime(e.start))
const Dot = ({ cal }) => <span className={'cal-dot ' + (DOTS[cal] || 'd-grey')} />

function DayHead({ d }) {
  const tag = relTag(d)
  return (
    <div className="cal-dh">
      <span className="cal-dn">{d.getDate()}</span>
      <span className="cal-dm">{MONTHS[d.getMonth()]}</span>
      <span className="cal-wd">{WEEKDAYS[d.getDay()]}</span>
      {tag && <span className="cal-tag">{tag}</span>}
    </div>
  )
}

function Card({ e, open, onToggle, onRemove }) {
  return (
    <li className={'cal-card' + (e.routine ? ' routine' : '') + (open ? ' open' : '')}>
      <button className="cal-card-head" onClick={onToggle} aria-expanded={open}>
        <span className="cal-when"><Dot cal={e.calendar} />{span(e)}</span>
        <span className="cal-t">{e.title}</span>
        {e.location && !open && <span className="meta clamp">{e.location}</span>}
      </button>
      {open && (
        <div className="cal-more">
          {e.location && <span className="row gap"><MapPin size={13} className="muted-icon" />{e.location}</span>}
          {e.notes && <p className="ev-notes">{e.notes}</p>}
          <div className="row between">
            <span className="meta">{e.calendar}</span>
            <span className="row gap">
              {e.url && <a className="link row gap" href={e.url} target="_blank" rel="noreferrer">Open <ExternalLink size={12} /></a>}
              {e.source === 'app' && <button className="icon-btn" onClick={() => onRemove(e.id)} aria-label="Delete event"><Trash2 size={15} /></button>}
            </span>
          </div>
        </div>
      )}
    </li>
  )
}

function NextUp({ e }) {
  if (!e) return null
  const live = e.start <= new Date()
  const tag = live ? 'Now' : relTag(e.start)
  return (
    <section className="tile next-up">
      <span className="eyebrow">Next up</span>
      <h2 className="next-t">{e.title}</h2>
      <div className="next-meta">
        <Dot cal={e.calendar} />
        <span>{e.start.getDate()} {MONTHS[e.start.getMonth()]} · {WEEKDAYS[e.start.getDay()]} · {span(e)}</span>
        {tag && <span className="cal-tag">{tag}</span>}
      </div>
      {(e.location || e.url) && (
        <div className="row between wrap gap">
          {e.location ? <span className="row gap meta"><MapPin size={13} className="muted-icon" />{e.location}</span> : <span />}
          {e.url && <a className="link row gap" href={e.url} target="_blank" rel="noreferrer">See more <ExternalLink size={12} /></a>}
        </div>
      )}
    </section>
  )
}

function Month({ from, events, onPick }) {
  const start = monday(from)
  const end = addDays(monday(addDays(new Date(from.getFullYear(), from.getMonth() + 1, 1), -1)), 7)
  const byDay = {}
  for (const e of events) if (!e.routine) (byDay[dayKey(e.start)] ||= []).push(e)
  const cells = []
  for (let d = start; d < end; d = addDays(d, 1)) cells.push(d)
  return (
    <div className="tile month">
      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((w) => <span key={w} className="month-wd">{w}</span>)}
      {cells.map((d) => {
        const xs = byDay[dayKey(d)] || []
        const cls = 'month-cell' + (d.getMonth() !== from.getMonth() ? ' out' : '') + (diffDays(d) === 0 ? ' today' : '')
        return (
          <button key={+d} className={cls} onClick={() => onPick(d)}>
            <span className="month-n">{d.getDate()}</span>
            {xs.slice(0, 3).map((e) => <span key={e.id} className="month-ev"><Dot cal={e.calendar} /><span className="clamp">{e.title}</span></span>)}
            {xs.length > 3 && <span className="month-more">+{xs.length - 3} more</span>}
          </button>
        )
      })}
    </div>
  )
}

function Calendar({ all, remove }) {
  const [params, setParams] = useSearchParams()
  const view = params.get('view') || 'week'
  const [cursor, setCursor] = useState(() => new Date())
  const [open, setOpen] = useState(null)
  const setView = (v) => setParams((p) => { p.set('view', v); return p }, { replace: true })

  const [from, to] = range(view, cursor)
  const step = (n) => setCursor((c) => view === 'month' ? new Date(c.getFullYear(), c.getMonth() + n, 1) : addDays(c, n * (view === 'week' ? 7 : 1)))
  const inRange = all.filter((e) => e.start < to && (e.end || e.start) >= from)
  const isNow = new Date() >= from && new Date() < to

  const groups = []
  for (const e of inRange) {
    const at = e.start < from ? from : e.start
    const k = dayKey(at)
    if (groups.at(-1)?.k !== k) groups.push({ k, at: day0(at), items: [] })
    groups.at(-1).items.push(e)
  }

  return (
    <>
      <Controls end={<>
        {!isNow && <button className="btn" onClick={() => setCursor(new Date())}>Today</button>}
        <ViewMenu label="Period" options={[
          { k: 'day', label: 'Day', icon: <Square size={14} /> },
          { k: 'week', label: 'Week', icon: <Columns3 size={14} /> },
          { k: 'month', label: 'Month', icon: <Grid3x3 size={14} /> },
        ]} value={view} onPick={setView} />
      </>}>
        <div className="range-nav">
          <button className="icon-btn" onClick={() => step(-1)} aria-label="Previous"><ChevronLeft size={16} /></button>
          <h2 className="range-title">{rangeTitle(view, from, to)}</h2>
          <button className="icon-btn" onClick={() => step(1)} aria-label="Next"><ChevronRight size={16} /></button>
        </div>
      </Controls>

      {view === 'month' ? (
        <Month from={from} events={inRange} onPick={(d) => { setCursor(d); setView('day') }} />
      ) : groups.length === 0 ? (
        <Empty title={`Nothing planned ${view === 'day' ? 'this day' : 'this week'}.`}>Add an event or pick one from Explore.</Empty>
      ) : (
        groups.map((g) => (
          <section key={g.k} className="cal-day">
            <DayHead d={g.at} />
            <ul className="cal-cards">
              {g.items.map((e) => <Card key={e.id} e={e} open={open === e.id} onToggle={() => setOpen(open === e.id ? null : e.id)} onRemove={remove} />)}
            </ul>
          </section>
        ))
      )}

      <div className="legend">
        {LEGEND.map(([k, label]) => <span key={k} className="row gap meta"><Dot cal={k} />{label}</span>)}
      </div>
    </>
  )
}

const nextSlots = (p) => p.slots
  .map((s) => ({ start: toDate(s.start), end: toDate(s.end), allDay: !!s.all_day }))
  .filter((s) => s.end > new Date())

function Explore({ picks, city = 'Barcelona', all, add }) {
  const [q, setQ] = useState('')
  const [date, setDate] = useState('')
  const [cats, setCats] = useState([])
  // Start on the categories liked in Profile, until Graham changes the filter here
  const liked = useProfile()?.events?.cats
  const touched = useRef(false)
  useEffect(() => { if (!touched.current && liked?.length) setCats(liked) }, [liked])
  const [busy, setBusy] = useState(null)

  const needle = q.trim().toLowerCase()
  const day = date ? toDate(date) : null
  const rows = picks
    .map((p) => {
      let slots = nextSlots(p)
      if (day) slots = slots.filter((s) => s.start < addDays(day, 1) && s.end > day)
      return { ...p, slot: slots[0] }
    })
    .filter((p) => p.slot)
    .filter((p) => !cats.length || p.cats?.some((c) => cats.includes(c)))
    .filter((p) => !needle || [p.title, p.note, p.where, ...(p.cats || []).map((c) => CATS[c])].join(' ').toLowerCase().includes(needle))
    .sort((a, b) => a.slot.start - b.slot.start)

  const used = [...new Set([...picks.flatMap((p) => p.cats || []), ...cats])].filter((c) => CATS[c])
  const added = (p) => all.some((e) => e.title.trim().toLowerCase() === p.title.trim().toLowerCase() && Math.abs(e.start - p.slot.start) < 60e3)
  const toggle = (c) => { touched.current = true; setCats((xs) => (xs.includes(c) ? xs.filter((x) => x !== c) : [...xs, c])) }

  async function addPick(p) {
    setBusy(p.id)
    await add({ title: p.title, starts_at: p.slot.start.toISOString(), ends_at: p.slot.end.toISOString(), all_day: p.slot.allDay, location: p.where || null, notes: [p.note, p.url].filter(Boolean).join('\n') })
    setBusy(null)
  }

  const web = encodeURIComponent(q.trim() || 'events')
  return (
    <>
      <form className="tile ex-search" onSubmit={(e) => e.preventDefault()}>
        <label className="ex-q">
          <Search size={15} className="muted-icon" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search events: salsa, brunch, run club" aria-label="Search events" />
          {q && <button type="button" className="icon-btn" onClick={() => setQ('')} aria-label="Clear"><X size={14} /></button>}
        </label>
        <input type="date" className="ex-date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
      </form>

      <div className="chips ex-cats">
        {used.map((c) => <button key={c} className="chip" aria-pressed={cats.includes(c)} onClick={() => toggle(c)}>{CATS[c]}</button>)}
        {(cats.length > 0 || date) && <button className="link" onClick={() => { touched.current = true; setCats([]); setDate('') }}>Clear filters</button>}
      </div>

      {rows.length === 0 ? (
        <Empty title={picks.length ? 'No picks match.' : 'No picks yet.'}>{picks.length ? 'Try the web links below.' : 'The weekly scout adds them.'}</Empty>
      ) : (
        <ul className="tile list picks">
          {rows.map((p) => {
            const done = added(p)
            const s = p.slot
            return (
              <li key={p.id} className="pick">
                <div className="pick-date">
                  <span className="pick-n">{s.start.getDate()}</span>
                  <span className="meta">{MONTHS[s.start.getMonth()].slice(0, 3)}</span>
                </div>
                <div className="pick-body">
                  <a className="pick-t" href={p.url} target="_blank" rel="noreferrer">{p.title}</a>
                  <span className="meta">
                    {WEEKDAYS[s.start.getDay()].slice(0, 3)} · {s.allDay ? 'All day' : fmtTime(s.start)}
                    {p.weekly && ` · ${p.weekly}`}
                    {p.where && ` · ${p.where}`}
                  </span>
                  {p.note && <p className="pick-note">{p.note}</p>}
                  <div className="pick-tags">
                    {(p.cats || []).filter((c) => CATS[c]).map((c) => <span key={c} className="chip">{CATS[c]}</span>)}
                    {p.price && <span className="meta">{p.price}</span>}
                  </div>
                </div>
                <button className={'icon-btn' + (done ? ' on' : '')} disabled={done || busy === p.id} onClick={() => addPick(p)} aria-label={done ? 'In your calendar' : 'Add to calendar'} title={done ? 'In your calendar' : 'Add to calendar'}>
                  {done ? <Check size={16} /> : <Plus size={16} />}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <section className="tile ex-web">
        <span className="meta">{q.trim() ? `Search “${q.trim()}” in ${city}` : `More in ${city}`}</span>
        <div className="row gap wrap">
          <a className="btn sm" href={`https://www.google.com/search?q=${web}+${city}`} target="_blank" rel="noreferrer">Google <ExternalLink size={12} /></a>
          <a className="btn sm" href="https://oazis.app/en/whats-on/barcelona/lgbtq" target="_blank" rel="noreferrer">Oazis <ExternalLink size={12} /></a>
          <a className="btn sm" href={`https://www.meetup.com/find/?keywords=${web}&location=es--${city}`} target="_blank" rel="noreferrer">Meetup <ExternalLink size={12} /></a>
          <a className="btn sm" href={`https://www.eventbrite.es/d/spain--${city.toLowerCase()}/${web}/`} target="_blank" rel="noreferrer">Eventbrite <ExternalLink size={12} /></a>
        </div>
      </section>
    </>
  )
}

export default function Events() {
  const { all, picks, picksCity, syncedAt, remove, add } = useEvents()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'explore' ? 'explore' : 'calendar'
  const setTab = (t) => setParams((p) => { p.set('tab', t); return p }, { replace: true })
  const [form, setForm] = useState({ title: '', date: '', time: '', location: '' })
  const [adding, setAdding] = useState(false)

  const now = new Date()
  const next = all.find((e) => !e.routine && (e.end || e.start) > now && !(e.allDay && e.start < day0(now)))

  async function save(e) {
    e.preventDefault()
    if (!form.title || !form.date) return
    const starts = new Date(`${form.date}T${form.time || '00:00'}`)
    await add({ title: form.title, starts_at: starts.toISOString(), all_day: !form.time, location: form.location || null })
    setForm({ title: '', date: '', time: '', location: '' })
    setAdding(false)
  }

  return (
    <div className="page">
      <PageHeader eyebrow={syncedAt ? `Google Calendar · updated ${ago(syncedAt)}` : 'Google Calendar syncs hourly'} title="Events" />

      <Controls end={<button className={'btn' + (adding ? '' : ' primary')} onClick={() => setAdding((a) => !a)}>{adding ? 'Cancel' : <><Plus size={14} /> Add event</>}</button>}>
        <Tabs tabs={[{ k: 'calendar', label: 'Calendar' }, { k: 'explore', label: 'Explore' }]} value={tab} onPick={setTab} />
      </Controls>

      {adding && (
        <form className="tile form-grid" onSubmit={save}>
          <label className="field span2"><span>Title</span><input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
          <label className="field"><span>Date</span><input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
          <label className="field"><span>Time</span><input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></label>
          <label className="field span2"><span>Location</span><input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></label>
          <div className="span2 row end"><button className="btn primary">Save event</button></div>
        </form>
      )}

      {tab === 'calendar' ? (
        <>
          <NextUp e={next} />
          <Calendar all={all} remove={remove} />
        </>
      ) : (
        <Explore picks={picks} city={picksCity} all={all} add={add} />
      )}
    </div>
  )
}
