import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Square } from 'lucide-react'
import { useDump, stop, demoTalk } from '../dumpStore.js'

// Shown on other pages while a brain dump is still recording.
export default function RecordingPill() {
  const { pathname, search } = useLocation()
  const { listening } = useDump()
  const demo = import.meta.env.MODE === 'demo' && search.includes('talk=1')
  useEffect(() => { if (demo) demoTalk('Need to tell Emma about the wedding', 'and start looking') }, [demo])
  if (!listening || pathname === '/') return null
  return (
    <div className="rec-pill">
      <Link to="/" className="rec-link"><span className="rec-dot" />Recording</Link>
      <button className="icon-btn" onClick={stop} aria-label="Stop" title="Stop"><Square size={12} fill="currentColor" /></button>
    </div>
  )
}
