import { useEffect, useState } from 'react'
import { supabase } from '../supabase.js'
import { bioAvailable, bioEnabled, bioName, enableBio, disableBio } from '../biometric.js'
import PageHeader from '../components/PageHeader.jsx'

function BioSetting({ email }) {
  const [ok, setOk] = useState(false)
  const [on, setOn] = useState(bioEnabled)
  const [err, setErr] = useState('')
  useEffect(() => { bioAvailable().then(setOk) }, [])
  if (!ok) return null
  const toggle = async () => {
    setErr('')
    if (on) { disableBio(); setOn(false); return }
    try { await enableBio(email); setOn(true) } catch { setErr(`Couldn’t set up ${bioName()}.`) }
  }
  return (
    <div className="row between">
      <span>Unlock with {bioName()} on this device</span>
      <button className="btn" onClick={toggle}>{on ? 'Turn off' : 'Turn on'}</button>
      {err && <p className="error">{err}</p>}
    </div>
  )
}

export default function SettingsPage({ session }) {
  return (
    <div className="page">
      <PageHeader title="Settings" />
      <section className="tile">
        <div className="tile-head"><h2>Account</h2></div>
        <div className="row between">
          <span>{session.user.email}</span>
          <button className="btn" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
        <BioSetting email={session.user.email} />
      </section>
      <section className="tile">
        <div className="tile-head"><h2>Install as an app</h2></div>
        <ul className="steps">
          <li><b>iPhone</b> Safari, Share, Add to Home Screen</li>
          <li><b>Mac</b> Safari, File, Add to Dock</li>
        </ul>
      </section>
      <section className="tile">
        <div className="tile-head"><h2>Voice notes</h2></div>
        <ul className="steps">
          <li><b>Mac</b> Handy: hold the shortcut, talk into the Brain Dump box</li>
          <li><b>iPhone</b> Tap the mic on the keyboard</li>
        </ul>
      </section>
    </div>
  )
}
