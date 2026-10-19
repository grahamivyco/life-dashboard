import { useMemo, useState } from 'react'
import { Star, EyeOff, Eye, Home, ExternalLink } from 'lucide-react'
import { useSnapshot } from '../useSnapshot.js'
import PageHeader from '../components/PageHeader.jsx'
import { ago } from '../lib.js'
import { sections } from '../sections.js'

const eur = (n) => new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
const DAY = 864e5

// Saved and hidden listings, remembered per device (like Skip on Email)
const MARKS_KEY = 'housing-marks'
const readMarks = () => { try { return JSON.parse(localStorage.getItem(MARKS_KEY) || '{}') } catch { return {} } }
const writeMarks = (m) => { try { localStorage.setItem(MARKS_KEY, JSON.stringify(m)) } catch { /* ignore */ } }

const median = (xs) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function Listing({ l, mark, onMark }) {
  const isNew = !l.gone && Date.now() - new Date(l.first_seen).getTime() < 2 * DAY
  const drop = l.prev_price && l.prev_price > l.price
  const facts = [
    l.beds != null && `${l.beds} bed`,
    l.size_m2 && `${l.size_m2} m²`,
    l.floor && `Floor ${l.floor}`,
    l.size_m2 && `${eur(l.price / l.size_m2)}/m²`,
  ].filter(Boolean)
  const tags = [l.balcony && 'Balcony', l.terrace && 'Terrace', l.exterior && 'Exterior', l.lift && 'Lift', l.ac && 'A/C'].filter(Boolean)

  return (
    <li className={'tile home' + (l.gone ? ' gone' : '')}>
      <a className="home-photo" href={l.url} target="_blank" rel="noreferrer">
        {l.photo ? <img src={l.photo} alt="" loading="lazy" /> : <Home size={22} strokeWidth={1.5} />}
        {isNew && <span className="home-flag">New</span>}
        {l.gone && <span className="home-flag muted-flag">No longer listed</span>}
      </a>
      <div className="home-body">
        <div className="row between">
          <div className="home-price">
            <span className="big">{eur(l.price)}</span><span className="meta">/month</span>
            {drop && <span className="was">{eur(l.prev_price)}</span>}
          </div>
          <div className="row">
            <button className={'icon-btn' + (mark === 'saved' ? ' on' : '')} title={mark === 'saved' ? 'Unsave' : 'Save'} onClick={() => onMark(l.id, mark === 'saved' ? null : 'saved')}>
              <Star size={16} strokeWidth={1.75} fill={mark === 'saved' ? 'currentColor' : 'none'} />
            </button>
            <button className="icon-btn" title={mark === 'hidden' ? 'Show again' : 'Hide'} onClick={() => onMark(l.id, mark === 'hidden' ? null : 'hidden')}>
              {mark === 'hidden' ? <Eye size={16} strokeWidth={1.75} /> : <EyeOff size={16} strokeWidth={1.75} />}
            </button>
          </div>
        </div>
        <a className="home-title clamp" href={l.url} target="_blank" rel="noreferrer">{l.street || l.title}</a>
        <span className="meta clamp">{[l.area, l.district].filter(Boolean).join(', ')}</span>
        {facts.length > 0 && <span className="home-facts">{facts.join(' · ')}</span>}
        {(tags.length > 0 || drop) && (
          <div className="home-tags">
            {drop && <span className="tag">Down {eur(l.prev_price - l.price)}</span>}
            {tags.map((t) => <span key={t} className="pill">{t}</span>)}
          </div>
        )}
        <span className="meta">Seen {ago(l.first_seen)}</span>
      </div>
    </li>
  )
}

export default function Housing() {
  const snap = useSnapshot('housing')
  const [view, setView] = useState('new')
  const [sort, setSort] = useState('newest')
  const [marks, setMarks] = useState(readMarks)

  const onMark = (id, value) => {
    const next = { ...marks }
    if (value) next[id] = value
    else delete next[id]
    setMarks(next)
    writeMarks(next)
  }

  const p = snap?.payload
  const all = p?.listings || []
  const live = all.filter((l) => !l.gone)

  const shown = useMemo(() => {
    let rows = all
    if (view === 'new') rows = rows.filter((l) => !l.gone && marks[l.id] !== 'hidden' && Date.now() - new Date(l.first_seen).getTime() < 7 * DAY)
    if (view === 'all') rows = rows.filter((l) => marks[l.id] !== 'hidden')
    if (view === 'saved') rows = rows.filter((l) => marks[l.id] === 'saved')
    if (view === 'hidden') rows = rows.filter((l) => marks[l.id] === 'hidden')
    const by = {
      newest: (a, b) => new Date(b.first_seen) - new Date(a.first_seen),
      cheapest: (a, b) => a.price - b.price,
      size: (a, b) => (b.size_m2 || 0) - (a.size_m2 || 0),
    }[sort]
    return [...rows].sort((a, b) => (a.gone - b.gone) || by(a, b))
  }, [all, view, sort, marks])

  const tracker = sections.find((s) => s.path === '/housing')?.tracker
  const actions = (
    <>
      {p?.search?.url && <a className="btn" href={p.search.url} target="_blank" rel="noreferrer">Open search <ExternalLink size={13} /></a>}
      {tracker && <a className="btn" href={tracker} target="_blank" rel="noreferrer">Tracker</a>}
    </>
  )

  if (!p) {
    return (
      <div className="page">
        <PageHeader title="Housing">{actions}</PageHeader>
        <p className="empty">Flats from your idealista alerts appear here after the next sync.</p>
      </div>
    )
  }

  const weekNew = live.filter((l) => Date.now() - new Date(l.first_seen).getTime() < 7 * DAY)
  const prices = live.map((l) => l.price)
  const perM2 = live.filter((l) => l.size_m2).map((l) => l.price / l.size_m2)
  const drops = live.filter((l) => l.prev_price && l.prev_price > l.price).length
  const count = (v) => ({
    new: weekNew.filter((l) => marks[l.id] !== 'hidden').length,
    all: all.filter((l) => marks[l.id] !== 'hidden').length,
    saved: all.filter((l) => marks[l.id] === 'saved').length,
    hidden: all.filter((l) => marks[l.id] === 'hidden').length,
  })[v]

  return (
    <div className="page">
      <PageHeader eyebrow={`idealista · updated ${ago(snap.synced_at)}`} title="Housing">{actions}</PageHeader>

      <div className="stats even">
        <div className="tile stat"><span className="eyebrow">New this week</span><span className="big">{weekNew.length}</span></div>
        <div className="tile stat"><span className="eyebrow">Median rent</span><span className="big">{prices.length ? eur(median(prices)) : '–'}</span></div>
        <div className="tile stat"><span className="eyebrow">Median €/m²</span><span className="big">{perM2.length ? eur(median(perM2)) : '–'}</span></div>
        <div className="tile stat"><span className="eyebrow">Price drops</span><span className="big">{drops}</span></div>
      </div>

      {p.search?.label && <p className="hint">Search: {p.search.label}</p>}

      <div className="row between wrap gap">
        <div className="seg">
          {[['new', 'New'], ['all', 'All'], ['saved', 'Saved'], ['hidden', 'Hidden']].map(([k, label]) => (
            (k !== 'hidden' || count('hidden') > 0) && (
              <button key={k} aria-pressed={view === k} onClick={() => setView(k)}>{label} <span className="seg-n">{count(k)}</span></button>
            )
          ))}
        </div>
        <div className="seg">
          {[['newest', 'Newest'], ['cheapest', 'Cheapest'], ['size', 'Biggest']].map(([k, label]) => (
            <button key={k} aria-pressed={sort === k} onClick={() => setSort(k)}>{label}</button>
          ))}
        </div>
      </div>

      {shown.length ? (
        <ul className="homes">
          {shown.map((l) => <Listing key={l.id} l={l} mark={marks[l.id]} onMark={onMark} />)}
        </ul>
      ) : (
        <p className="empty">{view === 'saved' ? 'Star a flat to keep it here.' : view === 'new' ? 'Nothing new this week.' : 'Nothing here.'}</p>
      )}
    </div>
  )
}
