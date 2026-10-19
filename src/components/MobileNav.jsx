import { useEffect, useState } from 'react'
import { NavLink, Link, useLocation } from 'react-router-dom'
import { Menu, Settings, PenLine } from 'lucide-react'
import Avatar from './Avatar.jsx'
import { sections, settingsSection } from '../sections.js'

// Phone nav, after Muse: a side drawer with every page (round menu button, top left) that slides
// in from the left and pushes the page aside, and a frosted floating bar at the bottom that holds
// the current page's own tabs as icons. Pages put them there through <Tabs> (Controls.jsx).
const byPath = Object.fromEntries([...sections, settingsSection].map((s) => [s.path, s]))
const order = ['/', '/email', '/jobs', '/housing', '/finances', '/events', '/clients', '/timeline'].map((p) => byPath[p])

function Badge({ count }) {
  if (!count) return null
  return <span className="badge dot" aria-label={`${count} waiting`} />
}

function Row({ s, counts, tabIndex }) {
  const Icon = s.icon
  return (
    <NavLink to={s.path} end={s.path === '/'} tabIndex={tabIndex}
      className={({ isActive }) => 'm-row' + (isActive ? ' active' : '')}>
      <span className="nav-icon"><Icon size={21} strokeWidth={1.7} /><Badge count={s.badge ? counts[s.badge] : 0} /></span>
      <span className="grow">{s.label}</span>
    </NavLink>
  )
}

export default function MobileNav({ counts }) {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const [hidden, setHidden] = useState(false)
  const current = pathname === '/profile' ? { label: 'Profile' } : byPath[pathname]

  useEffect(() => { setOpen(false); setHidden(false) }, [pathname])

  // Hide the top bar while scrolling down, bring it back on any scroll up
  useEffect(() => {
    let last = window.scrollY
    const onScroll = () => {
      const y = window.scrollY
      if (Math.abs(y - last) < 6) return
      setHidden(y > last && y > 56)
      last = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    document.body.classList.toggle('drawer-open', open)
    if (!open) return () => document.body.classList.remove('drawer-open')
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); document.body.classList.remove('drawer-open') }
  }, [open])

  const t = open ? 0 : -1
  return (
    <div className="mnav">
      <header className={'m-top' + (hidden && !open ? ' hide' : '')}>
        <button className="icon-btn round-btn m-menu" onClick={() => setOpen((o) => !o)} aria-label="Menu" aria-expanded={open}>
          <Menu size={19} />
        </button>
        <span className="m-title">{current?.label || 'Life'}</span>
        <NavLink to="/profile" aria-label="Profile" className={({ isActive }) => 'm-profile' + (isActive ? ' active' : '')}>
          <Avatar size={30} />
        </NavLink>
      </header>

      <nav className="m-tabs" id="m-tabs-slot" aria-label="Sections" />

      <aside className={'m-drawer' + (open ? ' show' : '')} aria-label="Menu" aria-hidden={!open}>
        <Link to="/" className="m-drawer-title" tabIndex={t}>Life</Link>
        <div className="m-label">Pages</div>
        {order.map((s) => <Row key={s.path} s={s} counts={counts} tabIndex={t} />)}
        <hr />
        <NavLink to="/profile" tabIndex={t} className={({ isActive }) => 'm-row' + (isActive ? ' active' : '')}>
          <Avatar size={22} /><span className="grow">Profile</span>
        </NavLink>
        <div className="m-drawer-foot">
          <Link to="/profile#settings" className="icon-btn round-btn m-foot-btn" aria-label="Settings" tabIndex={t}><Settings size={19} /></Link>
          <Link to="/" className="btn m-foot-pill" tabIndex={t}><PenLine size={16} />Brain dump</Link>
        </div>
      </aside>
      <button className="m-shade" aria-label="Close menu" tabIndex={-1} onClick={() => setOpen(false)} />
    </div>
  )
}
