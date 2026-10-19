import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import Mark from './Mark.jsx'
import { supabase } from '../supabase.js'
import { sections, settingsSection } from '../sections.js'

function Item({ s, onNavigate, count }) {
  const Icon = s.icon
  return (
    <NavLink
      to={s.path}
      end={s.path === '/'}
      className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
      onClick={onNavigate}
      title={s.label}
    >
      <span className="nav-icon">
        <Icon size={18} strokeWidth={1.75} />
        {count > 0 && <span className="badge">{count > 9 ? '9+' : count}</span>}
      </span>
      <span className="nav-label">{s.label}</span>
    </NavLink>
  )
}

// Icon rail. Expands to show labels on hover (desktop) or when the mark is tapped (touch).
export default function Sidebar() {
  const [open, setOpen] = useState(false)
  const [counts, setCounts] = useState({ claude: 0, email: 0 })
  const location = useLocation()
  const close = () => setOpen(false)

  useEffect(() => {
    let alive = true
    const load = async () => {
      const [a, m] = await Promise.all([
        supabase.from('claude_requests').select('id', { count: 'exact', head: true }).eq('status', 'needs_approval'),
        supabase.from('section_snapshots').select('payload->unread').eq('section', 'email').order('synced_at', { ascending: false }).limit(1),
      ])
      if (alive) setCounts({ claude: a.count || 0, email: Number(m.data?.[0]?.unread || 0) })
    }
    load()
    const t = setInterval(load, 60000)
    return () => { alive = false; clearInterval(t) }
  }, [location.pathname])

  return (
    <>
      <div className={'scrim' + (open ? ' show' : '')} onClick={close} />
      <nav className={'rail' + (open ? ' open' : '')} aria-label="Main">
        <button className="rail-mark" onClick={() => setOpen((o) => !o)} aria-label={open ? 'Collapse menu' : 'Expand menu'} aria-expanded={open}>
          <Mark size={28} />
          <span className="nav-label brand">Open Frame</span>
        </button>
        <div className="rail-items">
          {sections.map((s) => <Item key={s.path} s={s} onNavigate={close} count={s.badge ? counts[s.badge] : 0} />)}
        </div>
        <div className="rail-bottom">
          <Item s={settingsSection} onNavigate={close} />
        </div>
      </nav>
    </>
  )
}
