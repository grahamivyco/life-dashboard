import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase.js'
import PageHeader from '../components/PageHeader.jsx'
import DumpBox from '../components/DumpBox.jsx'
import { fmtDay, fmtTime } from '../lib.js'

export default function BrainDump() {
  const [dumps, setDumps] = useState([])
  const [items, setItems] = useState({})

  const load = useCallback(async () => {
    const { data } = await supabase.from('brain_dumps').select('*').order('created_at', { ascending: false }).limit(50)
    setDumps(data || [])
    const ids = (data || []).map((d) => d.id)
    if (ids.length) {
      const { data: its } = await supabase.from('items').select('id,kind,title,dump_id').in('dump_id', ids)
      const by = {}
      for (const i of its || []) (by[i.dump_id] ||= []).push(i)
      setItems(by)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function remove(id) {
    await supabase.from('brain_dumps').delete().eq('id', id)
    setDumps((ds) => ds.filter((d) => d.id !== id))
  }

  return (
    <div className="page">
      <PageHeader eyebrow="Start or end of day" title="Brain dump" />
      <DumpBox onSaved={load} />

      <div className="stack">
        {dumps.map((d) => (
          <article key={d.id} className="tile dump">
            <div className="row between">
              <span className="meta">{fmtDay(d.created_at)} · {fmtTime(d.created_at)}</span>
              <span className="row gap">
                <span className={'pill' + (d.processed_at ? ' ok' : '')}>{d.processed_at ? 'Sorted' : 'Waiting for sync'}</span>
                <button className="mini" onClick={() => remove(d.id)}>Delete</button>
              </span>
            </div>
            <p className="dump-text">{d.content}</p>
            {items[d.id]?.length > 0 && (
              <ul className="chips">
                {items[d.id].map((i) => <li key={i.id} className="chip"><b>{i.kind}</b> {i.title}</li>)}
              </ul>
            )}
          </article>
        ))}
        {dumps.length === 0 && <p className="empty">Your first brain dump will show up here.</p>}
      </div>
    </div>
  )
}
