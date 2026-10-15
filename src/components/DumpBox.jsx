import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Mic, Square } from 'lucide-react'
import { supabase } from '../supabase.js'

const Speech = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)
const BARS = 28
const DEMO_SAID = 'Need to tell Emma about the wedding and start looking at flights'
const DEMO_LIVE = 'for the weekend of'

// Brain dump box. Tap the mic and talk: the words land in the box as you speak,
// with a voice wave while it listens. Typing still works.
export default function DumpBox({ onSaved, compact }) {
  const { search } = useLocation()
  const demo = import.meta.env.MODE === 'demo' && search.includes('talk=1')
  const [text, setText] = useState(demo ? DEMO_SAID : '')
  const [live, setLive] = useState(demo ? DEMO_LIVE : '')
  const [listening, setListening] = useState(demo)
  const [levels, setLevels] = useState(() => Array(BARS).fill(0.15))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const rec = useRef(null)
  const base = useRef('')
  const audio = useRef(null)
  const liveRef = useRef('')

  useEffect(() => () => stop(), [])

  // Demo: fake a voice so the screenshot shows the wave.
  useEffect(() => {
    if (!demo) return
    setLevels(Array.from({ length: BARS }, (_, i) => 0.2 + 0.8 * Math.abs(Math.sin(i * 0.55) * Math.cos(i * 0.21))))
  }, [demo])

  async function startWave() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const an = ctx.createAnalyser()
      an.fftSize = 64
      ctx.createMediaStreamSource(stream).connect(an)
      const buf = new Uint8Array(an.frequencyBinCount)
      const tick = () => {
        an.getByteFrequencyData(buf)
        setLevels(Array.from({ length: BARS }, (_, i) => Math.max(0.12, buf[i % buf.length] / 255)))
        audio.current.raf = requestAnimationFrame(tick)
      }
      audio.current = { stream, ctx }
      tick()
    } catch { /* wave is optional; dictation still works */ }
  }

  function stopWave() {
    const a = audio.current
    if (!a) return
    cancelAnimationFrame(a.raf)
    a.stream.getTracks().forEach((t) => t.stop())
    a.ctx.close()
    audio.current = null
    setLevels(Array(BARS).fill(0.15))
  }

  function stop() {
    rec.current?.stop()
    stopWave()
  }

  function start() {
    const r = new Speech()
    r.continuous = true
    r.interimResults = true
    r.lang = navigator.language || 'en-US'
    base.current = text ? text.trimEnd() + ' ' : ''
    r.onresult = (e) => {
      let final = '', interim = ''
      for (const res of e.results) (res.isFinal ? (final += res[0].transcript) : (interim += res[0].transcript))
      setText(base.current + final.trim())
      liveRef.current = interim.trim()
      setLive(liveRef.current)
    }
    r.onerror = (e) => { if (e.error !== 'aborted' && e.error !== 'no-speech') setErr('Mic: ' + e.error) }
    r.onend = () => {
      const rest = liveRef.current
      setText((t) => (rest ? `${t} ${rest}`.trim() : t))
      liveRef.current = ''; setLive(''); setListening(false); stopWave()
    }
    rec.current = r
    setErr('')
    r.start()
    setListening(true)
    startWave()
  }

  async function save() {
    const content = [text, live].join(' ').trim()
    if (!content) return
    stop()
    setBusy(true); setErr('')
    const { error } = await supabase.from('brain_dumps').insert({ content })
    setBusy(false)
    if (error) return setErr(error.message)
    setText(''); setLive(''); liveRef.current = ''
    onSaved?.()
  }

  const canTalk = Speech || demo

  return (
    <div className={'tile dumpbox' + (listening ? ' listening' : '')}>
      <div className="dump-field">
        <textarea
          rows={compact ? 3 : 6}
          placeholder={canTalk ? "What's on your mind? Tap the mic and talk, or type." : "What's on your mind?"}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save() }}
        />
        {live && <p className="dump-live">{live}</p>}
      </div>
      <div className="row between">
        <div className="row talk">
          {canTalk && (
            <button
              className={'mic-btn' + (listening ? ' on' : '')}
              onClick={listening ? stop : start}
              aria-label={listening ? 'Stop' : 'Talk'}
              title={listening ? 'Stop' : 'Talk'}
            >
              {listening ? <Square size={14} fill="currentColor" /> : <Mic size={18} />}
            </button>
          )}
          {listening
            ? <div className="wave" aria-hidden="true">{levels.map((l, i) => <span key={i} style={{ transform: `scaleY(${l})` }} />)}</div>
            : <span className="hint">⌘ Enter to save. Sorted into tasks, goals and ideas at the next sync.</span>}
        </div>
        <button className="btn primary" onClick={save} disabled={busy || !(text.trim() || live)}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
      {err && <p className="error">{err}</p>}
    </div>
  )
}
