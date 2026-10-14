import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Mic, ArrowUp, X } from 'lucide-react'
import { supabase } from '../supabase.js'
import { ago } from '../lib.js'

const Speech = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)

// Floating ✦ button, bottom right on every page. Messages go into claude_requests
// (action 'ask'); the hourly worker answers them and the reply shows here.
export default function AskClaude() {
  const { search } = useLocation()
  const [open, setOpen] = useState(() => search.includes('ask=1'))
  const [msgs, setMsgs] = useState([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [listening, setListening] = useState(false)
  const rec = useRef(null)
  const base = useRef('')
  const end = useRef(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from('claude_requests').select('*').eq('action', 'ask')
      .order('created_at', { ascending: false }).limit(20)
    setMsgs((data || []).slice().reverse())
  }, [])

  useEffect(() => {
    if (!open) return
    load()
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [open, load])

  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [msgs, open])
  useEffect(() => () => rec.current?.stop(), [])

  function toggleMic() {
    if (listening) return rec.current?.stop()
    const r = new Speech()
    r.continuous = true
    r.interimResults = true
    r.lang = navigator.language || 'en-US'
    base.current = text ? text.trimEnd() + ' ' : ''
    r.onresult = (e) => {
      let said = ''
      for (const res of e.results) said += res[0].transcript
      setText(base.current + said)
    }
    r.onerror = (e) => { if (e.error !== 'aborted' && e.error !== 'no-speech') setErr('Mic: ' + e.error) }
    r.onend = () => setListening(false)
    rec.current = r
    setErr('')
    r.start()
    setListening(true)
  }

  async function send() {
    const note = text.trim()
    if (!note) return
    rec.current?.stop()
    setBusy(true); setErr('')
    const { error } = await supabase.from('claude_requests').insert({ action: 'ask', note })
    setBusy(false)
    if (error) return setErr(error.message)
    setText('')
    load()
  }

  return (
    <>
      {open && (
        <div className="ask-panel tile" role="dialog" aria-label="Ask Claude">
          <div className="tile-head">
            <h2><span className="spark-head">✦</span> Ask Claude</h2>
            <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close"><X size={16} /></button>
          </div>
          <div className="ask-log">
            {msgs.length === 0 && <p className="empty">Ask anything or hand off a task. Claude replies here within the hour.</p>}
            {msgs.map((m) => (
              <div key={m.id} className="ask-pair">
                <p className="bubble me">{m.note}</p>
                {m.result || m.summary ? (
                  <div className="bubble">
                    {m.summary && <p><b>{m.summary}</b></p>}
                    {m.result && <p className="dump-text">{m.result}</p>}
                    {m.links?.map((l, i) => (
                      <a key={i} href={l.url} target="_blank" rel="noreferrer" className="ask-link">{l.title || l.url}</a>
                    ))}
                    {m.approval_ask && <p className="meta">{m.approval_ask} Approve on Today.</p>}
                  </div>
                ) : (
                  <p className="meta ask-wait">{m.status === 'working' ? 'Claude is on it' : `Sent ${ago(m.created_at)}. Reply at the next sync.`}</p>
                )}
              </div>
            ))}
            <div ref={end} />
          </div>
          <div className="ask-input">
            <textarea
              rows={2}
              placeholder={listening ? 'Listening…' : 'Type or tap the mic'}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            />
            {Speech && (
              <button className={'icon-btn' + (listening ? ' live' : '')} onClick={toggleMic} aria-label={listening ? 'Stop' : 'Talk'} title={listening ? 'Stop' : 'Talk'}>
                <Mic size={17} />
              </button>
            )}
            <button className="ask-send" onClick={send} disabled={busy || !text.trim()} aria-label="Send"><ArrowUp size={16} /></button>
          </div>
          {err && <p className="error">{err}</p>}
        </div>
      )}
      <button className={'ask-fab' + (open ? ' on' : '')} onClick={() => setOpen((o) => !o)} aria-label="Ask Claude">✦</button>
    </>
  )
}
