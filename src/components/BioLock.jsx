import { useEffect, useRef, useState } from 'react'
import { FingerprintPattern as Fingerprint, ScanFace } from 'lucide-react'
import Mark from './Mark.jsx'
import { supabase } from '../supabase.js'
import { bioAvailable, bioEnabled, bioName, enableBio, unlockBio } from '../biometric.js'

const AWAY = 5 * 60 * 1000 // lock again after 5 minutes in the background
const demo = import.meta.env.MODE === 'demo'

// Covers the app until Face ID / Touch ID passes, on open and after time away.
// Also offers to turn it on once, right after signing in.
export default function BioLock({ session }) {
  const [locked, setLocked] = useState(() => (demo ? location.hash.includes('lock=1') : bioEnabled()))
  const [offer, setOffer] = useState(false)
  const [err, setErr] = useState('')
  const hiddenAt = useRef(0)
  const name = bioName()
  const Icon = name === 'Face ID' ? ScanFace : Fingerprint

  useEffect(() => {
    if (demo || bioEnabled() || localStorage.getItem('bio-offered')) return
    bioAvailable().then((ok) => ok && setOffer(true))
  }, [])

  useEffect(() => {
    const onVis = () => {
      if (document.hidden) hiddenAt.current = Date.now()
      else if (bioEnabled() && hiddenAt.current && Date.now() - hiddenAt.current > AWAY) setLocked(true)
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  const unlock = async () => {
    setErr('')
    try { await unlockBio(); setLocked(false) } catch { setErr(`${name} didn’t go through. Try again.`) }
  }
  useEffect(() => { if (locked && !demo) unlock() }, [locked]) // eslint-disable-line react-hooks/exhaustive-deps

  const turnOn = async () => {
    setErr('')
    try { await enableBio(session.user.email); localStorage.setItem('bio-offered', '1'); setOffer(false) } catch { setErr(`Couldn’t set up ${name}.`) }
  }
  const notNow = () => { localStorage.setItem('bio-offered', '1'); setOffer(false) }

  if (locked) return (
    <div className="lock">
      <Mark size={48} />
      <button className="lock-btn" onClick={unlock}><Icon size={28} strokeWidth={1.5} />Unlock with {name}</button>
      {err && <p className="error">{err}</p>}
      <button className="mini" onClick={() => { localStorage.removeItem('bio-lock'); supabase.auth.signOut() }}>Sign out</button>
    </div>
  )
  if (offer) return (
    <div className="bio-offer tile">
      <Icon size={22} strokeWidth={1.5} />
      <span className="grow">Open the app with {name}?</span>
      <button className="btn sm primary" onClick={turnOn}>Turn on</button>
      <button className="btn sm" onClick={notNow}>Not now</button>
      {err && <p className="error">{err}</p>}
    </div>
  )
  return null
}
