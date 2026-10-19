import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Camera, ChevronRight, FileText, Plus, Trash2, Upload, X } from 'lucide-react'
import { supabase } from '../supabase.js'
import PageHeader from '../components/PageHeader.jsx'
import Avatar from '../components/Avatar.jsx'
import { useProfile, saveProfile, uploadPhoto, uid } from '../profile.js'
import { DEFAULT_SPECS, specsSummary } from './Housing.jsx'
import { CATS } from '../events.js'
import { AppSettings } from './Settings.jsx'

// One place for Graham's preferences. Jobs reads job_profile, Housing reads housing_profile,
// Events Explore starts on profile.events.cats. Documents: job-docs base docs + the profile bucket.
const JOB_GROUPS = [
  ['roles', 'Roles'], ['where', 'Where'], ['hours', 'Hours'], ['level', 'Level'],
  ['pay', 'Pay floor'], ['org', 'Organisations'], ['causes', 'Causes'],
]

function Section({ id, title, summary, open, setOpen, children }) {
  return (
    <section id={id} className={'tile dump specs' + (open ? ' open' : '')}>
      <div className="dump-head">
        <button className="dump-toggle" onClick={() => setOpen(open ? null : id)} aria-expanded={open}>
          <ChevronRight size={15} className="chev" />
          <span>{title}</span>
          <span className="meta clamp grow">{summary}</span>
        </button>
      </div>
      {open && <div className="dump-body specs-body">{children}</div>}
    </section>
  )
}

function Head() {
  const p = useProfile()
  const file = useRef(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [name, setName] = useState('')
  const [tagline, setTagline] = useState('')
  useEffect(() => { setName(p?.name || ''); setTagline(p?.tagline || '') }, [p?.name, p?.tagline])

  async function pick(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setBusy(true); setErr('')
    try { await uploadPhoto(f) } catch (x) { setErr(x.message || 'Upload failed') }
    setBusy(false)
  }

  return (
    <section className="tile prof-head">
      <button className="prof-photo" onClick={() => file.current?.click()} disabled={busy} aria-label={p?.photo ? 'Change photo' : 'Add photo'}>
        <Avatar size={88} className="prof-avatar" />
        <span className="prof-cam"><Camera size={14} strokeWidth={2} /></span>
      </button>
      <input ref={file} type="file" accept="image/*" hidden onChange={pick} />
      <div className="prof-id">
        <input className="prof-name" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name !== (p?.name || '') && saveProfile({ name })} aria-label="Name" placeholder="Your name" />
        <input className="prof-tag" value={tagline} onChange={(e) => setTagline(e.target.value)} onBlur={() => tagline !== (p?.tagline || '') && saveProfile({ tagline })} aria-label="About" placeholder="One line about you" />
        {busy ? <span className="hint">Uploading…</span> : !p?.photo && <button className="link" onClick={() => file.current?.click()}>Add a photo</button>}
        {err && <span className="error">{err}</span>}
      </div>
    </section>
  )
}

function ChipGroup({ label, values, onChange }) {
  const [adding, setAdding] = useState('')
  const add = () => { const v = adding.trim(); if (v && !values.includes(v)) onChange([...values, v]); setAdding('') }
  return (
    <div className="pref-group">
      <span className="hint">{label}</span>
      <div className="chips">
        {values.map((v) => (
          <span key={v} className="chip pref-chip">{v}
            <button className="icon-btn xs" onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Remove ${v}`}><X size={12} /></button>
          </span>
        ))}
        <form className="pref-add" onSubmit={(e) => { e.preventDefault(); add() }}>
          <input value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="Add" aria-label={`Add to ${label}`} />
          {adding && <button className="icon-btn xs" aria-label="Add"><Plus size={12} /></button>}
        </form>
      </div>
    </div>
  )
}

function JobPrefs({ job, setJob }) {
  const picks = job?.picks || {}
  const info = job?.info || []
  const [draft, setDraft] = useState(info)
  useEffect(() => setDraft(job?.info || []), [job?.info])
  const save = async (patch) => {
    const next = { ...job, ...patch }
    setJob(next)
    await supabase.from('job_profile').update({ ...patch, updated_at: new Date().toISOString() }).eq('user_id', await uid())
  }
  const dirty = JSON.stringify(draft) !== JSON.stringify(info)
  return (
    <>
      {JOB_GROUPS.map(([k, label]) => (
        <ChipGroup key={k} label={label} values={picks[k] || []} onChange={(v) => save({ picks: { ...picks, [k]: v } })} />
      ))}
      <label className="field">Anything else
        <textarea rows={2} defaultValue={job?.more || ''} onBlur={(e) => e.target.value !== (job?.more || '') && save({ more: e.target.value })} />
      </label>
      {info.length > 0 && (
        <div className="pref-group">
          <span className="hint">Application details (used to fill forms)</span>
          <ul className="list kv">
            {draft.map(([k, v], i) => (
              <li key={k}>
                <span className="kv-k">{k}</span>
                <input className="plain grow" value={v} onChange={(e) => setDraft(draft.map((r, j) => (j === i ? [k, e.target.value] : r)))} />
              </li>
            ))}
          </ul>
          {dirty && <div className="row gap"><button className="btn primary sm" onClick={() => save({ info: draft })}>Save details</button><button className="link" onClick={() => setDraft(info)}>Cancel</button></div>}
        </div>
      )}
    </>
  )
}

function HousingPrefs({ specs, setSpecs }) {
  const [draft, setDraft] = useState(specs)
  useEffect(() => setDraft(specs), [specs])
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }))
  const save = async () => {
    setSpecs(draft)
    await supabase.from('housing_profile').upsert({ specs: draft, updated_at: new Date().toISOString() })
  }
  return (
    <>
      <div className="form-grid">
        <label className="field">Max rent (€/month)<input type="number" value={draft.max_price || ''} onChange={(e) => set('max_price', Number(e.target.value) || null)} /></label>
        <label className="field">Min bedrooms<input type="number" value={draft.min_beds || ''} onChange={(e) => set('min_beds', Number(e.target.value) || null)} /></label>
        <label className="field span2">Areas (comma separated, empty for anywhere)
          <input value={(draft.areas || []).join(', ')} onChange={(e) => set('areas', e.target.value.split(',').map((x) => x.trim()).filter(Boolean))} placeholder="Gràcia, Eixample, Poblenou" />
        </label>
      </div>
      <div className="row wrap gap">
        <span className="hint">Must have</span>
        {[['balcony', 'Balcony or terrace'], ['exterior', 'Exterior'], ['lift', 'Lift'], ['ac', 'A/C']].map(([k, label]) => (
          <label key={k} className="chip-check"><input type="checkbox" checked={!!draft[k]} onChange={(e) => set(k, e.target.checked)} /> {label}</label>
        ))}
      </div>
      <div className="row gap">
        <button className="btn primary sm" onClick={save} disabled={JSON.stringify(draft) === JSON.stringify(specs)}>Save</button>
        <span className="hint">Housing's Fits view and the sync use these.</span>
      </div>
    </>
  )
}

function EventPrefs() {
  const p = useProfile()
  const cats = p?.events?.cats || []
  const toggle = (c) => saveProfile({ events: { ...(p?.events || {}), cats: cats.includes(c) ? cats.filter((x) => x !== c) : [...cats, c] } })
  return (
    <>
      <div className="chips ex-cats">
        {Object.entries(CATS).map(([k, label]) => (
          <button key={k} className="chip" aria-pressed={cats.includes(k)} onClick={() => toggle(k)}>{label}</button>
        ))}
      </div>
      <span className="hint">Explore opens filtered to these.</span>
    </>
  )
}

const size = (n) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`)

function Documents({ job }) {
  const [mine, setMine] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const file = useRef(null)
  const base = job?.base_docs || []

  const load = async () => {
    const id = await uid()
    const { data } = await supabase.storage.from('profile').list(`${id}/docs`, { sortBy: { column: 'created_at', order: 'desc' } })
    setMine((data || []).filter((f) => f.name !== '.emptyFolderPlaceholder'))
  }
  useEffect(() => { load() }, [])

  async function open(bucket, path) {
    const w = window.open('', '_blank')
    const { data } = await supabase.storage.from(bucket).createSignedUrl(`${await uid()}/${path}`, 600)
    if (data?.signedUrl && w) w.location = data.signedUrl
    else if (w) w.close()
  }
  async function upload(e) {
    const files = [...(e.target.files || [])]
    e.target.value = ''
    if (!files.length) return
    setBusy(true); setErr('')
    const id = await uid()
    for (const f of files) {
      const safe = f.name.replace(/[^\w.\- ]+/g, '_')
      const { error } = await supabase.storage.from('profile').upload(`${id}/docs/${safe}`, f, { contentType: f.type, upsert: true })
      if (error) setErr(error.message)
    }
    setBusy(false)
    load()
  }
  async function remove(name) {
    if (!confirm(`Delete ${name}?`)) return
    await supabase.storage.from('profile').remove([`${await uid()}/docs/${name}`])
    load()
  }

  const groups = [...new Set(base.map((d) => d.group || 'Job documents'))]
  return (
    <section id="documents" className="tile">
      <div className="tile-head">
        <h2>Documents</h2>
        <button className="btn sm" onClick={() => file.current?.click()} disabled={busy}><Upload size={14} /> {busy ? 'Uploading…' : 'Upload'}</button>
        <input ref={file} type="file" multiple hidden onChange={upload} />
      </div>
      {err && <p className="error">{err}</p>}
      <ul className="list docs">
        {(mine || []).map((f) => (
          <li key={f.name}>
            <FileText size={16} strokeWidth={1.6} className="muted-icon" />
            <button className="doc-open grow clamp" onClick={() => open('profile', `docs/${f.name}`)}>{f.name}</button>
            <span className="meta">{f.metadata?.size ? size(f.metadata.size) : ''}</span>
            <button className="icon-btn" onClick={() => remove(f.name)} aria-label={`Delete ${f.name}`}><Trash2 size={15} strokeWidth={1.6} /></button>
          </li>
        ))}
        {mine && !mine.length && <li><span className="empty">Passport, visa, contracts, certificates. Private to you.</span></li>}
      </ul>
      {groups.map((g) => (
        <div key={g} className="doc-group">
          <span className="hint">{g}</span>
          <ul className="list docs">
            {base.filter((d) => (d.group || 'Job documents') === g).map((d) => (
              <li key={d.path}>
                <FileText size={16} strokeWidth={1.6} className="muted-icon" />
                <button className="doc-open grow clamp" onClick={() => open('job-docs', d.path)}>{d.label || d.save}</button>
                <span className="meta">From Jobs</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}

export default function Profile() {
  const p = useProfile()
  const { hash } = useLocation()
  const [open, setOpen] = useState(null)
  const [job, setJob] = useState(null)
  const [specs, setSpecs] = useState(DEFAULT_SPECS)

  useEffect(() => {
    supabase.from('job_profile').select('*').limit(1).then(({ data }) => setJob(data?.[0] || {}))
    supabase.from('housing_profile').select('specs').limit(1)
      .then(({ data }) => { if (data?.[0]?.specs) setSpecs({ ...DEFAULT_SPECS, ...data[0].specs }) })
  }, [])

  // #/profile#housing opens that section (links from Housing, Jobs, Events)
  useEffect(() => {
    const id = hash.replace('#', '')
    if (['jobs', 'housing', 'events'].includes(id)) {
      setOpen(id)
      setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 50)
    }
  }, [hash])

  const picks = job?.picks || {}
  const jobSummary = [picks.roles?.slice(0, 3).join(', '), picks.where?.[0], picks.pay?.[0]].filter(Boolean).join(' · ') || 'Nothing set'
  const cats = (p?.events?.cats || []).map((c) => CATS[c]).filter(Boolean)

  return (
    <div className="page">
      <PageHeader title="Profile" />
      <Head />
      <Section id="jobs" title="Jobs" summary={jobSummary} open={open === 'jobs'} setOpen={setOpen}>
        {job ? <JobPrefs job={job} setJob={setJob} /> : <p className="empty">Loading…</p>}
      </Section>
      <Section id="housing" title="Housing" summary={specsSummary(specs)} open={open === 'housing'} setOpen={setOpen}>
        <HousingPrefs specs={specs} setSpecs={setSpecs} />
      </Section>
      <Section id="events" title="Events" summary={cats.length ? cats.join(', ') : 'All categories'} open={open === 'events'} setOpen={setOpen}>
        <EventPrefs />
      </Section>
      <Documents job={job} />
      <AppSettings />
    </div>
  )
}
