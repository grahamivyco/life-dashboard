import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// The one control row every page uses, right under the page title:
//   [tabs] [view menus]                     [round icon buttons] [one primary action]
// Tabs pick the page's section. Anything else that changes what's shown is a ViewMenu.
// Icon actions (refresh, sync, search) are RoundButtons. A page has at most one primary pill.
export function Controls({ children, end }) {
  return (
    <div className="controls">
      {children}
      {end && <div className="controls-end">{end}</div>}
    </div>
  )
}

// On a phone the tabs leave the page and become the floating bar at the bottom, as icons.
// phoneOnly: a page whose switch is a ViewMenu on desktop can still offer it in the bottom bar.
export function Tabs({ tabs, value, onPick, phoneOnly }) {
  const phone = useIsPhone()
  const slot = usePhoneSlot(phone)
  if (phone) {
    if (!slot) return null
    const on = tabs.find((t) => t.k === value)
    const title = document.getElementById('m-title-slot')
    const index = Math.max(0, tabs.indexOf(on))
    return <>{title && on && createPortal(on.title || on.label, title)}{createPortal(<><Pill i={index} n={tabs.length} />{tabs.map((t) => {
      const Icon = t.icon
      const on = value === t.k
      return (
        <button key={t.k} className={'m-tab' + (on ? ' active' : '')} aria-label={t.label} title={t.label}
          aria-pressed={on} onClick={() => onPick(t.k)}>
          <span className="nav-icon">
            {Icon?.props ? Icon : Icon ? <Icon size={20} strokeWidth={on ? 2.2 : 1.7} /> : <span className="m-tab-word">{t.label}</span>}
            {t.n ? <span className="badge">{t.n}</span> : null}
          </span>
        </button>
      )
    })}</>, slot)}</>
  }
  if (phoneOnly) return null
  return (
    <div className="seg tabs-seg" role="tablist">
      {tabs.map((t) => (
        <button key={t.k} role="tab" aria-pressed={value === t.k} aria-selected={value === t.k} onClick={() => onPick(t.k)}>
          {t.label}{t.n ? <span className="seg-n hot">{t.n}</span> : null}
        </button>
      ))}
    </div>
  )
}

// The highlight behind the current tab. It glides to the new tab and stretches like a drop on the way.
function Pill({ i, n }) {
  const ref = useRef(null)
  const last = useRef(i)
  useEffect(() => {
    if (last.current === i || !ref.current?.animate) { last.current = i; return }
    const far = Math.min(Math.abs(i - last.current), 3)
    last.current = i
    ref.current.animate(
      [{ scale: '1 1' }, { scale: `${1 + 0.18 * far} ${1 - 0.06 * far}`, offset: 0.4 }, { scale: '0.97 1.03', offset: 0.75 }, { scale: '1 1' }],
      { duration: 560, easing: 'cubic-bezier(.3, .7, .3, 1)' },
    )
  }, [i])
  return <span ref={ref} className="m-pill" style={{ '--i': i, '--n': n }} aria-hidden="true" />
}

const PHONE = '(max-width: 640px)'
export function useIsPhone() {
  const [phone, setPhone] = useState(() => window.matchMedia(PHONE).matches)
  useEffect(() => {
    const mq = window.matchMedia(PHONE)
    const on = () => setPhone(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return phone
}

// The bottom bar (MobileNav) and the page mount together, so look the bar up after mount.
function usePhoneSlot(phone) {
  const [slot, setSlot] = useState(null)
  useEffect(() => { setSlot(phone ? document.getElementById('m-tabs-slot') : null) }, [phone])
  return slot
}

export function RoundButton({ label, on, children, ...props }) {
  return <button className={'icon-btn round-btn' + (on ? ' on' : '')} aria-label={label} title={label} {...props}>{children}</button>
}

// What a whole page or view shows when it has nothing: a card with a short headline and one line.
// Inside a tile, a quiet <p className="empty"> line is enough.
export function Empty({ title, children }) {
  return <section className="tile empty-card"><b>{title}</b>{children && <span className="meta">{children}</span>}</section>
}
