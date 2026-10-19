import { useEffect, useRef, useState } from 'react'

const Speech = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)

// Talk into a text box. Spoken words are appended to the current text as you speak.
export function useDictation(text, setText) {
  const [listening, setListening] = useState(false)
  const rec = useRef(null)
  const base = useRef('')

  useEffect(() => () => rec.current?.stop(), [])

  function start() {
    const r = new Speech()
    r.continuous = true
    r.interimResults = true
    r.lang = navigator.language || 'en-US'
    base.current = text ? text.trimEnd() + (text.endsWith('\n') ? '' : ' ') : ''
    r.onresult = (e) => {
      let said = ''
      for (const res of e.results) said += res[0].transcript
      setText(base.current + said.trim())
    }
    r.onend = () => setListening(false)
    r.onerror = () => setListening(false)
    rec.current = r
    r.start()
    setListening(true)
  }
  const stop = () => rec.current?.stop()

  return { canTalk: Boolean(Speech), listening, toggle: () => (listening ? stop() : start()), stop }
}
