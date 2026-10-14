import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import Mark from './Mark.jsx'
import { sections, settingsSection } from '../sections.js'

function Item({ s, onNavigate }) {
  const Icon = s.icon
  return (
    <NavLink
      to={s.path}
      end={s.path === '/'}
      className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
      onClick={onNavigate}
      title={s.label}
    >
      <Icon size={18} strokeWidth={1.75} />
      <span className="nav-label">{s.label}</span>
    </NavLink>
  )
}

// Icon rail. Expands to show labels on hover (desktop) or when the mark is tapped (touch).
export default function Sidebar() {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)

  return (
    <>
      <div className={'scrim' + (open ? ' show' : '')} onClick={close} />
      <nav className={'rail' + (open ? ' open' : '')} aria-label="Main">
        <button className="rail-mark" onClick={() => setOpen((o) => !o)} aria-label={open ? 'Collapse menu' : 'Expand menu'} aria-expanded={open}>
          <Mark size={28} />
          <span className="nav-label brand">Open Frame</span>
        </button>
        <div className="rail-items">
          {sections.map((s) => <Item key={s.path} s={s} onNavigate={close} />)}
        </div>
        <div className="rail-bottom">
          <Item s={settingsSection} onNavigate={close} />
        </div>
      </nav>
    </>
  )
}
