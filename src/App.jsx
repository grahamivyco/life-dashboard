import { useEffect, useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import { supabase } from './supabase.js'
import Sidebar from './components/Sidebar.jsx'
import Login from './pages/Login.jsx'
import Today from './pages/Today.jsx'
import BrainDump from './pages/BrainDump.jsx'
import Goals from './pages/Goals.jsx'
import Timeline from './pages/Timeline.jsx'
import Events from './pages/Events.jsx'
import Placeholder from './pages/Placeholder.jsx'
import SettingsPage from './pages/Settings.jsx'
import { sections } from './sections.js'

const legacy = sections.filter((s) => s.legacy && s.path !== '/events')

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
          <Route path="/brain-dump" element={<BrainDump />} />
          <Route path="/goals" element={<Goals />} />
          <Route path="/timeline" element={<Timeline />} />
          <Route path="/events" element={<Events />} />
          {legacy.map((s) => (
            <Route key={s.path} path={s.path} element={<Placeholder section={s} />} />
          ))}
          <Route path="/settings" element={<SettingsPage session={session} />} />
          <Route path="*" element={<Today />} />
        </Routes>
      </main>
    </div>
  )
}
