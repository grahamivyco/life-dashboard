import { Link } from 'react-router-dom'

const text = {
  queued: 'Claude: queued',
  working: 'Claude: working',
  needs_approval: 'Needs you',
  approved: 'Claude: running',
  done: 'Claude: done',
  failed: 'Claude: stuck',
}

// Small pill showing where Claude is on an item. Links to the Inbox.
export default function ClaudeStatus({ status }) {
  if (!status || status === 'dismissed') return null
  return (
    <Link to="/" className={'pill claude ' + status}>
      <span className="spark">✦</span>{text[status]}
    </Link>
  )
}

// Latest request status per item id
export async function loadStatuses(supabase, ids) {
  if (!ids.length) return {}
  const { data } = await supabase.from('claude_requests').select('item_id,status,updated_at').in('item_id', ids).order('updated_at', { ascending: true })
  const out = {}
  for (const r of data || []) out[r.item_id] = r.status
  return out
}
