import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Mic, Square } from 'lucide-react'
import { supabase } from '../supabase.js'
import { useDump, setText, setErr, start, stop, clear, canTalk as hasSpeech, demoTalk } from '../dumpStore.js'

// Brain dump box. Tap the mic and talk: the words land in the box as you speak,
// with a voice wave while it listens. Typing still works. The draft and any
// recording carry on if you switch pages (see dumpStore.js).
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

  return (
    <div className={'tile dumpbox' + (listening ? ' listening' : '')}>
      <div className="dump-field">
        <textarea
          rows={3}
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
            : <span className="hint">⌘ Enter to save. Claude sorts it into tasks, goals and ideas.</span>}
        </div>
        <button className="btn primary" onClick={save} disabled={busy || !(text.trim() || live)}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
      {err && <p className="error">{err}</p>}
    </div>
  )
}
