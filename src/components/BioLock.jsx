import { useEffect, useRef, useState } from 'react'
import { FingerprintPattern as Fingerprint, ScanFace } from 'lucide-react'
import Mark from './Mark.jsx'
import { supabase } from '../supabase.js'
import { bioAvailable, bioEnabled, bioName, unlockBio } from '../biometric.js'

const AWAY = 5 * 60 * 1000 // lock again after 5 minutes in the background
const demo = import.meta.env.MODE === 'demo'

// Optional lock (Settings): covers the app until Face ID / Touch ID passes, on open
// and after time away. Also offers once per device to add a sign-in passkey.
export default function BioLock() {
  const [locked, setLocked] = useState(() => (demo ? location.hash.includes('lock=1') : bioEnabled()))
  const [offer, setOffer] = useState(false)
  const [err, setErr] = useState('')
  const hiddenAt = useRef(0)
  const name = bioName()
  const Icon = name === 'Face ID' ? ScanFace : Fingerprint

  // Offer once per device to add a passkey, so next sign-in is Face ID / Touch ID
  useEffect(() => {
    if (demo || localStorage.getItem('bio-offered')) return
    bioAvailable().then(async (ok) => {
      if (!ok) return
      const { data, error } = await supabase.auth.passkey.list()
      if (!error && !(Array.isArray(data) ? data : []).length) setOffer(true)
      else if (!error) localStorage.setItem('bio-offered', '1')
    })
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
    const { error } = await supabase.auth.registerPasskey()
    if (error) return setErr(`Couldn’t set up ${name}: ${error.message}`)
    localStorage.setItem('bio-offered', '1'); setOffer(false)
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
      <span className="grow">Sign in with {name} next time?</span>
      <button className="btn sm primary" onClick={turnOn}>Turn on</button>
      <button className="btn sm" onClick={notNow}>Not now</button>
      {err && <p className="error">{err}</p>}
    </div>
  )
  return null
}
