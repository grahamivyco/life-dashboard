// Google Calendar straight from the browser, with the same Google sign-in as Email.
// Returns events in the same shape the hourly sync writes to the 'events' snapshot.
import { google } from './gmail.js'

const CAL = 'https://www.googleapis.com/calendar/v3/'
const CACHE = 'gcal-cache'

const plain = (html) => {
  const doc = new DOMParser().parseFromString(String(html).replace(/<br\s*\/?>/gi, '\n'), 'text/html')
  return doc.body.textContent
    .split('\n').filter((l) => !/To see detailed information|This event was created from an email|Invitation from Google Calendar/i.test(l))
    .join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 300)
}

const when = (t) => t?.dateTime || t?.date

export async function liveEvents(days = 30) {
  const from = new Date(); from.setHours(0, 0, 0, 0)
  const to = new Date(from); to.setDate(to.getDate() + days)
  const { items = [] } = await google.get(`${CAL}users/me/calendarList?maxResults=250`)
  const cals = items.filter((c) => !c.deleted && !/^Holidays in United States$/i.test(c.summary))
  const lists = await Promise.all(cals.map(async (c) => {
    const q = new URLSearchParams({ timeMin: from.toISOString(), timeMax: to.toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '250' })
    const { items: evs = [] } = await google.get(`${CAL}calendars/${encodeURIComponent(c.id)}/events?${q}`)
    const name = c.primary ? 'Graham' : c.summaryOverride || c.summary
    return evs
      .filter((e) => e.status !== 'cancelled' && !(e.summary || '').startsWith('[Archived'))
      .filter((e) => !e.attendees?.some((a) => a.self && a.responseStatus === 'declined'))
      .map((e) => ({
        id: e.id, title: e.summary || '(No title)', start: when(e.start), end: when(e.end), all_day: !e.start?.dateTime,
        location: e.location || undefined, notes: e.description ? plain(e.description) || undefined : undefined,
        calendar: name, url: e.htmlLink, series: e.recurringEventId || undefined,
      }))
  }))
  const events = lists.flat().sort((a, b) => new Date(a.start) - new Date(b.start))
  const out = { at: new Date().toISOString(), events }
  try { localStorage.setItem(CACHE, JSON.stringify(out)) } catch {}
  return out
}

// Last live copy on this device, so the page shows something before the fetch returns
export function cachedEvents() {
  if (!google.calendar()) return null
  try { return JSON.parse(localStorage.getItem(CACHE) || 'null') } catch { return null }
}

// Turns Google's error into one line Graham can act on
export function calError(e) {
  const m = String(e?.message || e)
  if (/accessNotConfigured|has not been used|is disabled/i.test(m)) return 'The Google Calendar API is off in your Google Cloud project. Turn it on, then reload.'
  if (e?.status === 401 || e?.status === 403 || /signed_out|Connect/i.test(m)) return 'Google sign-in expired. Tap Connect again.'
  return 'Could not reach Google Calendar. Showing the last sync.'
}
