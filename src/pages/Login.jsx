import { useState } from 'react'
import { FingerprintPattern as Fingerprint, ScanFace } from 'lucide-react'
import { supabase } from '../supabase.js'
import Mark from '../components/Mark.jsx'
import { bioName } from '../biometric.js'

// Passkey sign-in (Face ID / Touch ID) first. The fallback is an emailed code typed
// here, so it works inside the home-screen app (the email's link would open Safari).
// After that sign-in, BioLock offers to add the passkey right in the app.
export default function Login() {
  const [email, setEmail] = useState(() => localStorage.getItem('login-email') || '')
  const [mode, setMode] = useState('passkey') // passkey | email | sent
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [code, setCode] = useState('')
  const name = bioName()
  const Icon = name === 'Face ID' ? ScanFace : Fingerprint

  async function passkey() {
    setBusy(true); setErr('')
    const { error } = await supabase.auth.signInWithPasskey()
    setBusy(false)
    if (!error) localStorage.setItem('bio-unlocked', '1') // just used Face ID, don't ask again
    if (!error) return
    if (/abort|cancel|not ?allowed/i.test(error.message + (error.code || ''))) return setErr(`${name} was cancelled. Try again, or use an email code.`)
    // No passkey on file for this device (or an old one): the email link signs in, then Face ID gets added
    setMode('email')
    setErr(`${name} isn’t set up yet. Sign in with an email code once, then tap Turn on.`)
  }

  async function send(e) {
    e?.preventDefault()
    setBusy(true); setErr('')
    localStorage.setItem('login-email', email)
    const redirect = window.location.origin + window.location.pathname
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect, shouldCreateUser: false } })
    setBusy(false)
    if (error) setErr(/rate limit/i.test(error.message) ? 'Too many sign-in emails in the last hour. Use the code in your last email, or try again in an hour.' : error.message)
    else setMode('sent')
  }

  // The email carries a code too: typing it here signs in inside the home-screen app
  async function verify(e) {
    e.preventDefault()
    setBusy(true); setErr('')
    const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: 'email' })
    setBusy(false)
    if (error) setErr(/expired|invalid/i.test(error.message) ? 'That code didn’t work. Check it or send a new one.' : error.message)
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
            <button type="button" className="mini" onClick={() => { setMode('email'); setErr('') }}>Email me a code instead</button>
          </>
        )}
        {mode === 'email' && (
          <form className="stack" onSubmit={send}>
            <label className="field">
              <span>Email</span>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </label>
            <button className="btn primary" disabled={busy}>{busy ? 'Sending…' : 'Email me a code'}</button>
            {err && <p className="error">{err}</p>}
            <button type="button" className="mini" onClick={() => { setMode('passkey'); setErr('') }}>Use {name} instead</button>
          </form>
        )}
        {mode === 'sent' && (
          <form className="stack" onSubmit={verify}>
            <p className="muted">We emailed {email}. Type the code from the email here.</p>
            <input className="plain code-input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={10}
              aria-label="Code" required autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
            <button className="btn primary" disabled={busy || code.length < 6}>{busy ? 'Checking…' : 'Sign in'}</button>
            {err && <p className="error">{err}</p>}
            <div className="row between">
              <button type="button" className="mini" onClick={() => { setMode('email'); setCode(''); setErr('') }}>Change email</button>
              <button type="button" className="mini" onClick={send} disabled={busy}>Send a new code</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
