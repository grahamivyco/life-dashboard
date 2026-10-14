import { useEffect, useState } from 'react'
import { ChevronRight, ExternalLink, Sparkles } from 'lucide-react'
import { supabase } from '../supabase.js'
import PageHeader from '../components/PageHeader.jsx'
import { ago, fmtTime, fmtDay } from '../lib.js'

const filters = [
  { k: 'all', label: 'All' },
  { k: 'unread', label: 'Unread' },
  { k: 'important', label: 'Important' },
]

const when = (d) => {
  const x = new Date(d)
  return x.toDateString() === new Date().toDateString() ? fmtTime(d) : fmtDay(d)
}

export default function Inbox() {
  const [snap, setSnap] = useState(null)
  const [filter, setFilter] = useState('all')
  const [open, setOpen] = useState(null)
  const [asked, setAsked] = useState({})

  useEffect(() => {
    supabase.from('section_snapshots').select('*').eq('section', 'email').order('synced_at', { ascending: false }).limit(1)
      .then(({ data }) => setSnap(data?.[0] || null))
    supabase.from('claude_requests').select('note').is('item_id', null).like('note', 'email:%')
      .then(({ data }) => {
        const m = {}
        for (const r of data || []) m[r.note.split('|')[0].slice(6)] = true
        setAsked(m)
      })
  }, [])

  async function draftReply(t) {
    setAsked((a) => ({ ...a, [t.id]: true }))
    await supabase.from('claude_requests').insert({
      action: 'draft',
      note: `email:${t.id}| Draft a reply to "${t.subject}" from ${t.from}`,
    })
  }

  const threads = (snap?.payload?.threads || []).filter((t) =>
    filter === 'unread' ? t.unread : filter === 'important' ? t.important : true
  )

  return (
    <div className="page">
      <PageHeader eyebrow={snap ? `Gmail · synced ${ago(snap.synced_at)}` : 'Gmail'} title="Inbox">
        <div className="seg">
          {filters.map((f) => (
            <button key={f.k} aria-pressed={filter === f.k} onClick={() => setFilter(f.k)}>{f.label}</button>
          ))}
        </div>
        <a className="btn" href="https://mail.google.com/mail/u/0/#inbox" target="_blank" rel="noreferrer">Open Gmail</a>
      </PageHeader>

      {!snap && <p className="empty">Your inbox appears here after the next sync.</p>}

      <ul className="tile list mail-list">
        {threads.map((t) => {
          const isOpen = open === t.id
          return (
            <li key={t.id} className={'mail' + (t.unread ? ' unread-row' : '') + (isOpen ? ' open' : '')}>
              <button className="mail-head" onClick={() => setOpen(isOpen ? null : t.id)} aria-expanded={isOpen}>
                <ChevronRight size={15} className="chev" />
                <span className="mail-from clamp">{t.from}{t.count > 1 && <span className="meta"> {t.count}</span>}</span>
                <span className="mail-subject grow clamp">{t.subject}</span>
                <span className="meta">{when(t.date)}</span>
              </button>
              {isOpen && (
                <div className="mail-body">
                  <p>{t.snippet}</p>
                  <div className="row gap">
                    <a className="btn" href={t.url} target="_blank" rel="noreferrer">Open in Gmail <ExternalLink size={12} /></a>
                    <button className="btn" onClick={() => draftReply(t)} disabled={asked[t.id]}>
                      <Sparkles size={13} /> {asked[t.id] ? 'Claude is drafting' : 'Draft reply with Claude'}
                    </button>
                  </div>
                </div>
              )}
            </li>
          )
        })}
        {snap && threads.length === 0 && <li className="empty">Nothing here.</li>}
      </ul>
    </div>
  )
}
