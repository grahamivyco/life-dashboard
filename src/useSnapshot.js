import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'

// Newest snapshot for a section. Updates live when a sync writes a new row,
// and re-reads when the app comes back to the foreground.
export function useSnapshot(section) {
  const [snap, setSnap] = useState(null)

  useEffect(() => {
    let alive = true
    const load = () =>
      supabase.from('section_snapshots').select('*').eq('section', section).order('synced_at', { ascending: false }).limit(1)
        .then(({ data }) => { if (alive && data?.[0]) setSnap(data[0]) })

    load()
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)

    const channel = supabase
      .channel(`snapshots-${section}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'section_snapshots', filter: `section=eq.${section}` },
        ({ new: row }) => { if (alive) setSnap((cur) => (!cur || row.synced_at >= cur.synced_at ? row : cur)) })
      .subscribe()

    return () => {
      alive = false
      document.removeEventListener('visibilitychange', onVisible)
      supabase.removeChannel(channel)
    }
  }, [section])

  return snap
}
