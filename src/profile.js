import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'

// Graham's profile row (name, photo, events prefs), shared by the Profile page and the nav avatar.
// Photo and personal documents live in the private `profile` bucket under <uid>/.
let cache = null
const subs = new Set()
const emit = () => subs.forEach((f) => f(cache))

async function load() {
  const { data } = await supabase.from('profile').select('*').limit(1)
  const row = data?.[0] || {}
  let photo = null
  if (row.photo_path) {
    const { data: s } = await supabase.storage.from('profile').createSignedUrl(row.photo_path, 3600 * 24)
    photo = s?.signedUrl || null
  }
  cache = { ...row, events: row.events || {}, photo }
  emit()
}

export function useProfile() {
  const [p, setP] = useState(cache)
  useEffect(() => {
    subs.add(setP)
    if (!cache) load()
    return () => subs.delete(setP)
  }, [])
  return p
}

export async function saveProfile(patch) {
  cache = { ...(cache || {}), ...patch }
  emit()
  const { photo, ...row } = cache
  await supabase.from('profile').upsert({ ...row, updated_at: new Date().toISOString() })
}

export async function uid() {
  const { data } = await supabase.auth.getSession()
  return data.session?.user?.id || 'demo'
}

export async function uploadPhoto(file) {
  const id = await uid()
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const path = `${id}/photo-${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('profile').upload(path, file, { contentType: file.type, upsert: true })
  if (error) throw error
  const old = cache?.photo_path
  await saveProfile({ photo_path: path })
  if (old && old !== path) supabase.storage.from('profile').remove([old])
  await load()
}

export const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'G'
