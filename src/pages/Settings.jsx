import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { supabase } from '../supabase.js'
import { bioAvailable, bioEnabled, bioName, enableBio, disableBio } from '../biometric.js'

function Toggle({ on, onChange, label }) {
  return <button className={'switch' + (on ? ' on' : '')} role="switch" aria-checked={on} aria-label={label} onClick={onChange}><i /></button>
}

// Settings live at the bottom of Profile, as grouped rows (phone style).
export function AppSettings() {
  const [email, setEmail] = useState('')
  const [bio, setBio] = useState(false)
  const [lock, setLock] = useState(bioEnabled)
  const [note, setNote] = useState('')
  const name = bioName()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user?.email || ''))
    bioAvailable().then(setBio)
    if (location.hash.endsWith('#settings')) setTimeout(() => document.getElementById('settings')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 80)
  }, [])

  const addPasskey = async () => {
    setNote('')
    const { error } = await supabase.auth.registerPasskey()
    setNote(error ? `Couldn’t add it: ${error.message}` : `Added. Next time, sign in with ${name}.`)
  }
  const toggleLock = async () => {
    setNote('')
    if (lock) { disableBio(); setLock(false); return }
    try { await enableBio(email); localStorage.setItem('bio-unlocked', '1'); setLock(true) } catch { setNote(`Couldn’t set up ${name}.`) }
  }

  return (
    <section id="settings" className="settings">
      <h2 className="set-title">Settings</h2>
      <div className="set-group">
        <div className="set-row"><span className="grow">Signed in as</span><span className="set-val clamp">{email}</span></div>
        {bio && (
          <>
            <button className="set-row" onClick={addPasskey}><span className="grow">Sign in with {name}</span><span className="set-val">Add to this device</span><ChevronRight size={16} className="chev" /></button>
            <div className="set-row"><span className="grow">Verify with {name} once on this device</span><Toggle on={lock} onChange={toggleLock} label={`Ask for ${name}`} /></div>
          </>
        )}
      </div>
      {note && <p className="hint set-note">{note}</p>}

      <h3 className="set-sub">Install as an app</h3>
      <div className="set-group">
        <div className="set-row col"><span>iPhone</span><span className="set-val">Safari, Share, Add to Home Screen</span></div>
        <div className="set-row col"><span>Mac</span><span className="set-val">Safari, File, Add to Dock</span></div>
      </div>

      <h3 className="set-sub">Voice notes</h3>
      <div className="set-group">
        <div className="set-row col"><span>iPhone</span><span className="set-val">Tap the mic on the keyboard</span></div>
        <div className="set-row col"><span>Mac</span><span className="set-val">Handy: hold the shortcut, talk into the Brain Dump box</span></div>
      </div>

      <div className="set-group">
        <button className="set-row danger" onClick={() => supabase.auth.signOut()}><span className="grow">Sign out</span></button>
      </div>
    </section>
  )
}

// Old /settings links land on the Settings part of Profile
export default function SettingsPage() {
  return <Navigate to="/profile#settings" replace />
}
