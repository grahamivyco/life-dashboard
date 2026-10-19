import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from './supabase.js'

// Badge counts for the nav: approvals waiting (claude) and emails in "To reply" (email).
export function useNavCounts() {
  const [counts, setCounts] = useState({ claude: 0, email: 0 })
  const location = useLocation()

  useEffect(() => {
    let alive = true
    const load = async () => {
      const [a, m, q] = await Promise.all([
        supabase.from('claude_requests').select('id', { count: 'exact', head: true }).eq('status', 'needs_approval'),
        supabase.from('section_snapshots').select('payload->threads').eq('section', 'email').order('synced_at', { ascending: false }).limit(1),
        supabase.from('claude_requests').select('note').eq('action', 'send_reply').in('status', ['approved', 'working']),
      ])
      // Email: emails waiting in "To reply" (same rule as the Email page), shown as a dot
      let skips = {}
      try { skips = JSON.parse(localStorage.getItem('email-skipped') || '{}') } catch { /* ignore */ }
      const queued = new Set((q.data || []).map((r) => r.note?.split('|')[0].slice(6)))
      const toReply = (m.data?.[0]?.threads || m.data?.[0]?.payload?.threads || []).filter((t) => t.replies?.length && !queued.has(t.id) && skips[t.id] !== t.date)
      if (alive) setCounts({ claude: a.count || 0, email: toReply.length })
    }
    load()
    const t = setInterval(load, 60000)
    return () => { alive = false; clearInterval(t) }
  }, [location.pathname])

  return counts
}
