import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase.js'
import PageHeader from '../components/PageHeader.jsx'
import DumpBox from '../components/DumpBox.jsx'
import Approvals from '../components/Approvals.jsx'
import ItemRow, { loadRequests } from '../components/ItemRow.jsx'
import { fmtTime, greeting } from '../lib.js'
import { useUpcoming, dayLabel } from '../events.js'

const TASKS_SHOWN = 8
const WEEK_SHOWN = 8
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
  const events = upcoming.slice(0, WEEK_SHOWN)
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  const shownTasks = allTasks ? tasks : tasks.slice(0, TASKS_SHOWN)

  return (
    <div className="page">
      <PageHeader eyebrow={today} title={greeting()} />

      <DumpBox onSaved={() => { loadTasks(); loadItems(); reloadEvents() }} />

      <Approvals />

      <div className="grid two">
        <section className="tile">
          <div className="tile-head"><h2>Tasks</h2><span className="meta">{tasks.length || ''}</span></div>
          {tasks.length === 0 ? (
            <p className="empty">No open tasks. Brain dumps fill this list.</p>
          ) : (
            <ul className="list">
              {shownTasks.map((t) => <ItemRow key={t.id} item={t} req={reqs[t.id]} onToggle={finish} />)}
            </ul>
          )}
          {tasks.length > TASKS_SHOWN && (
            <button className="mini more" onClick={() => setAllTasks((a) => !a)}>{allTasks ? 'Show fewer' : `Show all ${tasks.length}`}</button>
          )}
        </section>

        <section className="tile">
          <div className="tile-head"><h2>This week</h2><Link to="/events" className="link">Events</Link></div>
          {events.length === 0 ? (
            <p className="empty">Nothing scheduled in the next 7 days.</p>
          ) : (
            <ul className="list week-list">
              {events.map((e) => (
                <li key={e.id}>
                  <span className="meta when">{dayLabel(e.start, true)}{!e.allDay && ` · ${fmtTime(e.start)}`}</span>
                  <span className="grow clamp">{e.title}</span>
                </li>
              ))}
            </ul>
          )}
          {upcoming.length > WEEK_SHOWN && <Link to="/events" className="mini more">{upcoming.length - WEEK_SHOWN} more this week</Link>}
        </section>
      </div>

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
