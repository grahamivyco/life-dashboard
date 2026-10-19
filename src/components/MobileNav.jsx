import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, Link, useLocation } from 'react-router-dom'
import { Menu, Settings } from 'lucide-react'
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

  // iOS can misplace bottom-anchored fixed bars in the home-screen app after a scroll, so the bar and the
  // drawer card are placed from the top using the real screen height (--vh).
  useEffect(() => {
    const root = document.documentElement
    const set = () => {
      const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches
      const portrait = matchMedia('(orientation: portrait)').matches
      const { width, height } = window.screen
      const screenH = portrait ? Math.max(width, height) : Math.min(width, height)
      root.style.setProperty('--vh', `${standalone ? screenH : window.innerHeight}px`)
    }
    set()
    window.addEventListener('resize', set)
    window.addEventListener('orientationchange', set)
    return () => { window.removeEventListener('resize', set); window.removeEventListener('orientationchange', set) }
  }, [])

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

  // Open: the whole app becomes a card pushed to the right (kept at its scroll spot), the drawer sits behind it.
  // Close: the card slides back, then the page unlocks and scrolls to where it was.
  useEffect(() => {
    const body = document.body
    if (!open) return
    const y = window.scrollY
    body.style.setProperty('--sy', `${-y}px`)
    body.classList.add('drawer-lock')
    void body.offsetWidth // start the card from full screen so it shrinks into place
    body.classList.add('drawer-open')
    // Keep swipes on the card from scrolling or stretching the page underneath
    const stop = (e) => { if (!e.target.closest?.('.m-drawer')) e.preventDefault() }
    document.addEventListener('touchmove', stop, { passive: false })
    const meta = document.querySelector('meta[name=theme-color]')
    const before = meta?.content
    if (meta) meta.content = getComputedStyle(body).getPropertyValue('--menu-bg').trim() || before
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('touchmove', stop)
      body.classList.remove('drawer-open')
      if (meta) meta.content = before
      setTimeout(() => {
        if (body.classList.contains('drawer-open')) return
        body.classList.remove('drawer-lock')
        window.scrollTo(0, y)
      }, 420)
    }
  }, [open])

  const t = open ? 0 : -1
  return (
    <div className="mnav">
      <header className={'m-top' + (hidden && !open ? ' hide' : '')}>
        <button className="icon-btn round-btn m-menu" onClick={() => setOpen((o) => !o)} aria-label="Menu" aria-expanded={open}>
          <Menu size={19} />
        </button>
        <span className="m-title"><span className="m-title-page">{current?.label || 'Life'}</span><span id="m-title-slot" /></span>
        <NavLink to="/profile" aria-label="Profile" className={({ isActive }) => 'm-profile' + (isActive ? ' active' : '')}>
          <Avatar size={30} />
        </NavLink>
      </header>

      <nav className="m-tabs" id="m-tabs-slot" aria-label="Sections" />

      {createPortal(<>
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
        </div>
      </aside>
      <button className="m-shade" aria-label="Close menu" tabIndex={-1} onClick={() => setOpen(false)} />
      </>, document.body)}
    </div>
  )
}
