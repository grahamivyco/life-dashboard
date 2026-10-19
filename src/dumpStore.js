import { useSyncExternalStore } from 'react'

// Brain dump draft and recorder, kept outside React so switching pages
// doesn't stop a recording or lose what you typed. The text is also saved
// to localStorage until you hit Save.
const Speech = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)
export const BARS = 28
const KEY = 'dump-draft'
const flat = () => Array(BARS).fill(0.15)

const read = () => { try { return localStorage.getItem(KEY) || '' } catch { return '' } }
const write = (t) => { try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY) } catch { /* private mode */ } }

let state = { text: read(), live: '', listening: false, levels: flat(), err: '' }
const subs = new Set()
let rec = null
let audio = null
let base = ''

function set(patch) {
  state = { ...state, ...patch }
  if ('text' in patch) write(state.text)
  subs.forEach((f) => f())
}

export const canTalk = !!Speech
export const useDump = () => useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => state)
export const setText = (text) => set({ text })
export const setErr = (err) => set({ err })

// Demo screenshots: show a recording in progress.
export function demoTalk(said, live) {
  set({ text: said, live, listening: true, levels: Array.from({ length: BARS }, (_, i) => 0.2 + 0.8 * Math.abs(Math.sin(i * 0.55) * Math.cos(i * 0.21))) })
}

async function startWave() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const an = ctx.createAnalyser()
    an.fftSize = 64
    ctx.createMediaStreamSource(stream).connect(an)
    const buf = new Uint8Array(an.frequencyBinCount)
    audio = { stream, ctx }
    const tick = () => {
      if (!audio) return
      an.getByteFrequencyData(buf)
      set({ levels: Array.from({ length: BARS }, (_, i) => Math.max(0.12, buf[i % buf.length] / 255)) })
      audio.raf = requestAnimationFrame(tick)
    }
    tick()
  } catch { /* wave is optional; dictation still works */ }
}

function stopWave() {
  if (!audio) return
  cancelAnimationFrame(audio.raf)
  audio.stream.getTracks().forEach((t) => t.stop())
  audio.ctx.close()
  audio = null
  set({ levels: flat() })
}

export function start() {
  if (!Speech || state.listening) return
  const r = new Speech()
  r.continuous = true
  r.interimResults = true
  r.lang = navigator.language || 'en-US'
  base = state.text ? state.text.trimEnd() + ' ' : ''
  r.onresult = (e) => {
    let final = '', interim = ''
    for (const res of e.results) (res.isFinal ? (final += res[0].transcript) : (interim += res[0].transcript))
    set({ text: base + final.trim(), live: interim.trim() })
  }
  r.onerror = (e) => { if (e.error !== 'aborted' && e.error !== 'no-speech') set({ err: 'Mic: ' + e.error }) }
  r.onend = () => {
    const rest = state.live
    set({ text: rest ? `${state.text} ${rest}`.trim() : state.text, live: '', listening: false })
    stopWave()
    rec = null
  }
  rec = r
  set({ err: '', listening: true })
  r.start()
  startWave()
}

export function stop() {
  rec?.stop()
  stopWave()
}

export function clear() {
  if (rec) rec.onresult = null
  set({ text: '', live: '' })
}
