// On-device translation through the browser's built-in Translator API (Chrome on desktop).
// Nothing leaves the device. Every function returns null when the browser can't do it.
export const LANGS = [
  { k: 'en', label: 'English' },
  { k: 'es', label: 'Español' },
  { k: 'ca', label: 'Català' },
]
export const langName = (k) => ({ en: 'English', es: 'Spanish', ca: 'Catalan' })[k] || k

export const canTranslate = () => typeof globalThis.Translator !== 'undefined'

let detector
export async function detect(text) {
  if (typeof globalThis.LanguageDetector === 'undefined') return null
  try {
    detector ||= await globalThis.LanguageDetector.create()
    const [top] = await detector.detect(text.slice(0, 1000))
    return top && top.confidence > 0.6 ? top.detectedLanguage : null
  } catch { return null }
}

const translators = {}
export async function translate(text, to, from) {
  if (!canTranslate() || !text.trim()) return null
  from ||= await detect(text)
  if (!from) return null
  if (from === to) return text
  const key = `${from}>${to}`
  try {
    translators[key] ||= globalThis.Translator.create({ sourceLanguage: from, targetLanguage: to })
    // Line by line, so greetings, paragraphs and the signature keep their breaks
    const t = await translators[key]
    const lines = await Promise.all(text.split('\n').map((l) => (l.trim() ? t.translate(l) : l)))
    return lines.join('\n')
  } catch {
    delete translators[key]
    return null
  }
}
