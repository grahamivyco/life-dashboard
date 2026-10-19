import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Check, ChevronDown, ChevronLeft, ChevronRight, ExternalLink, RefreshCw, Search, Trash2 } from 'lucide-react'
import PageHeader from '../components/PageHeader.jsx'
import { ago } from '../lib.js'
import { amt, makeKey, usd, useMoney } from '../money.js'
import { cancelGuide } from '../subscriptions.js'

const TABS = [
  ['overview', 'Overview'], ['spending', 'Spending'],
  ['transactions', 'Transactions'], ['accounts', 'Accounts'],
]
const GROUPS = [
  ['checking', 'Checking'], ['card', 'Cards'], ['savings', 'Savings'], ['investments', 'Investments'], ['loan', 'Loans'],
]

const day = (iso, opts = { month: 'short', day: 'numeric' }) => new Date(iso + 'T12:00').toLocaleDateString('en-US', opts)
const daysFrom = (iso) => Math.round((new Date(iso + 'T12:00') - new Date(new Date().toDateString() + ' 12:00')) / 86400000)
const when = (iso) => {
  const n = daysFrom(iso)
  return n === 0 ? 'today' : n === 1 ? 'tomorrow' : n < 0 ? `${-n} days ago` : `in ${n} days`
}

// A line chart in ink. `dashed` draws a second series (last month) in the muted tone.
// Hover (or drag on a phone) shows the date and amount under the pointer.
function Line({ values, dashed, labels = [], height = 120, max, fromZero, dashedName = 'Last month' }) {
  const [at, setAt] = useState(null)
  const w = 600
  const top = max ?? Math.max(...values, ...(dashed || []), 1)
  const low = Math.min(...values, ...(dashed || []))
  const bottom = fromZero ? Math.min(0, low) : low - (top - low) * 0.15
  const n = Math.max(values.length, dashed?.length || 0, 2)
  const x = (i) => (i / (n - 1)) * w
  const y = (v) => height - ((v - bottom) / (top - bottom || 1)) * (height - 6) - 3
  const pts = (vs) => vs.map((v, i) => `${x(i)},${y(v)}`).join(' ')
  const move = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    setAt(Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1)))))
  }
  const v = at != null ? values[at] : null
  const d = at != null && dashed ? dashed[at] : null
  return (
    <div className="fin-chart" onPointerMove={move} onPointerDown={move} onPointerLeave={() => setAt(null)}>
      <svg className="fin-line" viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        {dashed && <polyline points={pts(dashed)} className="fin-line-ghost" />}
        <polygon points={`0,${height} ${pts(values)} ${x(values.length - 1)},${height}`} className="fin-line-fill" />
        <polyline points={pts(values)} className="fin-line-ink" />
        {at != null && <line x1={x(at)} x2={x(at)} y1="0" y2={height} className="fin-line-cursor" />}
      </svg>
      {at != null && (v != null || d != null) && (
        <>
          {v != null && <span className="fin-dot" style={{ left: `${(at / (n - 1)) * 100}%`, top: y(v) }} />}
          <div className={'fin-tip' + (at > (n - 1) / 2 ? ' left' : '')} style={{ left: `${(at / (n - 1)) * 100}%` }}>
            <span className="meta">{labels[at] || ''}</span>
            {v != null && <b>{usd(v)}</b>}
            {d != null && <span className="meta">{dashedName} {usd(d)}</span>}
          </div>
        </>
      )}
    </div>
  )
}

function Bar({ share }) {
  return <span className="fin-bar"><i style={{ width: `${Math.max(2, Math.min(100, share * 100))}%` }} /></span>
}

function CategoryPick({ value, categories, onPick }) {
  return (
    <select className="fin-select" value={value} onChange={(e) => onPick(e.target.value)}>
      {[...new Set([value, ...categories])].map((c) => <option key={c}>{c}</option>)}
    </select>
  )
}

// ---------- Overview ----------

const RANGES = [['1m', 30], ['3m', 90], ['6m', 180], ['1y', 365]]

function Overview({ p, go }) {
  const [range, setRange] = useState('3m')
  const d = p.dashboard
  const b = d.balances
  const hist = p.net_worth.history.slice(-RANGES.find((r) => r[0] === range)[1])
  const monthAgo = p.net_worth.history.at(-31)?.value
  const change = monthAgo != null ? b.net_worth - monthAgo : null
  const diff = d.pace.spent - d.pace.last_month_same_day
  const upcoming = d.recurring.filter((r) => !r.ignored && daysFrom(r.next_date) >= -3 && daysFrom(r.next_date) <= 30)
    .sort((a, z) => a.next_date.localeCompare(z.next_date))
  const lowest = d.forecast.lowest

  return (
    <>
      <div className="stats even fin-stats">
        <div className="tile stat lead">
          <span className="eyebrow">Net worth</span>
          <span className="big">{usd(b.net_worth)}</span>
          {change != null && <span className="meta">{change >= 0 ? 'Up' : 'Down'} {usd(Math.abs(change))} in a month</span>}
        </div>
        <button className="tile stat fin-link" onClick={() => go('spending')}>
          <span className="eyebrow">Spent this month</span>
          <span className="big">{usd(d.pace.spent)}</span>
          <span className="meta">{usd(Math.abs(diff))} {diff <= 0 ? 'under' : 'over'} last month so far</span>
        </button>
        <div className="tile stat">
          <span className="eyebrow">Cash in 30 days</span>
          <span className="big">{usd(d.forecast.end)}</span>
          <span className="meta">Lowest {usd(lowest.value)} on {day(lowest.date)}</span>
        </div>
        <div className="tile stat">
          <span className="eyebrow">Net cash</span>
          <span className="big">{usd(b.net_cash)}</span>
          <span className="meta">Checking minus cards</span>
        </div>
      </div>

      {d.needs_attention?.length > 0 && <p className="note fin-alert">Reconnect in the Mac app: {d.needs_attention.join(', ')}</p>}

      <div className="grid two">
        <section className="tile">
          <div className="tile-head">
            <h2>Net worth</h2>
            <div className="seg">
              {RANGES.map(([k]) => <button key={k} aria-pressed={range === k} onClick={() => setRange(k)}>{k.toUpperCase()}</button>)}
            </div>
          </div>
          <Line values={hist.map((h) => h.value)} labels={hist.map((h) => day(h.date, { weekday: 'short', month: 'short', day: 'numeric' }))} />
          <div className="row between meta"><span>{hist[0] && day(hist[0].date)}</span><span>Today</span></div>
        </section>

        <section className="tile">
          <div className="tile-head"><h2>Spending pace</h2><span className="meta">This month vs last</span></div>
          <Line values={d.pace.this_month} dashed={d.pace.last_month} fromZero dashedName="Last month by then"
            labels={Array.from({ length: d.pace.days_in_month }, (_, i) => `${new Date().toLocaleDateString('en-US', { month: 'short' })} ${i + 1}`)} />
          <div className="row gap meta fin-legend"><span><i className="ink" />This month</span><span><i className="ghost" />Last month</span></div>
        </section>
      </div>

      <div className="grid two">
        <section className="tile">
          <div className="tile-head"><h2>Accounts</h2><button className="mini" onClick={() => go('accounts')}>All accounts</button></div>
          <ul className="list">
            {[['Checking', b.checking], ['Cards owed', b.card], ['Net cash', b.net_cash], ['Savings', b.savings], ['Investments', b.investments], ...(b.loan ? [['Loans', b.loan]] : [])]
              .map(([k, v]) => <li key={k}><span className="grow">{k}</span><span className="num">{usd(v, 2)}</span></li>)}
          </ul>
        </section>

        <section className="tile">
          <div className="tile-head"><h2>Coming up</h2><button className="mini" onClick={() => go('spending', 'fin-recurring')}>All bills</button></div>
          {upcoming.length === 0 && <p className="empty">Nothing due in the next 30 days.</p>}
          <ul className="list">
            {upcoming.slice(0, 7).map((r) => (
              <li key={r.key}>
                <span className="grow clamp">{r.name} <span className="meta">{when(r.next_date)}</span></span>
                <span className={'num' + (r.kind === 'income' ? ' pos' : '')}>{r.kind === 'income' ? '+' : ''}{usd(r.amount, 2)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="tile">
        <div className="tile-head"><h2>Recent</h2><button className="mini" onClick={() => go('transactions')}>All transactions</button></div>
        <TxnList txns={d.recent} p={p} compact />
      </section>
    </>
  )
}

// ---------- Spending ----------

const PERIODS = [['week', 'Week'], ['month', 'Month'], ['quarter', 'Quarter'], ['year', 'Year']]

function PeriodMenu({ value, onPick }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])
  return (
    <div className="fin-menu" ref={ref}>
      <button className="btn sm" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        {PERIODS.find(([k]) => k === value)[1]} <ChevronDown size={13} />
      </button>
      {open && (
        <div className="fin-menu-list" role="menu">
          {PERIODS.map(([k, label]) => (
            <button key={k} role="menuitemradio" aria-checked={k === value} onClick={() => { setOpen(false); onPick(k) }}>
              {label}{k === value && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Spending({ p, send }) {
  const [period, setPeriod] = useState('month')
  const [offset, setOffset] = useState(0)
  const [byStore, setByStore] = useState(false)
  const s = p.spending[`${period}:${offset}`]
  const older = !!p.spending[`${period}:${offset + 1}`]
  const maxSpent = Math.max(...s.history.map((h) => h.spent), 1)
  const rows = byStore ? s.merchants.slice(0, 12) : s.categories
  const moves = Object.entries(s.moves || {}).filter(([, v]) => v > 0)

  return (
    <>
      <div className="row between gap fin-periodbar">
        <div className="row gap">
          <button className="icon-btn" aria-label="Earlier" disabled={!older} onClick={() => setOffset(offset + 1)}><ChevronLeft size={16} /></button>
          <span className="fin-period">{s.title}</span>
          <button className="icon-btn" aria-label="Later" disabled={offset === 0} onClick={() => setOffset(offset - 1)}><ChevronRight size={16} /></button>
        </div>
        <PeriodMenu value={period} onPick={(k) => { setPeriod(k); setOffset(0) }} />
      </div>

      <div className="stats even fin-stats">
        <div className="tile stat lead"><span className="eyebrow">Spent</span><span className="big">{usd(s.spent)}</span></div>
        <div className="tile stat"><span className="eyebrow">Came in</span><span className="big">{usd(s.income)}</span></div>
        <div className="tile stat"><span className="eyebrow">Left over</span><span className="big">{s.net < 0 ? '−' : ''}{usd(Math.abs(s.net))}</span></div>
        <div className="tile stat"><span className="eyebrow">Refunds</span><span className="big">{usd(s.refunds?.total)}</span></div>
      </div>

      <section className="tile">
        <div className="fin-hist">
          {s.history.map((h) => {
            const k = -h.offset
            const on = k === offset
            return (
              <button key={h.offset} className={'fin-hist-col' + (on ? ' on' : '')} disabled={!p.spending[`${period}:${k}`]}
                onClick={() => setOffset(k)} title={`${h.label}: ${usd(h.spent)}`}>
                <span className="fin-hist-bar"><i style={{ height: `${(h.spent / maxSpent) * 100}%` }} /></span>
                <span className="meta">{h.label}</span>
              </button>
            )
          })}
        </div>
      </section>

      <div className="grid two">
        <section className="tile">
          <div className="tile-head">
            <h2>Where it went</h2>
            <div className="seg">
              <button aria-pressed={!byStore} onClick={() => setByStore(false)}>Category</button>
              <button aria-pressed={byStore} onClick={() => setByStore(true)}>Store</button>
            </div>
          </div>
          <ul className="list">
            {rows.map((c) => (
              <li key={c.name} className="fin-share">
                <span className="grow clamp">{c.name}</span>
                <Bar share={c.share} />
                <span className="num">{usd(c.spent)}</span>
              </li>
            ))}
          </ul>
          {moves.length > 0 && (
            <p className="meta fin-moves">Not counted as spending: {moves.map(([k, v]) => `${k} ${usd(v)}`).join(' · ')}</p>
          )}
        </section>

        <div className="fin-stack">
          {period === 'month' && offset === 0 && <Budget b={p.budget} send={send} />}
          {offset === 0 && s.needs_sorting?.length > 0 && (
            <section className="tile">
              <div className="tile-head"><h2>Needs a category</h2><span className="meta">{s.needs_sorting.length}</span></div>
              <ul className="list">
                {s.needs_sorting.slice(0, 8).map((t) => (
                  <li key={t.transaction_id} className="fin-sort">
                    <span className="grow clamp">{t.name} <span className="meta">{day(t.date)}</span></span>
                    <span className="num">{amt(t.amount)}</span>
                    <CategoryPick value={t.category} categories={p.categories}
                      onPick={(c) => send('POST', `/api/transactions/${t.transaction_id}/category`, { category: c }, 'Saving category')} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      <Recurring p={p} send={send} />
    </>
  )
}

function Budget({ b, send }) {
  const [edit, setEdit] = useState(false)
  const save = (v) => { setEdit(false); send('PUT', '/api/budget', { amount: v === '' ? null : Number(v) }, 'Saving budget') }
  return (
    <section className="tile">
      <div className="tile-head"><h2>{b.month} budget</h2><button className="mini" onClick={() => setEdit(!edit)}>{b.budget ? 'Change' : 'Set one'}</button></div>
      {edit && (
        <input className="fin-input" type="number" inputMode="decimal" autoFocus defaultValue={b.budget || ''} placeholder="Monthly budget"
          onBlur={(e) => save(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEdit(false) }} />
      )}
      {b.budget ? (
        <>
          <div className="fin-progress"><i style={{ width: `${Math.min(100, (b.spent / b.budget) * 100)}%` }} /><b style={{ left: `${b.month_progress * 100}%` }} /></div>
          <div className="row between meta">
            <span>{usd(b.spent)} of {usd(b.budget)}</span>
            <span className={b.left < 0 ? 'needs' : ''}>{b.left < 0 ? `${usd(-b.left)} over` : `${usd(b.left)} left`}</span>
          </div>
        </>
      ) : !edit && <p className="empty">{usd(b.spent)} spent so far. Set a budget to track it.</p>}
    </section>
  )
}

// ---------- Recurring ----------

function Recurring({ p, send }) {
  const [open, setOpen] = useState(null)
  const [showIgnored, setShowIgnored] = useState(false)
  const all = p.recurring
  const live = all.filter((r) => !r.ignored).sort((a, z) => a.next_date.localeCompare(z.next_date))
  const ignored = all.filter((r) => r.ignored)
  const bills = live.filter((r) => r.kind === 'bill')
  const income = live.filter((r) => r.kind === 'income')
  const perMonth = (rs) => rs.reduce((t, r) => t + r.per_month, 0)
  const forecast = p.dashboard.forecast

  const row = (r) => {
    const isOpen = open === r.key
    const g = r.kind === 'bill' ? cancelGuide(r.name) : null
    return (
      <li key={r.key} className={'sub' + (isOpen ? ' open' : '')}>
        <button className="sub-head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : r.key)}>
          <ChevronRight size={15} className="chev" />
          <span className="grow clamp">{r.name} <span className="meta">{when(r.next_date)}</span></span>
          <span className={'num' + (r.kind === 'income' ? ' pos' : '')}>{r.varies ? '~' : ''}{usd(r.amount, 2)}</span>
        </button>
        {isOpen && (
          <div className="sub-body">
            <p className="meta">{r.frequency[0].toUpperCase() + r.frequency.slice(1)} · {r.category} · last {day(r.last_date)} · next {day(r.next_date, { weekday: 'short', month: 'short', day: 'numeric' })}</p>
            {g && <ol className="steps">{g.steps.map((st) => <li key={st}>{st}</li>)}</ol>}
            <div className="row gap wrap">
              {g && <a className="btn" href={g.url} target="_blank" rel="noreferrer">{g.search ? 'Find cancel page' : 'Manage or cancel'} <ExternalLink size={12} /></a>}
              {!r.manual && <button className="btn" onClick={() => { setOpen(null); send('POST', '/api/recurring/ignore', { key: r.key, ignored: true }, 'Hiding') }}>Not recurring</button>}
            </div>
          </div>
        )}
      </li>
    )
  }

  return (
    <div id="fin-recurring" className="fin-recurring">
      <div className="tile-head">
        <h2>Recurring</h2>
        <span className="meta">{forecast.next_payday ? `${usd(forecast.safe_to_spend)} safe to spend before payday ${day(forecast.next_payday)}` : `${usd(forecast.safe_to_spend)} safe to spend`}</span>
      </div>
      <div className="grid two">
        <section className="tile">
          <div className="tile-head"><h2>Bills</h2><span className="meta">{usd(perMonth(bills))} a month</span></div>
          <ul className="list">{bills.map(row)}</ul>
          {ignored.length > 0 && <button className="mini more" onClick={() => setShowIgnored(!showIgnored)}>{showIgnored ? 'Done' : `${ignored.length} hidden`}</button>}
          {showIgnored && (
            <ul className="list">
              {ignored.map((r) => (
                <li key={r.key} className="sub-hidden">
                  <span className="grow">{r.name}</span>
                  <button className="mini" onClick={() => send('POST', '/api/recurring/ignore', { key: r.key, ignored: false }, 'Showing again')}>Show again</button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="tile">
          <div className="tile-head"><h2>Income</h2><span className="meta">{usd(perMonth(income))} a month</span></div>
          <ul className="list">{income.map(row)}</ul>
        </section>
      </div>
    </div>
  )
}

// ---------- Transactions ----------

function accountLabel(p) {
  const by = {}
  for (const a of p.accounts.accounts) by[a.account_id] = a.mask ? `${a.name} ${a.mask}` : a.name
  return by
}

function TxnList({ txns, p, send, compact }) {
  const [open, setOpen] = useState(null)
  const label = useMemo(() => accountLabel(p), [p])
  let last = ''
  return (
    <ul className="list fin-txns">
      {txns.map((t) => {
        const head = !compact && t.date !== last ? (last = t.date, day(t.date, { weekday: 'short', month: 'short', day: 'numeric' })) : null
        const isOpen = open === t.transaction_id
        return [
          head && <li key={'d' + t.date} className="fin-day">{head}</li>,
          <li key={t.transaction_id} className={'sub' + (isOpen ? ' open' : '') + (t.hidden ? ' fin-hidden' : '')}>
            <button className="sub-head" disabled={!send} aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : t.transaction_id)}>
              <span className="grow clamp"><span className="fin-name">{t.name}{t.pending ? <span className="pill">Pending</span> : null}</span>
                <span className="meta fin-sub">{t.category}{t.bought ? ` · ${t.bought}` : ''} · {label[t.account_id] || 'Account'}{compact ? ` · ${day(t.date)}` : ''}</span>
              </span>
              <span className={'num' + (t.amount < 0 ? ' pos' : '')}>{amt(t.amount)}</span>
            </button>
            {isOpen && <TxnDetail t={t} p={p} send={send} done={() => setOpen(null)} />}
          </li>,
        ]
      })}
    </ul>
  )
}

function TxnDetail({ t, p, send, done }) {
  const [category, setCategory] = useState(t.category)
  const [always, setAlways] = useState(false)
  const [name, setName] = useState(t.name_override || '')
  const [note, setNote] = useState(t.note || '')
  const store = t.merchant || t.description

  const save = () => {
    if (category !== t.category || always) {
      send('POST', `/api/transactions/${t.transaction_id}/category`, { category, make_rule: always, match_text: store }, 'Saving category')
    }
    const patch = {}
    if (name !== (t.name_override || '')) patch.name_override = name
    if (note !== (t.note || '')) patch.note = note
    if (Object.keys(patch).length) send('PATCH', `/api/transactions/${t.transaction_id}`, patch, 'Saving')
    done()
  }

  return (
    <div className="sub-body fin-detail">
      <p className="meta">{t.description}{t.note ? ` · ${t.note}` : ''}</p>
      <label className="fin-field"><span>Category</span><CategoryPick value={category} categories={p.categories} onPick={setCategory} /></label>
      <label className="row gap hint"><input type="checkbox" checked={always} onChange={(e) => setAlways(e.target.checked)} /> Always use this for “{store}”</label>
      <label className="fin-field"><span>Name</span><input className="fin-input" value={name} placeholder={t.merchant || t.description} onChange={(e) => setName(e.target.value)} /></label>
      <label className="fin-field"><span>Note</span><input className="fin-input" value={note} onChange={(e) => setNote(e.target.value)} /></label>
      <div className="row gap wrap">
        <button className="btn primary sm" onClick={save}>Save</button>
        <button className="btn sm" onClick={() => { send('PATCH', `/api/transactions/${t.transaction_id}`, { hidden: !t.hidden }, 'Saving'); done() }}>
          {t.hidden ? 'Count in spending' : 'Leave out of spending'}
        </button>
      </div>
    </div>
  )
}

function Transactions({ p, send }) {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [shown, setShown] = useState(150)
  const found = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean)
    return p.transactions.filter((t) => (!cat || t.category === cat) && words.every((w) =>
      [t.name, t.description, t.merchant, t.note, t.category, t.bought, String(t.amount)].some((f) => f && String(f).toLowerCase().includes(w))))
  }, [p, q, cat])
  const total = found.reduce((s, t) => s + (t.spending ? t.amount : 0), 0)

  return (
    <section className="tile">
      <div className="row gap wrap fin-filters">
        <label className="fin-search"><Search size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search stores, notes, Amazon items" /></label>
        <select className="fin-select" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">All categories</option>
          {p.categories.map((c) => <option key={c}>{c}</option>)}
        </select>
        {(q || cat) && <span className="meta">{found.length} found · {usd(total, 2)} spent</span>}
      </div>
      <TxnList txns={found.slice(0, shown)} p={p} send={send} />
      {found.length > shown && <button className="mini more" onClick={() => setShown(shown + 300)}>Show more</button>}
      {found.length === 0 && <p className="empty">Nothing matches.</p>}
    </section>
  )
}

// ---------- Accounts ----------

function Accounts({ p, send, publishedAt }) {
  const accounts = p.accounts.accounts
  const groups = GROUPS.map(([k, label]) => [label, accounts.filter((a) => a.group === k)]).filter(([, a]) => a.length)
  const rules = p.rules.rules

  return (
    <>
      <section className="tile">
        <div className="tile-head"><h2>Accounts</h2><span className="meta">{p.accounts.last_synced ? `Banks synced ${ago(p.accounts.last_synced)}` : ''}</span></div>
        {groups.map(([label, list]) => (
          <div key={label} className="acct-group">
            <div className="row between acct-head"><span className="eyebrow">{label}</span><span className="meta">{usd(list.filter((a) => !a.hidden).reduce((t, a) => t + (a.current_balance || 0), 0), 2)}</span></div>
            <ul className="list">
              {list.map((a) => (
                <li key={a.account_id} className={a.hidden ? 'fin-hidden' : ''}>
                  <span className="grow clamp">{a.name}{a.mask ? ` ${a.mask}` : ''} <span className="meta">{a.institution}</span>
                    {a.last_error && <span className="meta needs fin-sub">{a.last_error}</span>}
                  </span>
                  <span className="num">{a.current_balance == null ? 'Balance unknown' : usd(a.current_balance, 2)}</span>
                  <button className="mini" onClick={() => send('POST', `/api/accounts/${a.account_id}/hidden`, { hidden: !a.hidden }, 'Saving')}>
                    {a.hidden ? 'Count it' : 'Leave out'}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <p className="meta fin-moves">Link a new bank in the Money app on your Mac. Apple Card comes from YNAB.</p>
      </section>

      <div className="grid two">
        {p.holdings.length > 0 && (
          <section className="tile">
            <div className="tile-head"><h2>Investments</h2><span className="meta">{usd(p.holdings.reduce((t, h) => t + h.value, 0))}</span></div>
            <ul className="list">
              {p.holdings.map((h) => (
                <li key={h.account_id + h.security_id}>
                  <span className="grow clamp">{h.ticker || h.name} <span className="meta">{h.quantity} @ {usd(h.price, 2)}</span></span>
                  <span className="num">{usd(h.value)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section className="tile">
          <div className="tile-head"><h2>Sorting rules</h2><span className="meta">First match wins</span></div>
          <ul className="list">
            {rules.map((r) => (
              <li key={r.line}>
                <span className="grow clamp">{r.text}{r.op ? ` ${r.op} ${usd(r.amount)}` : ''} <span className="meta">→ {r.category}</span></span>
                <button className="icon-btn" aria-label="Delete rule" onClick={() => send('POST', '/api/rules/delete', { line: r.line, expected: r.raw }, 'Deleting rule')}><Trash2 size={14} /></button>
              </li>
            ))}
          </ul>
          <p className="meta fin-moves">New rules come from “Always use this” on a transaction.</p>
        </section>
      </div>

      <MacLink publishedAt={publishedAt} />
    </>
  )
}

function MacLink({ publishedAt, first }) {
  const [key, setKey] = useState('')
  const [err, setErr] = useState('')
  const cmd = `cd ~/life-dashboard/mac && git pull && python3 -m money --dashboard-key ${key}`
  return (
    <section className={'tile' + (first ? ' fin-setup' : '')}>
      <div className="tile-head"><h2>{first ? 'Connect your Mac' : 'Your Mac'}</h2>{publishedAt && <span className="meta">Last update {ago(publishedAt)}</span>}</div>
      {first && (
        <ol className="steps">
          <li>Finances come from the Money app on your Mac: Plaid for banks, YNAB for Apple Card.</li>
          <li>Make a key here, then paste the command into Terminal.</li>
          <li>Run <code>python3 -m money</code> in the same folder. Numbers show up here within a minute.</li>
        </ol>
      )}
      {key ? (
        <>
          <pre className="fin-cmd">{cmd}</pre>
          <div className="row gap"><button className="btn sm" onClick={() => navigator.clipboard?.writeText(cmd)}>Copy</button><span className="meta">Shown once. Make a new one any time.</span></div>
        </>
      ) : (
        <button className={'btn sm' + (first ? ' primary' : '')} onClick={() => makeKey().then(setKey, (e) => setErr(e.message))}>{first ? 'Make a key' : 'Make a new key'}</button>
      )}
      {err && <p className="meta needs">{err}</p>}
    </section>
  )
}

// ---------- Page ----------

export default function Finances() {
  const { snap, pending, error, clearError, send } = useMoney()
  const [params, setParams] = useSearchParams()
  const asked = params.get('tab') === 'recurring' ? 'spending' : params.get('tab')
  const tab = TABS.some(([k]) => k === asked) ? asked : 'overview'
  const go = (k, anchor) => {
    setParams(k === 'overview' ? {} : { tab: k }, { replace: true })
    if (anchor) setTimeout(() => document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth' }), 50)
    else window.scrollTo(0, 0)
  }

  if (snap === undefined) return <div className="page"><PageHeader title="Finances" /></div>
  if (snap === null) {
    return (
      <div className="page">
        <PageHeader title="Finances" />
        <MacLink first />
      </div>
    )
  }

  const p = snap.payload
  const waiting = pending.length > 0
  const slow = pending.some((x) => Date.now() - x.at > 45000)

  return (
    <div className="page">
      <PageHeader eyebrow={`From your Mac · ${ago(snap.published_at)}`} title="Finances">
        <button className="btn sm" disabled={waiting} onClick={() => send('POST', '/api/sync', {}, 'Syncing banks')}>
          <RefreshCw size={13} className={waiting ? 'spin' : ''} /> {waiting ? pending[0].label : 'Sync'}
        </button>
      </PageHeader>

      <div className="seg tabs-seg fin-tabs">
        {TABS.map(([k, label, short]) => (
          <button key={k} aria-pressed={tab === k} onClick={() => go(k)}>
            {short ? <><span className="fin-long">{label}</span><span className="fin-short">{short}</span></> : label}
          </button>
        ))}
      </div>

      {slow && <p className="note">Waiting for your Mac. It picks up changes when it's on and the Money app is running.</p>}
      {error && <p className="note fin-alert" onClick={clearError}>{error}</p>}

      {tab === 'overview' && <Overview p={p} go={go} />}
      {tab === 'spending' && <Spending p={p} send={send} />}
      {tab === 'transactions' && <Transactions p={p} send={send} />}
      {tab === 'accounts' && <Accounts p={p} send={send} publishedAt={snap.published_at} />}
    </div>
  )
}
