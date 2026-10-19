import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import { supabase } from '../supabase.js'
import { useSnapshot } from '../useSnapshot.js'
import PageHeader from '../components/PageHeader.jsx'
import { ago, fmtDay } from '../lib.js'

const usd = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: n % 1 ? 2 : 0 }).format(n)
const statusLabel = { sent: 'Sent', paid: 'Paid', disputed: 'Pushed back', overdue: 'Overdue', paused: 'Paused' }

// Opens in the Email page when the thread is there, otherwise in Gmail
function ThreadLink({ t, inEmail, children }) {
  return inEmail
    ? <Link className="client-mail" to={`/email?tab=inbox&open=${t.id}`}>{children}</Link>
    : <a className="client-mail" href={t.url} target="_blank" rel="noreferrer">{children}<ExternalLink size={12} className="muted" /></a>
}

function Thread({ t, inEmail }) {
  return (
    <li>
      <ThreadLink t={t} inEmail={inEmail}>
        {t.needs_reply && <span className="unread" />}
        <span className="client-from clamp">{t.from}</span>
        <span className="client-subj grow clamp muted">{t.subject}</span>
        <span className="meta">{fmtDay(t.date)}</span>
      </ThreadLink>
    </li>
  )
}

function Notes({ client }) {
  const [text, setText] = useState(client.notes || '')
  const [state, setState] = useState('')
  const timer = useRef()
  const saved = useRef(client.notes || '')

  async function save(v) {
    if (v === saved.current) return
    setState('Saving…')
    const { error } = await supabase.from('clients').update({ notes: v, updated_at: new Date().toISOString() }).eq('id', client.id)
    if (error) return setState('Not saved')
    saved.current = v
    setState('Saved')
  }

  useEffect(() => () => clearTimeout(timer.current), [])

  return (
    <div className="client-block">
      <div className="row between"><span className="eyebrow">Notes</span><span className="meta">{state}</span></div>
      <textarea
        value={text}
        placeholder="Rates, who to talk to, what's next…"
        onChange={(e) => { const v = e.target.value; setText(v); setState(''); clearTimeout(timer.current); timer.current = setTimeout(() => save(v), 900) }}
        onBlur={() => { clearTimeout(timer.current); save(text) }}
      />
    </div>
  )
}

function ClientCard({ client, data, emailIds }) {
  const threads = data?.threads || []
  const needs = threads.filter((t) => t.needs_reply)
  const latest = threads.filter((t) => !t.needs_reply).slice(0, 5)
  const invoices = data?.invoices || []
  const open = invoices.filter((i) => i.status !== 'paid' && i.status !== 'paused')
  const owed = open.reduce((s, i) => s + (i.amount || 0), 0)

  return (
    <section className="tile client">
      <div className="client-head">
        <h2>{client.name}</h2>
        <span className="meta">
          {[needs.length && `${needs.length} to reply`, open.length && `${usd(owed)} invoiced, not paid`].filter(Boolean).join(' · ') || 'All quiet'}
        </span>
      </div>
      {data?.summary && <p className="client-summary">{data.summary}</p>}

      <div className="client-grid">
        <div className="col gap16">
          {needs.length > 0 && (
            <div className="client-block">
              <span className="eyebrow">Needs your reply</span>
              <ul className="list">{needs.map((t) => <Thread key={t.id} t={t} inEmail={emailIds.has(t.id)} />)}</ul>
            </div>
          )}
          <div className="client-block">
            <span className="eyebrow">Latest emails</span>
            {latest.length
              ? <ul className="list">{latest.map((t) => <Thread key={t.id} t={t} inEmail={emailIds.has(t.id)} />)}</ul>
              : <p className="empty">{data ? 'No recent emails.' : 'Shows up after the next sync.'}</p>}
          </div>
        </div>

        <div className="col gap16">
          <div className="client-block">
            <span className="eyebrow">Invoices</span>
            {invoices.length
              ? (
                <ul className="list">
                  {invoices.map((i) => (
                    <li key={i.number}>
                      <a className="client-mail" href={i.url} target="_blank" rel="noreferrer">
                        <span className="inv-num">#{i.number}</span>
                        <span className="grow clamp muted">{i.note || fmtDay(i.date)}</span>
                        <span className={'pill' + (i.status === 'disputed' || i.status === 'overdue' ? ' alert' : '')}>{statusLabel[i.status] || i.status}</span>
                        <span className="num">{usd(i.amount)}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              )
              : <p className="empty">{data ? 'No invoices found in email.' : 'Shows up after the next sync.'}</p>}
          </div>
          <Notes client={client} />
        </div>
      </div>
    </section>
  )
}

export default function Clients() {
  const snap = useSnapshot('clients')
  const email = useSnapshot('email')
  const [clients, setClients] = useState(null)

  useEffect(() => {
    supabase.from('clients').select('*').eq('archived', false).order('position')
      .then(({ data }) => setClients(data || []))
  }, [])

  const byId = Object.fromEntries((snap?.payload?.clients || []).map((c) => [c.id, c]))
  const emailIds = new Set((email?.payload?.threads || []).map((t) => t.id))

  return (
    <div className="page">
      <PageHeader eyebrow={snap ? `Gmail · updated ${ago(snap.synced_at)}` : 'Gmail'} title="Clients" />
      {clients?.map((c) => <ClientCard key={c.id} client={c} data={byId[c.id]} emailIds={emailIds} />)}
      {clients && clients.length === 0 && <p className="empty">No clients yet.</p>}
    </div>
  )
}
