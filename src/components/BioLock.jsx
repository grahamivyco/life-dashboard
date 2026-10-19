import { useEffect, useRef, useState } from 'react'
import { FingerprintPattern as Fingerprint, ScanFace } from 'lucide-react'
import Mark from './Mark.jsx'
import { supabase } from '../supabase.js'
import { bioAvailable, bioEnabled, bioName, unlockBio } from '../biometric.js'

const demo = import.meta.env.MODE === 'demo'

// Optional lock (Settings): asks for Face ID / Touch ID once on this device,
// then trusts the device until sign out. Also offers once per device to add a sign-in passkey.
const OFFERED = 'bio-offered-2' // v2: ask again, the first offers never added a passkey
const UNLOCKED = 'bio-unlocked' // localStorage: once verified, this device is trusted until sign out
export default function BioLock() {
  const [locked, setLocked] = useState(() => (demo ? location.hash.includes('lock=1') : bioEnabled() && !localStorage.getItem(UNLOCKED)))
  const [offer, setOffer] = useState(false)
  const [err, setErr] = useState('')
  const asking = useRef(false)
  const autoTried = useRef(false)
  const name = bioName()
  const Icon = name === 'Face ID' ? ScanFace : Fingerprint

  // Signing out ends the device's trust, so the next sign-in verifies again
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((e) => { if (e === 'SIGNED_OUT') localStorage.removeItem(UNLOCKED) })
    return () => data.subscription.unsubscribe()
  }, [])

  // Offer once per device to add a passkey, so next sign-in is Face ID / Touch ID
  useEffect(() => {
    if (demo || localStorage.getItem(OFFERED)) return
    bioAvailable().then(async (ok) => {
      if (!ok) return
      const { data, error } = await supabase.auth.passkey.list()
      if (!error && !(Array.isArray(data) ? data : []).length) setOffer(true)
      else if (!error) localStorage.setItem(OFFERED, '1')
    })
  }, [])

  // auto: the ask on open. Browsers refuse it when the window isn't focused, so that stays quiet and retries on focus.
  const unlock = async (auto) => {
    if (asking.current) return
    if (auto === true && (autoTried.current || !document.hasFocus())) return
    if (auto === true) autoTried.current = true
    asking.current = true; setErr('')
    try { await unlockBio(); localStorage.setItem(UNLOCKED, '1'); setLocked(false) }
    catch (e) { if (auto !== true) setErr(e?.name === 'NotAllowedError' ? `${name} was cancelled or timed out. Tap to try again.` : `${name} didn’t go through (${e?.name || 'error'}). Try again.`) }
    asking.current = false
  }
  useEffect(() => {
    if (!locked || demo) return
    const ask = () => unlock(true)
    ask()
    window.addEventListener('focus', ask)
    return () => window.removeEventListener('focus', ask)
  }, [locked]) // eslint-disable-line react-hooks/exhaustive-deps

  const turnOn = async () => {
    setErr('')
    const { error } = await supabase.auth.registerPasskey()
    if (error) return setErr(`Couldn’t set up ${name}: ${error.message}`)
    localStorage.setItem(OFFERED, '1'); setOffer(false)
  }
  const notNow = () => { localStorage.setItem(OFFERED, '1'); setOffer(false) }

  if (locked) return (
    <div className="lock">
      <Mark size={48} />
      <button className="lock-btn" onClick={() => unlock()}><Icon size={28} strokeWidth={1.5} />Unlock with {name}</button>
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
