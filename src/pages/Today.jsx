import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase.js'
import PageHeader from '../components/PageHeader.jsx'
import DumpBox from '../components/DumpBox.jsx'
import Approvals from '../components/Approvals.jsx'
import ItemRow, { loadRequests } from '../components/ItemRow.jsx'
import { fmtTime, greeting } from '../lib.js'
import { useUpcoming, dayLabel } from '../events.js'
import { useToReply, useJobsToApply, useHousingFits } from '../catchup.js'

const SHOWN = 3
const eur = (n) => new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

// One catch-up tile: a count, the top few, and a link into the page. Hidden when empty.
function Catch({ title, n, to, link = 'Open', children }) {
  if (!n) return null
  return (
    <section className="tile catch">
      <div className="tile-head">
        <h2>{title}</h2>
        <span className="catch-n">{n}</span>
      </div>
      <ul className="list">{children}</ul>
      {to && <Link to={to} className="link catch-link">{link}</Link>}
    </section>
  )
}
const kinds = [
  { k: 'goal', label: 'Goals' },
  { k: 'idea', label: 'Ideas' },
  { k: 'note', label: 'Notes' },
]

export default function Today() {
  const [tasks, setTasks] = useState([])
  const [allTasks, setAllTasks] = useState(false)
  const [kind, setKind] = useState('goal')
  const [items, setItems] = useState([])
  const [title, setTitle] = useState('')
  const [reqs, setReqs] = useState({})

  const loadTasks = useCallback(async () => {
    const t = await supabase.from('items').select('*').eq('kind', 'task').in('status', ['open', 'doing']).order('due_date', { ascending: true, nullsFirst: false })
    setTasks(t.data || [])
    const r = await loadRequests((t.data || []).map((x) => x.id))
    setReqs((x) => ({ ...x, ...r }))
  }, [])

  const loadItems = useCallback(async () => {
    const { data } = await supabase.from('items').select('*').eq('kind', kind).in('status', ['open', 'doing']).order('created_at', { ascending: false })
    setItems(data || [])
    const r = await loadRequests((data || []).map((x) => x.id))
    setReqs((x) => ({ ...x, ...r }))
  }, [kind])

  useEffect(() => { loadTasks() }, [loadTasks])
  useEffect(() => { loadItems() }, [loadItems])

  async function finish(item) {
    await supabase.from('items').update({ status: 'done' }).eq('id', item.id)
    setTasks((xs) => xs.filter((x) => x.id !== item.id))
    setItems((xs) => xs.filter((x) => x.id !== item.id))
  }

  async function add(e) {
    e.preventDefault()
    if (!title.trim()) return
    await supabase.from('items').insert({ kind, title: title.trim() })
    setTitle('')
    loadItems()
  }

  async function setProgress(i, v) {
    setItems((xs) => xs.map((x) => (x.id === i.id ? { ...x, progress: v } : x)))
    await supabase.from('items').update({ progress: v }).eq('id', i.id)
  }

  const { events: upcoming, reload: reloadEvents } = useUpcoming(7)
  const toReply = useToReply()
  const jobs = useJobsToApply()
  const flats = useHousingFits()
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  const shownTasks = allTasks ? tasks : tasks.slice(0, SHOWN)

  return (
    <div className="page">
      <PageHeader eyebrow={today} title={greeting()} />

      <div className="catch-grid">
        <Catch title="To reply" n={toReply.length} to="/email" link="Reply">
          {toReply.slice(0, SHOWN).map((t) => (
            <li key={t.id}>
              <Link to={`/email?open=${t.id}`} className="catch-row">
                <span className="clamp">{t.subject_en || t.subject}</span>
                <span className="meta clamp">{t.from}</span>
              </Link>
            </li>
          ))}
        </Catch>

        <Catch title="Tasks" n={tasks.length}>
          {shownTasks.map((t) => <ItemRow key={t.id} item={t} req={reqs[t.id]} onToggle={finish} noDate />)}
          {tasks.length > SHOWN && (
            <li><button className="mini" onClick={() => setAllTasks((a) => !a)}>{allTasks ? 'Show fewer' : `Show all ${tasks.length}`}</button></li>
          )}
        </Catch>

        <Catch title="This week" n={upcoming.length} to="/events" link="Events">
          {upcoming.slice(0, SHOWN).map((e) => (
            <li key={e.id} className="catch-row">
              <span className="clamp">{e.title}</span>
              <span className="meta">{dayLabel(e.start, true)}{!e.allDay && ` · ${fmtTime(e.start)}`}</span>
            </li>
          ))}
        </Catch>

        <Catch title="Jobs to apply for" n={jobs.length} to="/jobs" link="Jobs">
          {jobs.slice(0, SHOWN).map((j) => (
            <li key={j.slug}>
              <Link to={j.needs_you ? `/jobs?tab=tracker&open=${j.slug}` : `/jobs?view=list&open=${j.slug}`} className="catch-row">
                <span className="clamp">{j.role}</span>
                <span className="meta clamp">{j.needs_you ? 'Needs you' : [j.short || j.org?.split(' · ')[0], j.due_text].filter(Boolean).join(' · ')}</span>
              </Link>
            </li>
          ))}
        </Catch>

        <Catch title="Flats that fit" n={flats.length} to="/housing" link="Housing">
          {flats.slice(0, SHOWN).map((l) => (
            <li key={l.id}>
              <a href={l.url} target="_blank" rel="noreferrer" className="catch-row">
                <span className="clamp">{l.street || l.title}</span>
                <span className="meta clamp">{[eur(l.price), l.beds != null && `${l.beds} bed`, l.area].filter(Boolean).join(' · ')}</span>
              </a>
            </li>
          ))}
        </Catch>
      </div>

      <DumpBox onSaved={() => { loadTasks(); loadItems(); reloadEvents() }} />

      <Approvals />

      <section className="tile">
        <div className="tile-head">
          <div className="seg">
            {kinds.map((x) => (
              <button key={x.k} aria-pressed={kind === x.k} onClick={() => setKind(x.k)}>{x.label}</button>
            ))}
          </div>
        </div>
        <ul className="list">
          {items.map((i) => (
            <ItemRow key={i.id} item={i} req={reqs[i.id]} onToggle={finish}>
              {kind === 'goal' && (
                <input
                  type="range" min="0" max="100" step="10" className="progress"
                  value={i.progress ?? 0} onChange={(e) => setProgress(i, Number(e.target.value))}
                  aria-label="Progress"
                />
              )}
            </ItemRow>
          ))}
        </ul>
        {items.length === 0 && <p className="empty">Nothing here yet.</p>}
        <form className="row gap add-row" onSubmit={add}>
          <input className="grow plain" placeholder={`Add ${kind === 'idea' ? 'an idea' : `a ${kind}`}…`} value={title} onChange={(e) => setTitle(e.target.value)} />
          <button className="btn" disabled={!title.trim()}>Add</button>
        </form>
      </section>
    </div>
  )
}
