import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Mic, Square } from 'lucide-react'
import { supabase } from '../supabase.js'
import { useDump, setErr, start, stop, clear, canTalk as hasSpeech, demoTalk } from '../dumpStore.js'

// Brain dump hero: a big mic and Save. What you say shows under the mic as you talk,
// with a voice wave while it listens. The draft and any recording carry on if you
// switch pages (see dumpStore.js).
export default function DumpBox({ onSaved }) {
  const { search } = useLocation()
  const demo = import.meta.env.MODE === 'demo' && search.includes('talk=1')
  const { text, live, listening, levels, err } = useDump()
  const [busy, setBusy] = useState(false)

  useEffect(() => { if (demo) demoTalk('Need to tell Emma about the wedding and start looking at flights', 'for the weekend of') }, [demo])

  async function save() {
    const content = [text, live].join(' ').trim()
    if (!content) return
    stop()
    setBusy(true); setErr('')
    const { error } = await supabase.from('brain_dumps').insert({ content })
    setBusy(false)
    if (error) return setErr(error.message)
    clear()
    onSaved?.()
  }

  const canTalk = hasSpeech || demo
  const said = [text, live].join(' ').trim()

  return (
    <section className={'tile dump-hero' + (listening ? ' listening' : '')}>
      <h2 className="dump-q">{listening ? 'Listening…' : "What's on your mind?"}</h2>
      <button
        className={'hero-mic' + (listening ? ' on' : '')}
        onClick={listening ? stop : start}
        disabled={!canTalk}
        aria-label={listening ? 'Stop' : 'Talk'}
        title={listening ? 'Stop' : 'Talk'}
      >
        {listening ? <Square size={26} fill="currentColor" /> : <Mic size={34} strokeWidth={1.75} />}
      </button>
      {listening && <div className="wave" aria-hidden="true">{levels.map((l, i) => <span key={i} style={{ transform: `scaleY(${l})` }} />)}</div>}
      {said && <p className="dump-said">{text}{live && <span className="dump-live"> {live}</span>}</p>}
      {!canTalk && <p className="hint">Voice needs Safari or Chrome.</p>}
      <button className="btn primary hero-save" onClick={save} disabled={busy || !said}>{busy ? 'Saving…' : 'Save'}</button>
      {err && <p className="error">{err}</p>}
    </section>
  )
}
