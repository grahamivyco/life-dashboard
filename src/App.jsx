import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './supabase.js'
import Sidebar from './components/Sidebar.jsx'
import AskClaude from './components/AskClaude.jsx'
import RecordingPill from './components/RecordingPill.jsx'
import Login from './pages/Login.jsx'
import Today from './pages/Today.jsx'
import Email from './pages/Email.jsx'
import Timeline from './pages/Timeline.jsx'
import Finances from './pages/Finances.jsx'
import Events from './pages/Events.jsx'
import Clients from './pages/Clients.jsx'
import Housing from './pages/Housing.jsx'
import Jobs from './pages/Jobs.jsx'
import Placeholder from './pages/Placeholder.jsx'
import SettingsPage from './pages/Settings.jsx'
import { sections } from './sections.js'

const legacy = sections.filter((s) => s.legacy)

export default function App() {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  if (session === undefined) return <div className="boot" />
  if (!session) return <Login />

  return (
    <div className="shell">
      <Sidebar />
      <main className="main">
        <Routes>
          <Route path="/" element={<Today />} />
          <Route path="/email" element={<Email />} />
          <Route path="/inbox" element={<Navigate to="/email" replace />} />
          <Route path="/brain-dump" element={<Navigate to="/" replace />} />
          <Route path="/goals" element={<Navigate to="/" replace />} />
          <Route path="/timeline" element={<Timeline />} />
          <Route path="/finances" element={<Finances />} />
          <Route path="/jobs" element={<Jobs />} />
          <Route path="/events" element={<Events />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/housing" element={<Housing />} />
          {legacy.map((s) => (
            <Route key={s.path} path={s.path} element={<Placeholder section={s} />} />
          ))}
          <Route path="/settings" element={<SettingsPage session={session} />} />
          <Route path="*" element={<Today />} />
        </Routes>
      </main>
      <RecordingPill />
      <AskClaude />
    </div>
  )
}
