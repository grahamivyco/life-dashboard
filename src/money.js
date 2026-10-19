import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase.js'

// Finances live on the server (supabase/functions/money): opening the page syncs the banks and edits
// run there, and every change republishes money_snapshot. Until the Mac app has moved its data in
// (python3 -m money --move-to-cloud), the Mac publishes instead and takes edits from money_actions.

const demo = import.meta.env.MODE === 'demo'

export const usd = (n, d = 0) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: d, minimumFractionDigits: d }).format(n || 0)

// Money out is positive in the money app. Show it plainly, and money in with a plus.
export const amt = (n, d = 2) => (n < 0 ? '+' : '') + usd(Math.abs(n), d)

// Older copies of the Mac app file check deposits as transfers, so "Came in" missed them.
// The Mac app counts them as income now; this covers a snapshot from a Mac that hasn't updated.
function countCheckDeposits(p) {
  for (const t of p.transactions || []) {
    if (t.category !== 'Transfer' || !(t.amount < 0) || !/^check deposit/i.test(t.name || t.description || '')) continue
    t.category = 'Income'
    for (const s of Object.values(p.spending || {})) {
      if (!(s.start <= t.date && t.date < s.end)) continue
      s.income -= t.amount
      s.net -= t.amount
    }
  }
}

const today = () => new Date().toLocaleDateString('en-CA') // YYYY-MM-DD where Graham is

async function server(body) {
  const { data, error } = await supabase.functions.invoke('money', { body: { today: today(), ...body } })
  if (error) {
    const detail = await error.context?.json?.().catch(() => null)
    throw new Error(detail?.error || error.message)
  }
  return data
}

export function useMoney() {
  const [snap, setSnap] = useState(undefined) // undefined: loading, null: the Mac hasn't published yet
  const [onServer, setOnServer] = useState(undefined) // false until the Mac app moves its data in
  const onServerRef = useRef(onServer)
  onServerRef.current = onServer
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
    const snap = data?.[0] || null
    if (snap) countCheckDeposits(snap.payload)
    setSnap(snap)
  }, [])

  const settle = useCallback((rows) => {
    const finished = rows.filter((r) => r.status === 'done' || r.status === 'failed')
    if (!finished.length) return
    const failed = finished.find((r) => r.status === 'failed')
    if (failed) setError(failed.result?.error || 'Your Mac couldn\'t do that')
    setPending((p) => p.filter((x) => !finished.some((r) => r.id === x.id)))
    load()
  }, [load])

  // Ask the server for fresh numbers. It skips the banks if it synced in the last 10 minutes.
  const sync = useCallback(async (force = false) => {
    if (demo || onServerRef.current === false) return
    const id = 'sync-' + Date.now()
    setPending((p) => [...p, { id, label: 'Syncing banks', at: Date.now() }])
    try {
      const r = await server({ op: 'sync', force })
      setOnServer(!r?.needs_move)
      if (r?.banks?.some((b) => !b.ok)) setError(r.banks.filter((b) => !b.ok).map((b) => `${b.institution}: ${b.error}`).join('. '))
      if (r?.synced_at || r?.banks) await load()
    } catch (e) {
      if (force) setError(e.message)
    } finally {
      setPending((p) => p.filter((x) => x.id !== id))
    }
  }, [load])

  useEffect(() => {
    load()
    sync()
    const onVisible = () => { if (document.visibilityState === 'visible') { load(); sync() } }
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
  }, [load, settle, sync])

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
    if (path === '/api/sync' && onServerRef.current) return sync(true)
    if (onServerRef.current) {
      const id = 'edit-' + Date.now()
      setPending((p) => [...p, { id, label, at: Date.now() }])
      try {
        const r = await server({ op: 'action', method, path, body })
        if (r?.result?.ok === false) setError((r.result.errors || []).join('. ') || 'That didn\'t save')
        await load()
      } catch (e) {
        setError(e.message)
      } finally {
        setPending((p) => p.filter((x) => x.id !== id))
      }
      return
    }
    const { data, error: e } = await supabase.from('money_actions').insert({ method, path, body }).select('id').single()
    if (e) { setError(e.message); return }
    setPending((p) => [...p, { id: data.id, label, at: Date.now() }])
  }, [load, sync])

  return { snap, onServer, pending, error, clearError: () => setError(''), send, reload: load }
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
