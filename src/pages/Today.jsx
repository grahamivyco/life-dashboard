import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase.js'
import PageHeader from '../components/PageHeader.jsx'
import DumpBox from '../components/DumpBox.jsx'
import { fmtTime, fmtDay, greeting, ago } from '../lib.js'
import ClaudeStatus, { loadStatuses } from '../components/ClaudeStatus.jsx'
import ClaudeQueue from '../components/ClaudeQueue.jsx'

export default function Today() {
  const [tasks, setTasks] = useState([])
  const [events, setEvents] = useState([])
  const [syncs, setSyncs] = useState([])
  const [statuses, setStatuses] = useState({})

  const load = useCallback(async () => {
    const start = new Date(); start.setHours(0, 0, 0, 0)
    const end = new Date(start); end.setDate(end.getDate() + 7)
    const [t, e, s] = await Promise.all([
      supabase.from('items').select('*').eq('kind', 'task').in('status', ['open', 'doing']).order('due_date', { ascending: true, nullsFirst: false }).limit(12),
      supabase.from('events').select('*').gte('starts_at', start.toISOString()).lt('starts_at', end.toISOString()).order('starts_at').limit(8),
      supabase.from('section_snapshots').select('section,synced_at').order('synced_at', { ascending: false }).limit(30),
    ])
    setTasks(t.data || [])
    setStatuses(await loadStatuses(supabase, (t.data || []).map((x) => x.id)))
    setEvents(e.data || [])
    const latest = {}
    for (const r of s.data || []) if (!latest[r.section]) latest[r.section] = r.synced_at
    setSyncs(Object.entries(latest))
  }, [])

  useEffect(() => { load() }, [load])

  async function done(id) {
    await supabase.from('items').update({ status: 'done' }).eq('id', id)
    setTasks((ts) => ts.filter((t) => t.id !== id))
  }

  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="page">
      <PageHeader eyebrow={today} title={greeting()} />

      <DumpBox compact onSaved={load} />

      <ClaudeQueue />

      <div className="grid two">
        <section className="tile">
          <div className="tile-head"><h2>Tasks</h2><Link to="/goals" className="link">All</Link></div>
          {tasks.length === 0 ? (
            <p className="empty">No open tasks. Brain dumps fill this list.</p>
          ) : (
            <ul className="list">
              {tasks.map((t) => (
                <li key={t.id} className="check-row">
                  <button className="check" onClick={() => done(t.id)} aria-label={`Mark ${t.title} done`} />
                  <span className="grow">{t.title}</span>
                  <ClaudeStatus status={statuses[t.id]} />
                  {t.due_date && <span className="meta">{fmtDay(t.due_date)}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="tile">
          <div className="tile-head"><h2>This week</h2><Link to="/events" className="link">Events</Link></div>
          {events.length === 0 ? (
            <p className="empty">Nothing scheduled in the next 7 days.</p>
          ) : (
            <ul className="list">
              {events.map((e) => (
                <li key={e.id} className="ev-row">
                  <span className="meta when">{fmtDay(e.starts_at)}{!e.all_day && ` · ${fmtTime(e.starts_at)}`}</span>
                  <span className="grow">{e.title}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="tile">
        <div className="tile-head"><h2>Sync</h2></div>
        {syncs.length === 0 ? (
          <p className="empty">Finances, jobs, email, clients and housing appear here once the scheduled sync runs.</p>
        ) : (
          <ul className="sync-list">
            {syncs.map(([sec, at]) => (
              <li key={sec}><span className="dot" />{sec}<span className="meta">{ago(at)}</span></li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
