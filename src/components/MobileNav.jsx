import { useEffect, useState } from 'react'
import { NavLink, Link, useLocation } from 'react-router-dom'
import { Menu, ChevronRight } from 'lucide-react'
import Mark from './Mark.jsx'
import { sections, settingsSection } from '../sections.js'

// Phone nav, Instagram style: compact top bar that hides on scroll down,
// a floating rounded tab bar with five tabs, and a More sheet for everything else.
const byPath = Object.fromEntries([...sections, settingsSection].map((s) => [s.path, s]))
const tabs = ['/', '/email', '/jobs', '/events', '/housing'].map((p) => byPath[p])
const more = ['/finances', '/clients', '/timeline', '/settings'].map((p) => byPath[p])

function Badge({ count }) {
  if (!count) return null
  return <span className="badge dot" aria-label={`${count} waiting`} />
}

export default function MobileNav({ counts }) {
  const { pathname } = useLocation()
  const [sheet, setSheet] = useState(false)
  const [hidden, setHidden] = useState(false)
  const current = byPath[pathname]
  const inMore = more.some((s) => s.path === pathname)

  useEffect(() => { setSheet(false); setHidden(false) }, [pathname])

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
    document.body.classList.toggle('sheet-open', sheet)
    return () => document.body.classList.remove('sheet-open')
  }, [sheet])

  return (
    <div className="mnav">
      <header className={'m-top' + (hidden ? ' hide' : '')}>
        <Link to="/" className="m-brand" aria-label="Today">
          <Mark size={24} />
          {pathname === '/' ? <span className="m-word">Life</span> : <span className="m-title">{current?.label || 'Life'}</span>}
        </Link>
      </header>

      <nav className="m-tabs" aria-label="Main">
        {tabs.map((s) => {
          const Icon = s.icon
          return (
            <NavLink key={s.path} to={s.path} end={s.path === '/'} aria-label={s.label}
              className={({ isActive }) => 'm-tab' + (isActive && !sheet ? ' active' : '')}>
              {({ isActive }) => (
                <span className="nav-icon">
                  <Icon size={22} strokeWidth={isActive && !sheet ? 2.25 : 1.6} />
                  <Badge count={s.badge ? counts[s.badge] : 0} />
                </span>
              )}
            </NavLink>
          )
        })}
        <button className={'m-tab' + (inMore || sheet ? ' active' : '')} onClick={() => setSheet((o) => !o)}
          aria-label="More" aria-expanded={sheet}>
          <span className="nav-icon"><Menu size={22} strokeWidth={inMore || sheet ? 2.25 : 1.6} /></span>
        </button>
      </nav>

      <div className={'m-scrim' + (sheet ? ' show' : '')} onClick={() => setSheet(false)} />
      <div className={'m-sheet' + (sheet ? ' show' : '')} role="dialog" aria-label="More" aria-hidden={!sheet}>
        <span className="m-grab" />
        {more.map((s) => {
          const Icon = s.icon
          return (
            <NavLink key={s.path} to={s.path} tabIndex={sheet ? 0 : -1}
              className={({ isActive }) => 'm-row' + (isActive ? ' active' : '')}>
              <Icon size={20} strokeWidth={1.75} />
              <span className="grow">{s.label}</span>
              <ChevronRight size={16} className="chev" />
            </NavLink>
          )
        })}
      </div>
    </div>
  )
}
