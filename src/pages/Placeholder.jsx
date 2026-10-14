import { useEffect, useState } from 'react'
import { supabase } from '../supabase.js'
import PageHeader from '../components/PageHeader.jsx'
import { ago } from '../lib.js'

// Sections that still live in their own dashboards. They move in during Phase 4.
export default function Placeholder({ section }) {
  const key = section.path.slice(1)
  const [snap, setSnap] = useState(null)

  useEffect(() => {
    supabase.from('section_snapshots').select('*').eq('section', key).order('synced_at', { ascending: false }).limit(1)
      .then(({ data }) => setSnap(data?.[0] || null))
  }, [key])

  const Icon = section.icon
  return (
    <div className="page">
      <PageHeader eyebrow={snap ? `Synced ${ago(snap.synced_at)}` : 'Moving in soon'} title={section.label}>
        <a className="btn" href={section.legacy} target="_blank" rel="noreferrer">Open current dashboard</a>
      </PageHeader>
      <section className="tile placeholder">
        <Icon size={22} strokeWidth={1.5} />
        <p>Your {section.label.toLowerCase()} dashboard moves in here next. Until then it opens in Claude.</p>
      </section>
    </div>
  )
}
