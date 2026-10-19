// Finances on the server: syncs Plaid and YNAB, runs edits from the page, and publishes money_snapshot.
// The store (money_store.data) is the Mac app's database as one JSON doc. Keys live in Vault (money_secrets).
//   POST { op: 'sync', today, force? }                  pull fresh numbers (skipped if synced in the last 10 min)
//   POST { op: 'action', today, method, path, body }    an edit, same routes as the Mac app's local API
import { createClient } from 'npm:@supabase/supabase-js@2'
import { buildPayload, runAction } from './core.js'
import { syncAll, syncYnab } from './sync.js'

const GRAHAM = 'c2cbf3bf-95b2-4c27-bc60-c598543f4cfa'
const FRESH_MS = 10 * 60000
const LOCK_MS = 3 * 60000

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

async function load(user: string) {
  const { data, error } = await db.from('money_store').select('data, version, synced_at, sync_started_at').eq('user_id', user).maybeSingle()
  if (error) throw error
  return data
}

// Saves only if nobody else saved since we loaded, so two devices can't undo each other.
async function save(user: string, version: number, data: unknown, extra: Record<string, unknown> = {}) {
  const { data: rows, error } = await db.from('money_store')
    .update({ data, version: version + 1, updated_at: new Date().toISOString(), ...extra })
    .eq('user_id', user).eq('version', version).select('version')
  if (error) throw error
  return rows.length > 0
}

async function publish(user: string, store: unknown, today: string) {
  const { error } = await db.from('money_snapshot')
    .upsert({ user_id: user, payload: buildPayload(store, today), published_at: new Date().toISOString() })
  if (error) throw error
}

async function sync(user: string, today: string, force: boolean) {
  const row = await load(user)
  if (!row) return { needs_move: true }
  const now = Date.now()
  if (!force && row.synced_at && now - Date.parse(row.synced_at) < FRESH_MS) return { fresh: true, synced_at: row.synced_at }
  if (row.sync_started_at && now - Date.parse(row.sync_started_at) < LOCK_MS) return { busy: true }
  await db.from('money_store').update({ sync_started_at: new Date().toISOString() }).eq('user_id', user)

  try {
    const { data: keys, error } = await db.rpc('money_secrets', { p_user: user })
    if (error) throw error
    const store = row.data
    const banks = await syncAll(store, keys, today)
    let ynab: unknown = null
    try { ynab = await syncYnab(store, keys.ynab_token, today) } catch (e) { ynab = { error: (e as Error).message } }

    // If an edit landed while the banks answered, keep the edit; the next open syncs again.
    const synced_at = new Date().toISOString()
    const saved = await save(user, row.version, store, { synced_at, sync_started_at: null })
    if (!saved) {
      await db.from('money_store').update({ sync_started_at: null }).eq('user_id', user)
      return { retry: true }
    }
    await publish(user, store, today)
    return { banks, ynab, synced_at }
  } catch (e) {
    await db.from('money_store').update({ sync_started_at: null }).eq('user_id', user)
    throw e
  }
}

async function action(user: string, today: string, method: string, path: string, body: unknown) {
  if (path === '/api/sync') return sync(user, today, true)
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await load(user)
    if (!row) return { needs_move: true }
    const result = runAction(row.data, method, path, body || {}, today)
    if (await save(user, row.version, row.data)) {
      await publish(user, row.data, today)
      return { ok: true, result }
    }
  }
  throw new Error('Finances were busy, try again')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer /, '')
    const { data: { user } } = await db.auth.getUser(token)
    if (!user || user.id !== GRAHAM) return json({ error: 'Not allowed' }, 403)
    const { op, today: t, force, method, path, body } = await req.json()
    const today = /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : new Date().toISOString().slice(0, 10)
    if (op === 'sync') return json(await sync(user.id, today, !!force))
    if (op === 'action') return json(await action(user.id, today, String(method), String(path), body))
    return json({ error: 'Unknown op' }, 400)
  } catch (e) {
    return json({ error: (e as Error).message }, 400)
  }
})
