import { useState } from 'react'
import { FingerprintPattern as Fingerprint, ScanFace } from 'lucide-react'
import { supabase } from '../supabase.js'
import Mark from '../components/Mark.jsx'
import { bioName } from '../biometric.js'

// Passkey sign-in (Face ID / Touch ID) first. The email link is the fallback and
// the way to add the first passkey: it opens in Safari, which then offers to save one.
// Passkeys sync through iCloud Keychain, so the home-screen app can use it after.
export default function Login() {
  const [email, setEmail] = useState(() => localStorage.getItem('login-email') || '')
  const [mode, setMode] = useState('passkey') // passkey | email | sent
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const name = bioName()
  const Icon = name === 'Face ID' ? ScanFace : Fingerprint

  async function passkey() {
    setBusy(true); setErr('')
    const { error } = await supabase.auth.signInWithPasskey()
    setBusy(false)
    if (!error) localStorage.setItem('bio-unlocked', '1') // just used Face ID, don't ask again
    if (error) setErr(/abort|cancel|not ?allowed/i.test(error.message + (error.code || ''))
      ? `${name} was cancelled. Try again, or use the email link.`
      : `${name} didn’t work (${error.message}). Use the email link once to add it.`)
  }

  async function send(e) {
    e.preventDefault()
    setBusy(true); setErr('')
    localStorage.setItem('login-email', email)
    const redirect = window.location.origin + window.location.pathname
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect, shouldCreateUser: false } })
    setBusy(false)
    if (error) setErr(/rate limit/i.test(error.message) ? 'Too many sign-in emails in the last hour. Use the link in your last email, or try again in an hour.' : error.message)
    else setMode('sent')
  }

  return (
    <div className="login">
      <div className="login-card">
        <Mark size={40} />
        <h1>Life Dashboard</h1>
        {mode === 'passkey' && (
          <>
            <button className="btn primary" onClick={passkey} disabled={busy}><Icon size={16} />{busy ? 'Waiting…' : `Sign in with ${name}`}</button>
            {err && <p className="error">{err}</p>}
            <button type="button" className="mini" onClick={() => { setMode('email'); setErr('') }}>Email me a sign-in link instead</button>
          </>
        )}
        {mode === 'email' && (
          <form className="stack" onSubmit={send}>
            <label className="field">
              <span>Email</span>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </label>
            <button className="btn primary" disabled={busy}>{busy ? 'Sending…' : 'Email me a link'}</button>
            {err && <p className="error">{err}</p>}
            <button type="button" className="mini" onClick={() => { setMode('passkey'); setErr('') }}>Use {name} instead</button>
          </form>
        )}
        {mode === 'sent' && (
          <>
            <p className="muted">Check {email}. Open the link, and when it asks, turn on {name}. After that, {name} works here too.</p>
            <button type="button" className="mini" onClick={() => setMode('passkey')}>Back</button>
          </>
        )}
      </div>
    </div>
  )
}
