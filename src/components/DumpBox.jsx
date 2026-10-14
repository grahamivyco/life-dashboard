import { useState } from 'react'
import { supabase } from '../supabase.js'

// Text box for brain dumps. Dictate into it with Handy (Mac) or the keyboard mic (iPhone).
export default function DumpBox({ onSaved, compact }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function save() {
    if (!text.trim()) return
    setBusy(true); setErr('')
    const { error } = await supabase.from('brain_dumps').insert({ content: text.trim() })
    setBusy(false)
    if (error) return setErr(error.message)
    setText('')
    onSaved?.()
  }

  return (
    <div className="tile dumpbox">
      <textarea
        rows={compact ? 3 : 6}
        placeholder="What's on your mind? Tap the mic on your keyboard or hold your Handy key and talk."
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save() }}
      />
      <div className="row between">
        <span className="hint">⌘ Enter to save. Sorted into tasks, goals and ideas at the next sync.</span>
        <button className="btn primary" onClick={save} disabled={busy || !text.trim()}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
      {err && <p className="error">{err}</p>}
    </div>
  )
}
