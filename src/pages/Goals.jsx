import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase.js'
import PageHeader from '../components/PageHeader.jsx'
import { fmtDay } from '../lib.js'
import ClaudeStatus, { loadStatuses } from '../components/ClaudeStatus.jsx'

const kinds = [
  { k: 'task', label: 'Tasks' },
  { k: 'goal', label: 'Goals' },
  { k: 'idea', label: 'Ideas' },
  { k: 'note', label: 'Notes' },
]

export default function Goals() {
  const [kind, setKind] = useState('goal')
  const [showDone, setShowDone] = useState(false)
  const [items, setItems] = useState([])
  const [title, setTitle] = useState('')
  const [statuses, setStatuses] = useState({})

  const load = useCallback(async () => {
    let q = supabase.from('items').select('*').eq('kind', kind).order('created_at', { ascending: false })
    if (!showDone) q = q.in('status', ['open', 'doing'])
    const { data } = await q
    setItems(data || [])
    setStatuses(await loadStatuses(supabase, (data || []).map((i) => i.id)))
  }, [kind, showDone])

  useEffect(() => { load() }, [load])

  async function add(e) {
    e.preventDefault()
    if (!title.trim()) return
    await supabase.from('items').insert({ kind, title: title.trim() })
    setTitle('')
    load()
  }

  async function toggle(i) {
    await supabase.from('items').update({ status: i.status === 'done' ? 'open' : 'done' }).eq('id', i.id)
    load()
  }

  async function setProgress(i, v) {
    setItems((xs) => xs.map((x) => (x.id === i.id ? { ...x, progress: v } : x)))
    await supabase.from('items').update({ progress: v }).eq('id', i.id)
  }

  return (
    <div className="page">
      <PageHeader eyebrow="From your brain dumps" title="Goals & ideas">
        <div className="seg">
          {kinds.map((x) => (
            <button key={x.k} aria-pressed={kind === x.k} onClick={() => setKind(x.k)}>{x.label}</button>
          ))}
        </div>
      </PageHeader>

      <form className="tile row gap" onSubmit={add}>
        <input className="grow plain" placeholder={`Add a ${kind}…`} value={title} onChange={(e) => setTitle(e.target.value)} />
        <button className="btn primary" disabled={!title.trim()}>Add</button>
      </form>

      <section className="tile">
        <ul className="list">
          {items.map((i) => (
            <li key={i.id} className={'check-row' + (i.status === 'done' ? ' is-done' : '')}>
              <button className={'check' + (i.status === 'done' ? ' on' : '')} onClick={() => toggle(i)} aria-label="Toggle done" />
              <div className="grow col">
                <span>{i.title}</span>
                {i.body && <span className="meta">{i.body}</span>}
              </div>
              {kind === 'goal' && (
                <input
                  type="range" min="0" max="100" step="10" className="progress"
                  value={i.progress ?? 0} onChange={(e) => setProgress(i, Number(e.target.value))}
                  aria-label="Progress"
                />
              )}
              <ClaudeStatus status={statuses[i.id]} />
              {i.due_date && <span className="meta">{fmtDay(i.due_date)}</span>}
            </li>
          ))}
        </ul>
        {items.length === 0 && <p className="empty">Nothing here yet.</p>}
        <label className="row gap hint toggle">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Show done
        </label>
      </section>
    </div>
  )
}
