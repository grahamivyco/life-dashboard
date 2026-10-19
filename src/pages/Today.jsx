import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase.js'
import PageHeader from '../components/PageHeader.jsx'
import DumpBox from '../components/DumpBox.jsx'
import Approvals from '../components/Approvals.jsx'
import ItemRow, { loadRequests } from '../components/ItemRow.jsx'
import { greeting } from '../lib.js'
import { useUpcoming } from '../events.js'
import { useToReply, useJobsToApply, useHousingFits } from '../catchup.js'
import ViewMenu from '../components/ViewMenu.jsx'
import { Tabs } from '../components/Controls.jsx'
import { Target, Lightbulb, StickyNote } from 'lucide-react'

// A section tile: just the label and its number. Links into the page, or toggles a list.
function NumTile({ label, n, to, onClick, on }) {
  const body = <><span className="eyebrow">{label}</span><span className="big">{n}</span></>
  return to
    ? <Link to={to} className="tile stat num-tile">{body}</Link>
    : <button className={'tile stat num-tile' + (on ? ' on' : '')} onClick={onClick} aria-expanded={on}>{body}</button>
}
const kinds = [
  { k: 'goal', label: 'Goals', icon: Target },
  { k: 'idea', label: 'Ideas', icon: Lightbulb },
  { k: 'note', label: 'Notes', icon: StickyNote },
]

export default function Today() {
  const [tasks, setTasks] = useState([])
  const [showTasks, setShowTasks] = useState(false)
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

  return (
    <div className="page">
      <PageHeader eyebrow={today} title={greeting()} />

      <DumpBox onSaved={() => { loadTasks(); loadItems(); reloadEvents() }} />

      <div className="num-grid">
        <NumTile label="Emails" n={toReply.length} to="/email" />
        <NumTile label="Tasks" n={tasks.length} on={showTasks} onClick={() => setShowTasks((x) => !x)} />
        <NumTile label="This week" n={upcoming.length} to="/events" />
        <NumTile label="Jobs" n={jobs.length} to="/jobs" />
        <NumTile label="Flats" n={flats.length} to="/housing" />
      </div>

      {showTasks && (
        <section className="tile">
          <div className="tile-head"><h2>Tasks</h2></div>
          {tasks.length === 0
            ? <p className="empty">No open tasks. Brain dumps fill this list.</p>
            : <ul className="list">{tasks.map((t) => <ItemRow key={t.id} item={t} req={reqs[t.id]} onToggle={finish} />)}</ul>}
        </section>
      )}

      <Approvals />

      <section className="tile">
        <div className="tile-head">
          <span className="desk-only"><ViewMenu label="Show" options={kinds} value={kind} onPick={setKind} /></span>
          <h2 className="phone-only">{kinds.find((x) => x.k === kind).label}</h2>
        </div>
        <Tabs phoneOnly tabs={kinds} value={kind} onPick={setKind} />
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
