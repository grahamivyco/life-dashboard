import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Star, EyeOff, Eye, Home } from 'lucide-react'
import { supabase } from '../supabase.js'
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

// Where flats come from. The hourly sync reads each site's alert emails from Gmail.
const SOURCES = [
  { k: 'idealista', label: 'idealista', setup: 'https://www.idealista.com/en/alquiler-viviendas/barcelona-barcelona/', how: 'Saved search with instant email alerts' },
  { k: 'fotocasa', label: 'Fotocasa', setup: 'https://www.fotocasa.es/es/alquiler/viviendas/barcelona-capital/todas-las-zonas/l', how: 'Save the search, turn on email alerts' },
  { k: 'habitaclia', label: 'Habitaclia', setup: 'https://www.habitaclia.com/alquiler-barcelona.htm', how: 'Create an alert from the search' },
  { k: 'pisos', label: 'pisos.com', setup: 'https://www.pisos.com/alquiler/pisos-barcelona_capital/', how: 'Save the search with email alerts' },
  { k: 'badi', label: 'Badi', setup: 'https://badi.com/s/barcelona--spain', how: 'Rooms and flatshares; turn on email notifications' },
  { k: 'facebook', label: 'Facebook groups', setup: 'https://www.facebook.com/search/groups/?q=barcelona%20pisos%20alquiler', how: 'In each group: Notifications → All posts, email on' },
]
const sourceLabel = (k) => SOURCES.find((x) => x.k === k)?.label || k

export const DEFAULT_SPECS = { max_price: 1600, min_beds: 3, balcony: true, exterior: false, lift: false, ac: false, areas: [] }

export const specsSummary = (specs) => [
  specs.max_price && `Up to ${eur(specs.max_price)}`,
  specs.min_beds && `${specs.min_beds}+ bed`,
  ...['balcony', 'exterior', 'lift', 'ac'].filter((k) => specs[k]).map((k) => ({ balcony: 'Balcony', exterior: 'Exterior', lift: 'Lift', ac: 'A/C' })[k]),
  specs.areas?.length ? specs.areas.join(', ') : 'Anywhere in Barcelona',
].filter(Boolean).join(' · ')

// What a listing is missing against Graham's specs. Unknown details don't count against it.
export function misses(l, s) {
  const out = []
  if (s.max_price && l.price > s.max_price) out.push(`Over ${eur(s.max_price)}`)
  if (s.min_beds && l.kind === 'room') out.push('Room only')
  else if (s.min_beds && l.beds != null && l.beds < s.min_beds) out.push(`${l.beds} bed`)
  if (s.balcony && l.balcony !== true && l.terrace !== true && (l.balcony === false || l.terrace === false || l.outdoor === false)) out.push('No balcony')
  if (s.exterior && l.exterior === false) out.push('Interior')
  if (s.lift && l.lift === false) out.push('No lift')
  if (s.ac && l.ac === false) out.push('No A/C')
  if (s.areas?.length) {
    const where = `${l.area || ''} ${l.district || ''}`.toLowerCase()
    if (where.trim() && !s.areas.some((a) => where.includes(a.toLowerCase()))) out.push('Outside your areas')
  }
  return out
}

const median = (xs) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function Listing({ l, mark, onMark, miss }) {
  const isNew = !l.gone && Date.now() - new Date(l.first_seen).getTime() < 2 * DAY
  const drop = l.prev_price && l.prev_price > l.price
  const facts = [
    l.beds != null && `${l.beds} bed`,
    l.size_m2 && `${l.size_m2} m²`,
    l.floor && `Floor ${l.floor}`,
    l.size_m2 && `${eur(l.price / l.size_m2)}/m²`,
  ].filter(Boolean)
  const tags = [l.kind === 'room' && 'Room', l.balcony && 'Balcony', l.terrace && 'Terrace', l.exterior && 'Exterior', l.lift && 'Lift', l.ac && 'A/C'].filter(Boolean)

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
        {miss.length > 0 && <span className="home-miss">{miss.join(' · ')}</span>}
        <span className="meta">{sourceLabel(l.source || 'idealista')} · seen {ago(l.first_seen)}</span>
      </div>
    </li>
  )
}

// Specs are edited on Profile; here they show as a one-line summary.
function Specs({ specs }) {
  return (
    <Link to="/profile#housing" className="tile dump specs specs-link">
      <span className="specs-row">
        <span className="specs-label">Your specs</span>
        <span className="link">Edit in Profile</span>
      </span>
      <span className="meta specs-sum">{specsSummary(specs)}</span>
    </Link>
  )
}

function Sources({ all }) {
  const n = (k) => all.filter((l) => (l.source || 'idealista') === k).length
  return (
    <section className="tile">
      <div className="tile-head"><h2>Sources</h2><span className="meta">Read from alert emails every hour</span></div>
      <ul className="list">
        {SOURCES.map((x) => (
          <li key={x.k}>
            <span className="grow">{x.label} <span className="meta">{x.how}</span></span>
            {n(x.k) > 0 ? <span className="meta">{n(x.k)} {n(x.k) === 1 ? "flat" : "flats"}</span> : <a className="mini" href={x.setup} target="_blank" rel="noreferrer">Set up</a>}
          </li>
        ))}
      </ul>
    </section>
  )
}

export default function Housing() {
  const snap = useSnapshot('housing')
  const [view, setView] = useState('fits')
  const [specs, setSpecs] = useState(DEFAULT_SPECS)

  useEffect(() => {
    supabase.from('housing_profile').select('specs').limit(1)
      .then(({ data }) => { if (data?.[0]?.specs) setSpecs({ ...DEFAULT_SPECS, ...data[0].specs }) })
  }, [])

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
    if (view === 'fits') rows = rows.filter((l) => !l.gone && marks[l.id] !== 'hidden' && !misses(l, specs).length)
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
  }, [all, view, sort, marks, specs])

  const tracker = sections.find((s) => s.path === '/housing')?.tracker
  const actions = tracker && <a className="btn" href={tracker} target="_blank" rel="noreferrer">Tracker</a>

  if (!p) {
    return (
      <div className="page">
        <PageHeader title="Housing">{actions}</PageHeader>
        <Specs specs={specs} />
        <p className="empty">Flats from your alert emails appear here after the next sync.</p>
        <Sources all={[]} />
      </div>
    )
  }

  const weekNew = live.filter((l) => Date.now() - new Date(l.first_seen).getTime() < 7 * DAY)
  const prices = live.map((l) => l.price)
  const fits = live.filter((l) => marks[l.id] !== 'hidden' && !misses(l, specs).length)
  const used = [...new Set(all.map((l) => l.source || 'idealista'))].map(sourceLabel)
  const drops = live.filter((l) => l.prev_price && l.prev_price > l.price).length
  const count = (v) => ({
    fits: fits.length,
    new: weekNew.filter((l) => marks[l.id] !== 'hidden').length,
    all: all.filter((l) => marks[l.id] !== 'hidden').length,
    saved: all.filter((l) => marks[l.id] === 'saved').length,
    hidden: all.filter((l) => marks[l.id] === 'hidden').length,
  })[v]

  return (
    <div className="page">
      <PageHeader eyebrow={`${used.join(', ')} · updated ${ago(snap.synced_at)}`} title="Housing">{actions}</PageHeader>

      <div className="stats even">
        <div className="tile stat"><span className="eyebrow">Fit your specs</span><span className="big">{fits.length}</span></div>
        <div className="tile stat"><span className="eyebrow">New this week</span><span className="big">{weekNew.length}</span></div>
        <div className="tile stat"><span className="eyebrow">Median rent</span><span className="big">{prices.length ? eur(median(prices)) : '–'}</span></div>
        <div className="tile stat"><span className="eyebrow">Price drops</span><span className="big">{drops}</span></div>
      </div>

      <Specs specs={specs} />

      <div className="row between wrap gap">
        <div className="seg">
          {[['fits', 'Fits'], ['new', 'New'], ['all', 'All'], ['saved', 'Saved'], ['hidden', 'Hidden']].map(([k, label]) => (
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
          {shown.map((l) => <Listing key={l.id} l={l} mark={marks[l.id]} onMark={onMark} miss={misses(l, specs)} />)}
        </ul>
      ) : (
        <p className="empty">{view === 'saved' ? 'Star a flat to keep it here.' : view === 'new' ? 'Nothing new this week.' : view === 'fits' ? 'Nothing fits right now. Check All or loosen your specs.' : 'Nothing here.'}</p>
      )}

      <Sources all={all} />
    </div>
  )
}
