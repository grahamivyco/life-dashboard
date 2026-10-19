import { useEffect, useState } from 'react'
import { ChevronRight, ExternalLink } from 'lucide-react'
import { cancelGuide } from '../subscriptions.js'
import { supabase } from '../supabase.js'
import { useSnapshot } from '../useSnapshot.js'
import PageHeader from '../components/PageHeader.jsx'
import { ago, fmtDay } from '../lib.js'

const usd = (n, d = 0) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: d, minimumFractionDigits: d }).format(n)

const groups = [
  { k: 'cash', label: 'Cash' },
  { k: 'invest', label: 'Investments' },
  { k: 'credit', label: 'Cards owed' },
]

function CashFlow({ rows }) {
  const max = Math.max(...rows.flatMap((r) => [r.income, r.spending]), 1)
  return (
    <div className="cf">
      <div className="cf-bars">
        {rows.map((r) => (
          <div key={r.label} className="cf-col" title={`${r.label}: in ${usd(r.income)}, out ${usd(r.spending)}`}>
            <div className="cf-pair">
              <span className="bar in" style={{ height: `${(r.income / max) * 100}%` }} />
              <span className="bar out" style={{ height: `${(r.spending / max) * 100}%` }} />
            </div>
            <span className="cf-label">{r.label}</span>
            <span className={'cf-net' + (r.net < 0 ? ' neg' : '')}>{r.net < 0 ? '−' : '+'}{usd(Math.abs(r.net))}</span>
          </div>
        ))}
      </div>
      <div className="legend"><span><i className="in" />In</span><span><i className="out" />Out</span></div>
    </div>
  )
}

// Subscriptions from the sync, with Graham's own fixes on top: hide ones he doesn't pay,
// correct an amount. Stored in subscription_overrides by name. Each row opens cancel help.
function Subscriptions({ subs }) {
  const [over, setOver] = useState({})
  const [showHidden, setShowHidden] = useState(false)
  const [open, setOpen] = useState(null)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    supabase.from('subscription_overrides').select('name, hidden, amount')
      .then(({ data }) => setOver(Object.fromEntries((data || []).map((o) => [o.name, o]))))
  }, [])

  const save = async (name, patch) => {
    const next = { name, hidden: false, amount: null, ...over[name], ...patch }
    setOver((o) => ({ ...o, [name]: next }))
    await supabase.from('subscription_overrides').upsert({ name, hidden: next.hidden, amount: next.amount, updated_at: new Date().toISOString() }, { onConflict: 'user_id,name' })
  }

  const rows = subs.map((s) => ({ ...s, amount: Number(over[s.name]?.amount ?? s.amount), hidden: !!over[s.name]?.hidden }))
  const active = rows.filter((s) => !s.hidden)
  const hidden = rows.filter((s) => s.hidden)

  return (
    <section className="tile">
      <div className="tile-head"><h2>Subscriptions</h2><span className="meta">{usd(active.reduce((t, x) => t + x.amount, 0), 2)}/mo</span></div>
      <ul className="list">
        {active.map((s) => {
          const isOpen = open === s.name
          const g = cancelGuide(s.name)
          return (
            <li key={s.name} className={'sub' + (isOpen ? ' open' : '')}>
              <button className="sub-head" aria-expanded={isOpen} onClick={() => { setOpen(isOpen ? null : s.name); setEditing(false) }}>
                <ChevronRight size={15} className="chev" />
                <span className="grow">{s.name}</span>
                <span className="num">{usd(s.amount, 2)}</span>
              </button>
              {isOpen && (
                <div className="sub-body">
                  <ol className="steps">{g.steps.map((st) => <li key={st}>{st}</li>)}</ol>
                  <div className="row gap wrap">
                    <a className="btn primary" href={g.url} target="_blank" rel="noreferrer">{g.search ? 'Find cancel page' : 'Manage or cancel'} <ExternalLink size={12} /></a>
                    {editing
                      ? <input className="sub-amt" type="number" step="0.01" autoFocus defaultValue={s.amount}
                          onBlur={(e) => { setEditing(false); const v = parseFloat(e.target.value); if (!isNaN(v) && v !== s.amount) save(s.name, { amount: v }) }}
                          onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditing(false) }} />
                      : <button className="btn" onClick={() => setEditing(true)}>Fix amount</button>}
                    <button className="btn" onClick={() => { setOpen(null); save(s.name, { hidden: true }) }}>I don't pay this</button>
                  </div>
                </div>
              )}
            </li>
          )
        })}
        {showHidden && hidden.map((s) => (
          <li key={s.name} className="sub-hidden">
            <span className="grow">{s.name}</span>
            <button className="mini" onClick={() => save(s.name, { hidden: false })}>Show again</button>
          </li>
        ))}
      </ul>
      {hidden.length > 0 && <button className="mini more" onClick={() => setShowHidden(!showHidden)}>{showHidden ? 'Done' : `${hidden.length} hidden`}</button>}
    </section>
  )
}

export default function Finances() {
  const snap = useSnapshot('finances')
  const [showTransfers, setShowTransfers] = useState(false)

  if (!snap) {
    return (
      <div className="page">
        <PageHeader title="Finances" />
        <p className="empty">Your accounts appear here after the next sync.</p>
      </div>
    )
  }

  const p = snap.payload
  const tx = p.transactions.filter((t) => showTransfers || !t.transfer)

  return (
    <div className="page">
      <PageHeader eyebrow={`${p.source} · updated ${ago(snap.synced_at)}`} title="Finances" />

      <div className="stats">
        <div className="tile stat lead">
          <span className="eyebrow">Net worth</span>
          <span className="big">{usd(p.totals.net_worth)}</span>
        </div>
        <div className="tile stat"><span className="eyebrow">Cash</span><span className="big">{usd(p.totals.cash)}</span></div>
        <div className="tile stat"><span className="eyebrow">Investments</span><span className="big">{usd(p.totals.invest)}</span></div>
        <div className="tile stat"><span className="eyebrow">Cards owed</span><span className="big">{usd(p.totals.credit)}</span></div>
      </div>

      {p.warnings?.map((w) => <p key={w} className="note">{w}</p>)}

      <section className="tile">
        <div className="tile-head">
          <h2>Cash flow</h2>
          <span className="meta">6-month average {usd(p.avg.income)} in, {usd(p.avg.spending)} out</span>
        </div>
        <CashFlow rows={p.cashflow} />
      </section>

      <div className="grid two">
        <section className="tile">
          <div className="tile-head"><h2>Accounts</h2></div>
          {groups.map((g) => (
            <div key={g.k} className="acct-group">
              <div className="row between acct-head"><span className="eyebrow">{g.label}</span><span className="meta">{usd(p.totals[g.k], 2)}</span></div>
              <ul className="list">
                {p.accounts.filter((a) => a.group === g.k && a.balance !== 0).map((a) => (
                  <li key={a.institution + a.name}>
                    <span className="grow">{a.institution} <span className="meta">{a.name}</span></span>
                    <span className="num">{usd(a.balance, 2)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <Subscriptions subs={p.subscriptions} />
      </div>

      <section className="tile">
        <div className="tile-head">
          <h2>Recent</h2>
          <label className="row gap hint"><input type="checkbox" checked={showTransfers} onChange={(e) => setShowTransfers(e.target.checked)} /> Show transfers</label>
        </div>
        <ul className="list">
          {tx.map((t, i) => (
            <li key={i}>
              <span className="meta when">{fmtDay(t.date)}</span>
              <span className="grow clamp">{t.merchant} <span className="meta">{t.account}</span></span>
              <span className={'num' + (t.amount > 0 ? ' pos' : '')}>{t.amount > 0 ? '+' : '−'}{usd(Math.abs(t.amount), 2)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
