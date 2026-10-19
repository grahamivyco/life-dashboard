import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase.js'

// Finances come from the money app on Graham's Mac (mac/money). It publishes every report into
// money_snapshot, and carries out edits queued here in money_actions (same paths as its local API).

const demo = import.meta.env.MODE === 'demo'

export const usd = (n, d = 0) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: d, minimumFractionDigits: d }).format(n || 0)

// Money out is positive in the money app. Show it plainly, and money in with a plus.
export const amt = (n, d = 2) => (n < 0 ? '+' : '') + usd(Math.abs(n), d)

export function useMoney() {
  const [snap, setSnap] = useState(undefined) // undefined: loading, null: the Mac hasn't published yet
  const [pending, setPending] = useState([])
  const [error, setError] = useState('')
  const pendingRef = useRef(pending)
  pendingRef.current = pending

  const load = useCallback(async () => {
    if (demo) {
      const { default: payload } = await import('./demoMoney.json')
      setSnap({ payload, published_at: new Date(Date.now() - 4 * 60000).toISOString() })
      return
    }
    const { data } = await supabase.from('money_snapshot').select('payload, published_at').limit(1)
    setSnap(data?.[0] || null)
  }, [])

  const settle = useCallback((rows) => {
    const finished = rows.filter((r) => r.status === 'done' || r.status === 'failed')
    if (!finished.length) return
    const failed = finished.find((r) => r.status === 'failed')
    if (failed) setError(failed.result?.error || 'Your Mac couldn\'t do that')
    setPending((p) => p.filter((x) => !finished.some((r) => r.id === x.id)))
    load()
  }, [load])

  useEffect(() => {
    load()
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    const every = setInterval(load, 5 * 60000)
    const channel = supabase
      .channel('money-actions')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'money_actions' }, ({ new: row }) => settle([row]))
      .subscribe()
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(every)
      supabase.removeChannel(channel)
    }
  }, [load, settle])

  // Realtime can miss an update, so check on queued edits directly too.
  useEffect(() => {
    if (!pending.length || demo) return
    const t = setInterval(async () => {
      const { data } = await supabase.from('money_actions').select('id, status, result').in('id', pendingRef.current.map((p) => p.id))
      settle(data || [])
    }, 5000)
    return () => clearInterval(t)
  }, [pending.length, settle])

  const send = useCallback(async (method, path, body = {}, label = 'Saving') => {
    setError('')
    if (demo) return
    const { data, error: e } = await supabase.from('money_actions').insert({ method, path, body }).select('id').single()
    if (e) { setError(e.message); return }
    setPending((p) => [...p, { id: data.id, label, at: Date.now() }])
  }, [])

  return { snap, pending, error, clearError: () => setError(''), send, reload: load }
}

// A key the Mac app uses to publish. Only its hash is stored here.
export async function makeKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const key = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))
  const hex = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
  if (!demo) {
    const { error } = await supabase.from('money_keys').insert({ key_hash: hex })
    if (error) throw error
  }
  return key
}
