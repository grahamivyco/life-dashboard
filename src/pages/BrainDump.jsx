import { useCallback, useEffect, useState } from 'react'
import { ChevronRight, Trash2 } from 'lucide-react'
import { supabase } from '../supabase.js'
import PageHeader from '../components/PageHeader.jsx'
import DumpBox from '../components/DumpBox.jsx'
import { fmtDay, fmtTime } from '../lib.js'

export default function BrainDump() {
  const [dumps, setDumps] = useState([])
  const [items, setItems] = useState({})
  const [open, setOpen] = useState(null)

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
        {dumps.map((d) => {
          const isOpen = open === d.id
          return (
            <article key={d.id} className={'tile dump' + (isOpen ? ' open' : '')}>
              <div className="dump-head">
                <button className="dump-toggle" onClick={() => setOpen(isOpen ? null : d.id)} aria-expanded={isOpen}>
                  <ChevronRight size={15} className="chev" />
                  <span>{fmtDay(d.created_at)}</span>
                  <span className="meta">{fmtTime(d.created_at)}</span>
                </button>
                <button className="icon-btn" onClick={() => remove(d.id)} aria-label="Delete brain dump" title="Delete">
                  <Trash2 size={15} strokeWidth={1.75} />
                </button>
              </div>
              {isOpen && (
                <div className="dump-body">
                  <p className="dump-text">{d.content}</p>
                  {items[d.id]?.length > 0 && (
                    <ul className="chips">
                      {items[d.id].map((i) => <li key={i.id} className="chip"><b>{i.kind}</b> {i.title}</li>)}
                    </ul>
                  )}
                  <span className="hint">{d.processed_at ? 'Sorted' : 'Waiting for sync'}</span>
                </div>
              )}
            </article>
          )
        })}
        {dumps.length === 0 && <p className="empty">Your first brain dump will show up here.</p>}
      </div>
    </div>
  )
}
