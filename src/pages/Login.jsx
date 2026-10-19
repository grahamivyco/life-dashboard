import { useState } from 'react'
import { supabase } from '../supabase.js'
import Mark from '../components/Mark.jsx'

// Email code sign-in. Typing the code works inside the home-screen app,
// where an emailed link would open Safari instead. The link still works too.
export default function Login() {
  const [email, setEmail] = useState(() => localStorage.getItem('login-email') || '')
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function send(e) {
    e?.preventDefault()
    setBusy(true); setErr('')
    localStorage.setItem('login-email', email)
    const redirect = window.location.origin + window.location.pathname
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect, shouldCreateUser: false } })
    setBusy(false)
    if (error) setErr(/rate limit/i.test(error.message) ? 'Too many sign-in emails in the last hour. Use the code from your last email, or try again in an hour.' : error.message)
    else setSent(true)
  }

  async function verify(e) {
    e.preventDefault()
    setBusy(true); setErr('')
    const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: 'email' })
    setBusy(false)
    if (error) setErr(/expired|invalid/i.test(error.message) ? 'That code didn’t work. Check it or send a new one.' : error.message)
  }

  return (
    <div className="login">
      {sent ? (
        <form className="login-card" onSubmit={verify}>
          <Mark size={40} />
          <h1>Enter your code</h1>
          <p className="muted">We emailed a code to {email}.</p>
          <label className="field">
            <span>Code</span>
            <input className="code-input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={10}
              required autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          </label>
          <button className="btn primary" disabled={busy || code.length < 6}>{busy ? 'Checking…' : 'Sign in'}</button>
          {err && <p className="error">{err}</p>}
          <div className="row between">
            <button type="button" className="mini" onClick={() => { setSent(false); setCode(''); setErr('') }}>Change email</button>
            <button type="button" className="mini" onClick={send} disabled={busy}>Send a new code</button>
          </div>
        </form>
      ) : (
        <form className="login-card" onSubmit={send}>
          <Mark size={40} />
          <h1>Life Dashboard</h1>
          <label className="field">
            <span>Email</span>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </label>
          <button className="btn primary" disabled={busy}>{busy ? 'Sending…' : 'Email me a code'}</button>
          {err && <p className="error">{err}</p>}
          <button type="button" className="mini" onClick={() => { if (email) { localStorage.setItem('login-email', email); setSent(true); setErr('') } }}>I already have a code</button>
        </form>
      )}
    </div>
  )
}
