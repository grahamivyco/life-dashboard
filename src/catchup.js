import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import { useSnapshot } from './useSnapshot.js'
import { DEFAULT_SPECS, misses } from './pages/Housing.jsx'

// Data for the catch-up tiles on Today. Each mirrors the "needs you" view on its page.
const local = (k) => { try { return JSON.parse(localStorage.getItem(k) || '{}') } catch { return {} } }

// Emails with Claude's reply options that still wait on Graham (same rule as Email's To reply)
export function useToReply() {
  const snap = useSnapshot('email')
  const [queued, setQueued] = useState({})
  useEffect(() => {
    supabase.from('claude_requests').select('note, status').eq('action', 'send_reply').in('status', ['approved', 'working'])
      .then(({ data }) => setQueued(Object.fromEntries((data || []).filter((r) => r.note).map((r) => [r.note.split('|')[0].slice(6), true]))))
  }, [])
  const skips = local('email-skipped')
  return (snap?.payload?.threads || []).filter((t) => t.replies?.length && !queued[t.id] && skips[t.id] !== t.date)
}

// Jobs waiting on Graham, then new jobs not yet decided (best fit first), from public.jobs
export function useJobsToApply() {
  const [jobs, setJobs] = useState([])
  useEffect(() => {
    supabase.from('jobs').select('slug,role,short,org,status,needs_you,due,due_text,score').then(({ data }) => setJobs(data || []))
  }, [])
  const today = new Date(new Date().toDateString())
  const open = (j) => !j.due || new Date(j.due + 'T12:00:00') >= today
  const waiting = jobs.filter((j) => j.needs_you && !['rejected', 'skipped'].includes(j.status))
  const fresh = jobs.filter((j) => j.status === 'new' && open(j)).sort((a, b) => (b.score || 0) - (a.score || 0))
  return [...waiting, ...fresh]
}

// Flats that fit Graham's specs, newest first
export function useHousingFits() {
  const snap = useSnapshot('housing')
  const [specs, setSpecs] = useState(DEFAULT_SPECS)
  useEffect(() => {
    supabase.from('housing_profile').select('specs').limit(1)
      .then(({ data }) => { if (data?.[0]?.specs) setSpecs({ ...DEFAULT_SPECS, ...data[0].specs }) })
  }, [])
  const marks = local('housing-marks')
  return (snap?.payload?.listings || [])
    .filter((l) => !l.gone && marks[l.id] !== 'hidden' && !misses(l, specs).length)
    .sort((a, b) => new Date(b.first_seen) - new Date(a.first_seen))
}
