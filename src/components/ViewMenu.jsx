import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'

// Shows only the view that's on. Tapping it opens a short list of the others.
// options: [{ k, label, icon?, n?, hot? }]
export default function ViewMenu({ options, value, onPick, label = 'View' }) {
  const [open, setOpen] = useState(false)
  const [side, setSide] = useState('right')
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc) }
  }, [open])
  const on = options.find((o) => o.k === value) || options[0]
  const count = (o) => (o.n != null && o.n !== 0 ? <span className={'seg-n' + (o.hot ? ' hot' : '')}>{o.n}</span> : null)

  return (
    <div className="view-menu" ref={ref}>
      <button className="btn" aria-label={`${label}: ${on.label}`} aria-haspopup="menu" aria-expanded={open} onClick={() => {
        // Open toward whichever side has room, so the list never runs off the screen.
        const box = ref.current.getBoundingClientRect()
        setSide(box.right < 190 ? 'left' : 'right')
        setOpen(!open)
      }}>
        {on.icon}{on.label}{count(on)}<ChevronDown size={13} className="view-menu-chev" />
      </button>
      {open && (
        <div className={`view-menu-list ${side}`} role="menu">
          {options.map((o) => (
            <button key={o.k} role="menuitemradio" aria-checked={o.k === value} onClick={() => { setOpen(false); if (o.k !== value) onPick(o.k) }}>
              {o.icon}<span className="grow">{o.label}</span>{count(o)}{o.k === value && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
