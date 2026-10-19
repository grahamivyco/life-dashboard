// Gmail in the browser: Google sign-in token + Gmail REST API. Nothing goes through a server.
import { demoGmail } from './demo.js'

// Web OAuth client from Graham's Google Cloud project "Life Dashboard". Not a secret.
export const GOOGLE_CLIENT_ID = '846753187050-5jfkod5m2125geij20auqn7h1h9kahi3.apps.googleusercontent.com'

const SCOPE = 'https://www.googleapis.com/auth/gmail.modify'
const API = 'https://gmail.googleapis.com/gmail/v1/users/me/'
const KEY = 'gmail-token'

let client = null
let pending = null

function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.onload = resolve
    s.onerror = () => reject(new Error('Could not load Google sign-in'))
    document.head.append(s)
  })
}

function stored() {
  try {
    const t = JSON.parse(localStorage.getItem(KEY) || 'null')
    return t && t.exp > Date.now() + 60000 ? t.token : null
  } catch { return null }
}

// interactive: true opens Google's consent popup (must come from a tap)
async function token(interactive) {
  const t = stored()
  if (t) return t
  if (!GOOGLE_CLIENT_ID) throw Object.assign(new Error('Gmail is not set up yet'), { code: 'no_client' })
  if (!interactive && !localStorage.getItem(KEY)) throw Object.assign(new Error('Connect Gmail first'), { code: 'signed_out' })
  await loadGis()
  if (!pending) {
    pending = new Promise((resolve, reject) => {
      client = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: SCOPE,
        callback: (r) => {
          pending = null
          if (r.error) return reject(Object.assign(new Error(r.error_description || r.error), { code: 'signed_out' }))
          localStorage.setItem(KEY, JSON.stringify({ token: r.access_token, exp: Date.now() + r.expires_in * 1000 }))
          resolve(r.access_token)
        },
        error_callback: (e) => { pending = null; reject(Object.assign(new Error(e.message || 'Sign-in closed'), { code: 'signed_out' })) },
      })
      client.requestAccessToken({ prompt: localStorage.getItem(KEY) ? '' : 'consent' })
    })
  }
  return pending
}

async function api(path, opts = {}, retry = true) {
  const t = await token(false)
  const res = await fetch(API + path, {
    ...opts,
    headers: { Authorization: `Bearer ${t}`, ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
  })
  if (res.status === 401 && retry) {
    const old = JSON.parse(localStorage.getItem(KEY) || '{}')
    localStorage.setItem(KEY, JSON.stringify({ ...old, exp: 0 }))
    return api(path, opts, false)
  }
  if (!res.ok) throw new Error(`Gmail said ${res.status}: ${(await res.text()).slice(0, 160)}`)
  return res.status === 204 ? null : res.json()
}

// ---------- parsing ----------
const b64urlToBytes = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
const decode = (s) => new TextDecoder().decode(b64urlToBytes(s))
const header = (m, name) => m.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || ''
const htmlToText = (html) => {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('style, script, .gmail_quote, blockquote').forEach((n) => n.remove())
  doc.querySelectorAll('br').forEach((n) => n.replaceWith('\n'))
  doc.querySelectorAll('p, div, li, tr').forEach((n) => n.append('\n'))
  return doc.body.textContent.replace(/ /g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}
const stripQuote = (t) => { const i = t.search(/\n\s*On .{5,200}wrote:\s*\n/); return (i > 0 ? t.slice(0, i) : t).trim() }
export const nameOf = (from) => (from.match(/^\s*"?([^"<]+?)"?\s*</)?.[1] || from).trim()
export const emailOf = (from) => (from.match(/<([^>]+)>/)?.[1] || from).trim()

function walk(part, out) {
  if (part.filename && part.body?.attachmentId) {
    out.files.push({ name: part.filename, type: part.mimeType, size: part.body.size, id: part.body.attachmentId })
  } else if (part.mimeType === 'text/plain' && part.body?.data && !out.text) out.text = decode(part.body.data)
  else if (part.mimeType === 'text/html' && part.body?.data && !out.html) out.html = decode(part.body.data)
  for (const p of part.parts || []) walk(p, out)
}

function parseMessage(m) {
  const out = { text: '', html: '', files: [] }
  if (m.payload) walk(m.payload, out)
  const body = out.text || (out.html ? htmlToText(out.html) : m.snippet || '')
  return {
    id: m.id, threadId: m.threadId, labels: m.labelIds || [],
    from: header(m, 'From'), to: header(m, 'To'), cc: header(m, 'Cc'), replyTo: header(m, 'Reply-To'),
    subject: header(m, 'Subject'), date: new Date(Number(m.internalDate)).toISOString(),
    messageId: header(m, 'Message-ID') || header(m, 'Message-Id'), references: header(m, 'References'), inReplyTo: header(m, 'In-Reply-To'),
    body: stripQuote(body), files: out.files.map((f) => ({ ...f, messageId: m.id })),
  }
}

// RFC 2047 for non-ASCII headers, base64 body
const b64 = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s)))
const enc = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`)
const toB64url = (s) => b64(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
function mime({ to, cc, subject, body, inReplyTo, references }) {
  const lines = [`To: ${to}`]
  if (cc) lines.push(`Cc: ${cc}`)
  lines.push(`Subject: ${enc(subject)}`)
  if (inReplyTo) lines.push(`In-Reply-To: ${inReplyTo}`, `References: ${[references, inReplyTo].filter(Boolean).join(' ')}`)
  lines.push('MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(body).replace(/.{76}/g, '$&\r\n'))
  return toB64url(lines.join('\r\n'))
}

const real = {
  ready: () => Boolean(GOOGLE_CLIENT_ID),
  connected: () => Boolean(localStorage.getItem(KEY)),
  connect: () => token(true),
  disconnect: () => {
    const t = stored()
    if (t && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(t)
    localStorage.removeItem(KEY)
  },

  async threads(q = 'in:inbox category:primary', max = 30) {
    const r = await api(`threads?maxResults=${max}&q=${encodeURIComponent(q)}`)
    const list = r.threads || []
    return Promise.all(list.map(async (t) => {
      const full = await api(`threads/${t.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`)
      const msgs = full.messages || []
      const last = msgs[msgs.length - 1]
      const sent = msgs.filter((m) => !(m.labelIds || []).includes('DRAFT'))
      const labels = new Set(msgs.flatMap((m) => m.labelIds || []))
      return {
        id: t.id, snippet: htmlToText(t.snippet || ''), count: msgs.length,
        // Graham wrote the latest (non-draft) message, so nothing is waiting on him
        fromMe: (sent[sent.length - 1]?.labelIds || []).includes('SENT'),
        from: nameOf(header(last, 'From')), subject: header(msgs[0], 'Subject'),
        date: new Date(Number(last.internalDate)).toISOString(),
        unread: labels.has('UNREAD'), important: labels.has('IMPORTANT'),
      }
    }))
  },

  async thread(id) {
    const t = await api(`threads/${id}?format=full`)
    return { id, messages: (t.messages || []).map(parseMessage) }
  },

  async drafts() {
    const r = await api('drafts?maxResults=50')
    return Promise.all((r.drafts || []).map(async (d) => {
      const full = await api(`drafts/${d.id}?format=full`)
      return { id: d.id, ...parseMessage(full.message) }
    }))
  },

  async download(file) {
    const r = await api(`messages/${file.messageId}/attachments/${file.id}`)
    // Never give the browser a type it would run as a page on this site (HTML/SVG/XML attachments)
    const type = /html|svg|xml|javascript/i.test(file.type || '') ? 'application/octet-stream' : file.type || 'application/octet-stream'
    const blob = new Blob([b64urlToBytes(r.data)], { type })
    const url = URL.createObjectURL(blob)
    const a = Object.assign(document.createElement('a'), { href: url, download: file.name })
    document.body.append(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 30000)
  },

  // Reply in the thread to the last message not sent by me
  async reply(thread, body, me) {
    const msgs = thread.messages
    const theirs = [...msgs].reverse().find((m) => !emailOf(m.from).toLowerCase().includes(me)) || msgs[msgs.length - 1]
    const subject = /^re:/i.test(theirs.subject) ? theirs.subject : `Re: ${theirs.subject}`
    const raw = mime({ to: theirs.replyTo || theirs.from, subject, body, inReplyTo: theirs.messageId, references: theirs.references })
    return api('messages/send', { method: 'POST', body: JSON.stringify({ raw, threadId: thread.id }) })
  },

  // Send a draft as is, or with edits
  async sendDraft(d, edits) {
    if (edits) {
      const raw = mime({ to: edits.to, cc: d.cc, subject: edits.subject, body: edits.body, inReplyTo: d.inReplyTo, references: d.references })
      await api(`drafts/${d.id}`, { method: 'PUT', body: JSON.stringify({ id: d.id, message: { raw, threadId: d.threadId } }) })
    }
    return api('drafts/send', { method: 'POST', body: JSON.stringify({ id: d.id }) })
  },

  deleteDraft: (id) => api(`drafts/${id}`, { method: 'DELETE' }),
  archive: (id) => api(`threads/${id}/modify`, { method: 'POST', body: JSON.stringify({ removeLabelIds: ['INBOX'] }) }),
  markRead: (id) => api(`threads/${id}/modify`, { method: 'POST', body: JSON.stringify({ removeLabelIds: ['UNREAD'] }) }),
}

export const gmail = import.meta.env.MODE === 'demo' ? demoGmail : real
