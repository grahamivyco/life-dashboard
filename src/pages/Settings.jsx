import { supabase } from '../supabase.js'
import PageHeader from '../components/PageHeader.jsx'

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
