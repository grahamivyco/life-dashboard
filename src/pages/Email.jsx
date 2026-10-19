import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronRight, ExternalLink, Sparkles, Paperclip, Download, Archive, Trash2, Send, RefreshCw, Mic, Square, SkipForward } from 'lucide-react'
import { supabase } from '../supabase.js'
import { useSnapshot } from '../useSnapshot.js'
import { useDictation } from '../useDictation.js'
import { askClaude } from '../askClaude.js'
import { gmail, nameOf } from '../gmail.js'
import PageHeader from '../components/PageHeader.jsx'
import { ago, fmtTime, fmtDay } from '../lib.js'

const ME = 'grahamivy.co@gmail.com'
const UNDO_MS = 5000
const PH = /\[[^\]\n]{1,60}\]/

const filters = [
  { k: 'all', label: 'All' },
  { k: 'unread', label: 'Unread' },
  { k: 'important', label: 'Important' },
]

const when = (d) => {
  const x = new Date(d)
  return x.toDateString() === new Date().toDateString() ? fmtTime(d) : fmtDay(d)
}
const kb = (n) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`)

// Ask Claude about a thread through the shared Ask Claude path (shows in the ✦ panel).
// Claude reads the thread and its attachments in Gmail by the thread id.
async function askAboutThread(thread, question) {
  const last = thread.messages[thread.messages.length - 1]
  const files = thread.messages.flatMap((m) => m.files.map((f) => f.name))
  const context = [
    `Gmail thread ${thread.id}`,
    `Subject: ${last.subject}`,
    `From: ${last.from}`,
    `Latest message: ${last.body.slice(0, 1500)}`,
    files.length ? `Attachments: ${files.join(', ')}` : '',
  ].filter(Boolean).join('\n')
  return askClaude(`email:${thread.id}| ${question}\n\n${context}`)
}

// Without a Gmail connection, a reply goes out through the queue: the next sync sends it.
async function queueReply(threadId, to, body) {
  const { error } = await supabase.from('claude_requests').insert({
    action: 'send_reply', status: 'approved', note: `email:${threadId}| Send reply to ${to}`,
    approval_ask: `Send this reply to ${to}?`, result: body, summary: `Reply to ${to} waiting to send`,
  })
  if (error) throw new Error(error.message)
}

// Reply options Claude wrote during the sync. Picking one fills the reply box.
function ReplyOptions({ options, value, onPick }) {
  if (!options?.length) return null
  return (
    <div className="reply-opts">
      <span className="meta">Reply options</span>
      <div className="opts">
        {options.map((o, i) => (
          <button key={i} className="opt" aria-pressed={value === o.body} onClick={() => onPick(o.body)}>
            <b>{o.label}</b>
            <span className="opt-text">{o.body.replace(/^(hi|hello|hey|hola|dear|bon dia|buenas)\b[^\n]*\n+/i, '')}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function Files({ files }) {
  const [busy, setBusy] = useState(null)
  const [err, setErr] = useState('')
  if (!files.length) return null
  return (
    <div className="files">
      {files.map((f) => (
        <button key={f.messageId + f.id} className="file" disabled={busy === f.id}
          onClick={async () => { setBusy(f.id); setErr(''); try { await gmail.download(f) } catch (e) { setErr(e.message) } setBusy(null) }}>
          <Paperclip size={13} />
          <span className="clamp">{f.name}</span>
          <span className="meta">{kb(f.size)}</span>
          <Download size={13} />
        </button>
      ))}
      {err && <p className="error">{err}</p>}
    </div>
  )
}

function AskClaude({ thread, sent, onSent }) {
  const [q, setQ] = useState('')
  if (sent) return <p className="hint"><Sparkles size={12} /> Sent to Claude. The answer shows up in the ✦ panel.</p>
  return (
    <form className="ask-row" onSubmit={async (e) => { e.preventDefault(); await askAboutThread(thread, q.trim() || 'Draft a reply'); onSent() }}>
      <input className="plain" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask Claude about this email, or leave blank for a draft reply" />
      <button className="btn" type="submit"><Sparkles size={13} /> Ask Claude</button>
    </form>
  )
}

// Send with a short undo window
function useUndoSend() {
  const [pending, setPending] = useState(null)
  const timer = useRef(null)
  const send = (label, fn, after) => {
    clearTimeout(timer.current)
    setPending(label)
    timer.current = setTimeout(async () => {
      try { await fn(); after?.() } catch (e) { alert(e.message) }
      setPending(null)
    }, UNDO_MS)
  }
  const undo = () => { clearTimeout(timer.current); setPending(null) }
  useEffect(() => () => clearTimeout(timer.current), [])
  return { pending, send, undo }
}

function ThreadView({ id, options, asked, onAsked, onArchived }) {
  const [thread, setThread] = useState(null)
  const [err, setErr] = useState('')
  const [reply, setReply] = useState('')
  const { pending, send, undo } = useUndoSend()

  useEffect(() => {
    gmail.thread(id).then(setThread).catch((e) => setErr(e.message))
    gmail.markRead(id).catch(() => {})
  }, [id])

  if (err) return <div className="mail-body"><p className="error">{err}</p></div>
  if (!thread) return <div className="mail-body"><p className="hint">Loading…</p></div>

  const msgs = thread.messages
  return (
    <div className="mail-body">
      {msgs.map((m, i) => (
        <div key={m.id} className={'msg' + (i < msgs.length - 2 ? ' older' : '')}>
          <div className="row between"><b className="clamp">{nameOf(m.from)}</b><span className="meta">{when(m.date)}</span></div>
          <p className="msg-text">{m.body}</p>
          <Files files={m.files} />
        </div>
      ))}
      <ReplyOptions options={options} value={reply} onPick={setReply} />
      <textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder={`Reply to ${nameOf(msgs[msgs.length - 1].from)}`} rows={reply ? 7 : 4} />
      <div className="row gap wrap">
        {pending
          ? <span className="sending">Sending… <button className="mini" onClick={undo}>Undo</button></span>
          : <button className="btn primary" disabled={!reply.trim()} onClick={() => send('reply', () => gmail.reply(thread, reply, ME), () => { setReply(''); gmail.thread(id).then(setThread) })}><Send size={13} /> Send</button>}
        <button className="btn" onClick={async () => { await gmail.archive(id); onArchived() }}><Archive size={13} /> Archive</button>
        <a className="btn" href={`https://mail.google.com/mail/u/0/#inbox/${id}`} target="_blank" rel="noreferrer">Gmail <ExternalLink size={12} /></a>
      </div>
      <AskClaude thread={thread} sent={asked} onSent={onAsked} />
    </div>
  )
}

function DraftView({ d, onGone }) {
  const [to, setTo] = useState(d.to)
  const [subject, setSubject] = useState(d.subject)
  const [body, setBody] = useState(d.body)
  const [thread, setThread] = useState(null)
  const [confirmDel, setConfirmDel] = useState(false)
  const { pending, send, undo } = useUndoSend()

  useEffect(() => { if (d.threadId) gmail.thread(d.threadId).then(setThread).catch(() => {}) }, [d.threadId])

  const edited = to !== d.to || subject !== d.subject || body !== d.body
  const blank = PH.test(body) || PH.test(subject)
  const theirs = thread?.messages.filter((m) => !m.from.toLowerCase().includes(ME) && !m.labels.includes('DRAFT')).pop()
  const files = thread ? thread.messages.flatMap((m) => m.files) : []

  return (
    <div className="mail-body">
      {theirs && (
        <div className="msg quoted">
          <div className="row between"><b className="clamp">{nameOf(theirs.from)}</b><span className="meta">{when(theirs.date)}</span></div>
          <p className="msg-text">{theirs.body}</p>
        </div>
      )}
      <Files files={files} />
      <div className="form-grid">
        <label className="field">To<input value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <label className="field">Subject<input value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
      </div>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} />
      {blank && <p className="hint">Fill in the [brackets] before sending.</p>}
      <div className="row gap wrap">
        {pending
          ? <span className="sending">Sending to {nameOf(to)}… <button className="mini" onClick={undo}>Undo</button></span>
          : <button className="btn primary" disabled={blank || !to.trim()} onClick={() => send('draft', () => gmail.sendDraft(d, edited ? { to, subject, body } : null), onGone)}><Send size={13} /> Send</button>}
        <button className={'btn' + (confirmDel ? ' danger' : '')} onClick={async () => {
          if (!confirmDel) { setConfirmDel(true); setTimeout(() => setConfirmDel(false), 4000); return }
          await gmail.deleteDraft(d.id); onGone()
        }}><Trash2 size={13} /> {confirmDel ? 'Confirm delete' : 'Delete draft'}</button>
      </div>
      {thread && <AskClaude thread={thread} sent={false} onSent={() => {}} />}
    </div>
  )
}

// Synced copy of a thread when Gmail isn't connected: pick or write a reply, the queue sends it.
function SnapshotThread({ t, queued, onQueued }) {
  const [reply, setReply] = useState('')
  const { pending, send, undo } = useUndoSend()
  return (
    <div className="mail-body">
      <p className="msg-text">{t.snippet}</p>
      {queued
        ? <p className="hint"><Send size={12} /> Reply queued. It goes out on the next sync.</p>
        : <>
            <ReplyOptions options={t.replies} value={reply} onPick={setReply} />
            <textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder={`Reply to ${t.from}`} rows={reply ? 7 : 4} />
          </>}
      <div className="row gap wrap">
        {!queued && (pending
          ? <span className="sending">Sending… <button className="mini" onClick={undo}>Undo</button></span>
          : <button className="btn primary" disabled={!reply.trim()} onClick={() => send('reply', () => queueReply(t.id, t.from, reply), onQueued)}><Send size={13} /> Send</button>)}
        <a className="btn" href={t.url} target="_blank" rel="noreferrer">Open in Gmail <ExternalLink size={12} /></a>
      </div>
    </div>
  )
}

// Skipped emails stay skipped until a new message arrives in the thread.
const SKIP_KEY = 'email-skipped'
const readSkips = () => { try { return JSON.parse(localStorage.getItem(SKIP_KEY) || '{}') } catch { return {} } }
const saveSkip = (t) => { try { localStorage.setItem(SKIP_KEY, JSON.stringify({ ...readSkips(), [t.id]: t.date })) } catch { /* ignore */ } }

// One email at a time: read it, send the draft (or another option, or your own words), or skip.
function ReplyQueue({ items, live, onDone }) {
  const t = items[0]
  const [text, setText] = useState('')
  const [more, setMore] = useState(false)
  const [thread, setThread] = useState(null)
  const { pending, send, undo } = useUndoSend()
  const mic = useDictation(text, setText)

  useEffect(() => {
    if (!t) return
    setText(t.replies[0].body); setMore(false); setThread(null)
    if (live) gmail.thread(t.id).then((th) => th && setThread(th)).catch(() => {})
  }, [t?.id])

  if (!t) return <section className="tile empty-card"><b>All caught up.</b><span className="meta">Nothing waiting on a reply.</span></section>

  const last = thread?.messages.filter((m) => !m.from.toLowerCase().includes(ME)).pop()
  const body = last?.body || t.message || t.snippet
  const blank = PH.test(text)
  const go = () => {
    mic.stop()
    send('reply', () => (live && thread ? gmail.reply(thread, text, ME) : queueReply(t.id, t.from, text)), () => onDone(t, 'sent'))
  }

  return (
    <section className="tile reply-card">
      <div className="row between"><span className="meta">{items.length === 1 ? 'Last one' : `1 of ${items.length}`}</span><span className="meta">{when(t.date)}</span></div>
      <div className="reply-from"><b>{t.from}</b><span className="clamp">{t.subject}</span></div>
      <p className="msg-text reply-msg">{body}</p>
      {last && <Files files={last.files} />}
      <div className="row between">
        <span className="meta">Your reply</span>
        {t.replies.length > 1 && <button className="mini" onClick={() => setMore(!more)}>{more ? 'Hide options' : `${t.replies.length - 1} other options`}</button>}
      </div>
      {more && <ReplyOptions options={t.replies} value={text} onPick={(b) => { setText(b); setMore(false) }} />}
      <div className={'compose' + (mic.listening ? ' listening' : '')}>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={7} placeholder="Type or tap the mic and talk" />
        {mic.canTalk && (
          <button className="mic" onClick={mic.toggle} aria-label={mic.listening ? 'Stop' : 'Talk'}>
            {mic.listening ? <Square size={14} /> : <Mic size={16} />}
          </button>
        )}
      </div>
      {blank && <p className="hint">Fill in the [brackets] before sending.</p>}
      <div className="row gap wrap">
        {pending
          ? <span className="sending">Sending… <button className="mini" onClick={undo}>Undo</button></span>
          : <>
              <button className="btn primary" disabled={!text.trim() || blank} onClick={go}><Send size={13} /> Send</button>
              <button className="btn" onClick={() => { mic.stop(); saveSkip(t); onDone(t, 'skipped') }}><SkipForward size={13} /> Skip</button>
            </>}
        <a className="btn" href={t.url} target="_blank" rel="noreferrer">Gmail <ExternalLink size={12} /></a>
      </div>
      {!live && <p className="hint">Sends on the next sync.</p>}
    </section>
  )
}

function Connect({ onConnected }) {
  const [err, setErr] = useState('')
  if (!gmail.ready()) return <p className="note">Gmail sending is waiting on a one-time Google setup. Showing the latest synced inbox until then.</p>
  return (
    <section className="tile row between wrap gap">
      <span>Connect Gmail to read, reply, send drafts and download attachments here.</span>
      <button className="btn primary" onClick={async () => { try { await gmail.connect(); onConnected() } catch (e) { setErr(e.message) } }}>Connect Gmail</button>
      {err && <p className="error">{err}</p>}
    </section>
  )
}

export default function Email() {
  const snap = useSnapshot('email')
  const [live, setLive] = useState(gmail.ready() && gmail.connected())
  const [params] = useSearchParams()
  const [tab, setTab] = useState(params.get('tab') || 'reply')
  const [skips, setSkips] = useState(readSkips)
  const [handled, setHandled] = useState({})
  const [filter, setFilter] = useState('all')
  const [open, setOpen] = useState(params.get('open'))
  const [threads, setThreads] = useState(null)
  const [drafts, setDrafts] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [asked, setAsked] = useState({})
  const [queued, setQueued] = useState({})

  const load = useCallback(async () => {
    if (!live) return
    setBusy(true); setErr('')
    try {
      const [t, d] = await Promise.all([gmail.threads(), gmail.drafts()])
      setThreads(t); setDrafts(d)
    } catch (e) {
      if (e.code === 'signed_out') setLive(false)
      setErr(e.message)
    }
    setBusy(false)
  }, [live])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    supabase.from('claude_requests').select('note, action, status').is('item_id', null).like('note', 'email:%')
      .then(({ data }) => {
        const a = {}, q = {}
        for (const r of data || []) {
          if (!r.note) continue
          const id = r.note.split('|')[0].slice(6)
          if (r.action === 'send_reply') { if (r.status === 'approved' || r.status === 'working') q[id] = true }
          else a[id] = true
        }
        setAsked(a); setQueued(q)
      })
  }, [])

  const all = live ? threads || [] : snap?.payload?.threads || []
  const replies = Object.fromEntries((snap?.payload?.threads || []).map((t) => [t.id, t.replies]))
  const toReply = (snap?.payload?.threads || []).filter((t) => t.replies?.length && !queued[t.id] && !handled[t.id] && skips[t.id] !== t.date)
  const shown = all.filter((t) => (filter === 'unread' ? t.unread : filter === 'important' ? t.important : true))

  return (
    <div className="page">
      <PageHeader eyebrow={live ? 'Gmail · live' : snap ? `Gmail · updated ${ago(snap.synced_at)}` : 'Gmail'} title="Email">
        <div className="seg">
          <button aria-pressed={tab === 'reply'} onClick={() => { setTab('reply'); setOpen(null) }}>To reply{toReply.length ? ` ${toReply.length}` : ''}</button>
          <button aria-pressed={tab === 'inbox'} onClick={() => { setTab('inbox'); setOpen(null) }}>Inbox</button>
          {live && <button aria-pressed={tab === 'outbox'} onClick={() => { setTab('outbox'); setOpen(null) }}>Drafts{drafts?.length ? ` ${drafts.length}` : ''}</button>}
        </div>
        {tab === 'inbox' && (
          <div className="seg">
            {filters.map((f) => <button key={f.k} aria-pressed={filter === f.k} onClick={() => setFilter(f.k)}>{f.label}</button>)}
          </div>
        )}
        {live && <button className="btn" onClick={load} disabled={busy} aria-label="Refresh"><RefreshCw size={13} className={busy ? 'spin' : ''} /></button>}
      </PageHeader>

      {!live && tab !== 'reply' && <Connect onConnected={() => setLive(true)} />}
      {err && <p className="error">{err}</p>}

      {tab === 'reply' && (
        <ReplyQueue items={toReply} live={live} onDone={(t, how) => {
          setHandled((h) => ({ ...h, [t.id]: true }))
          if (how === 'skipped') setSkips(readSkips())
          else setQueued((q) => ({ ...q, [t.id]: !live }))
        }} />
      )}

      {tab === 'inbox' && (
        <ul className="tile list mail-list">
          {shown.map((t) => {
            const isOpen = open === t.id
            return (
              <li key={t.id} className={'mail' + (t.unread ? ' unread-row' : '') + (isOpen ? ' open' : '')}>
                <button className="mail-head" onClick={() => setOpen(isOpen ? null : t.id)} aria-expanded={isOpen}>
                  <ChevronRight size={15} className="chev" />
                  <span className="mail-from clamp">{t.from}{t.count > 1 && <span className="meta"> {t.count}</span>}</span>
                  <span className="mail-subject grow clamp">{t.subject}</span>
                  {queued[t.id] ? <span className="tag">Sending</span> : replies[t.id]?.length > 0 && <span className="tag soft">Reply ready</span>}
                  <span className="meta">{when(t.date)}</span>
                </button>
                {isOpen && (live
                  ? <ThreadView id={t.id} options={replies[t.id]} asked={asked[t.id]} onAsked={() => setAsked((a) => ({ ...a, [t.id]: true }))}
                      onArchived={() => { setOpen(null); setThreads((ts) => ts.filter((x) => x.id !== t.id)) }} />
                  : <SnapshotThread t={t} queued={queued[t.id]} onQueued={() => setQueued((q) => ({ ...q, [t.id]: true }))} />)}
              </li>
            )
          })}
          {(live ? threads : snap) && shown.length === 0 && <li className="empty">Nothing here.</li>}
          {live && !threads && !err && <li className="empty">Loading…</li>}
        </ul>
      )}

      {tab === 'outbox' && (
        <ul className="tile list mail-list">
          {(drafts || []).map((d) => {
            const isOpen = open === d.id
            return (
              <li key={d.id} className={'mail' + (isOpen ? ' open' : '')}>
                <button className="mail-head" onClick={() => setOpen(isOpen ? null : d.id)} aria-expanded={isOpen}>
                  <ChevronRight size={15} className="chev" />
                  <span className="mail-from clamp">To {nameOf(d.to || 'no one yet')}</span>
                  <span className="mail-subject grow clamp">{d.subject || '(no subject)'}</span>
                  {PH.test(d.body) && <span className="tag">Needs you</span>}
                  <span className="meta">{when(d.date)}</span>
                </button>
                {isOpen && <DraftView d={d} onGone={() => { setOpen(null); setDrafts((ds) => ds.filter((x) => x.id !== d.id)) }} />}
              </li>
            )
          })}
          {drafts && drafts.length === 0 && <li className="empty">No drafts.</li>}
        </ul>
      )}
    </div>
  )
}
