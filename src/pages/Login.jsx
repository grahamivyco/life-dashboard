import { useState } from 'react'
import { supabase } from '../supabase.js'
import Mark from '../components/Mark.jsx'

export default function Login() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setErr('')
    const redirect = window.location.origin + window.location.pathname
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect } })
    setBusy(false)
    if (error) setErr(error.message)
    else setSent(true)
  }

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <Mark size={40} />
        <h1>Life Dashboard</h1>
        {sent ? (
          <p className="muted">Check your inbox for a sign-in link.</p>
        ) : (
          <>
            <label className="field">
              <span>Email</span>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </label>
            <button className="btn primary" disabled={busy}>{busy ? 'Sending…' : 'Send sign-in link'}</button>
            {err && <p className="error">{err}</p>}
          </>
        )}
      </form>
    </div>
  )
}
