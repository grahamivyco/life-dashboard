import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import { useSnapshot } from './useSnapshot.js'
import { dayKey } from './lib.js'

// All-day dates come as "YYYY-MM-DD". Parse them as local midnight, not UTC.
export const toDate = (s) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00` : s)

const fromCalendar = (e) => ({
  id: `g-${e.id}`, title: e.title, start: toDate(e.start), end: e.end ? toDate(e.end) : null,
  allDay: !!e.all_day, location: e.location, notes: e.notes, calendar: e.calendar, url: e.url, series: e.series, source: 'calendar',
})

const fromRow = (e) => ({
  id: e.id, title: e.title, start: new Date(e.starts_at), end: e.ends_at ? new Date(e.ends_at) : null,
  allDay: !!e.all_day, location: e.location, notes: e.notes, calendar: 'Brain dump', gcalId: e.gcal_id, source: 'app',
})

const sameEvent = (a, b) =>
  a.title.trim().toLowerCase() === b.title.trim().toLowerCase() && Math.abs(a.start - b.start) < 60e3

// Upcoming events for the next `days` days: Google Calendar (hourly snapshot) plus
// rows in public.events (brain dumps, added here). A series that repeats 3+ times
// in a week (work blocks, daily habits) moves to `routines` so the days stay readable.
export function useUpcoming(days) {
  const snap = useSnapshot('events')
  const [rows, setRows] = useState([])

  const load = useCallback(async () => {
    const start = new Date(); start.setHours(0, 0, 0, 0)
    const { data } = await supabase.from('events').select('*').gte('starts_at', start.toISOString()).order('starts_at').limit(200)
    setRows(data || [])
  }, [])
  useEffect(() => { load() }, [load])

  const from = new Date(); from.setHours(0, 0, 0, 0)
  const to = new Date(from); to.setDate(to.getDate() + days)
  const now = Date.now()

  const cal = (snap?.payload?.events || []).map(fromCalendar)
  const mine = rows.map(fromRow).filter((r) => !cal.some((c) => (r.gcalId && c.id === `g-${r.gcalId}`) || sameEvent(c, r)))
  const all = [...cal, ...mine]
    .filter((e) => e.start < to && (e.end ? e.end > now : e.start >= from))
    .sort((a, b) => a.start - b.start || a.allDay - b.allDay)

  const bySeries = {}
  for (const e of all) if (e.series) (bySeries[e.series] ||= []).push(e)
  const routineIds = new Set(Object.keys(bySeries).filter((k) => {
    const weeks = {}
    for (const e of bySeries[k]) { const w = Math.floor((e.start - from) / (7 * 864e5)); weeks[w] = (weeks[w] || 0) + 1 }
    return Math.max(...Object.values(weeks)) >= 3
  }))

  const routines = [...routineIds].map((k) => {
    const xs = bySeries[k]
    const wd = [...new Set(xs.map((e) => e.start.getDay()))].sort()
    const when = wd.join() === '1,2,3,4,5' ? 'Weekdays' : wd.length === 7 ? 'Every day' : wd.map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ')
    return { id: k, title: xs[0].title, when, first: xs[0] }
  })

  const events = all.filter((e) => !routineIds.has(e.series))
  const groups = []
  for (const e of events) {
    const k = dayKey(e.start < from ? from : e.start)
    if (groups.at(-1)?.k !== k) groups.push({ k, at: e.start < from ? from : e.start, items: [] })
    groups.at(-1).items.push(e)
  }

  async function remove(id) {
    setRows((xs) => xs.filter((x) => x.id !== id))
    await supabase.from('events').delete().eq('id', id)
  }

  return { events, groups, routines, syncedAt: snap?.synced_at, reload: load, remove }
}

export const dayLabel = (d, short = false) => {
  const t = new Date(); t.setHours(0, 0, 0, 0)
  const diff = Math.round((new Date(d).setHours(0, 0, 0, 0) - t) / 864e5)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (short) return new Date(d).toLocaleDateString('en-GB', { weekday: 'short' })
  return new Date(d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })
}
