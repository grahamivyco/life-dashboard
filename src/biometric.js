import { supabase } from './supabase.js'

// Face ID / Touch ID / fingerprint unlock for this device. Uses a passkey on the
// device's own authenticator (WebAuthn) as a lock over the saved sign-in.
const KEY = 'bio-lock'
const random = () => crypto.getRandomValues(new Uint8Array(32))

export const bioName = () => {
  const ua = navigator.userAgent
  if (/iPhone|iPad/.test(ua)) return 'Face ID'
  if (/Macintosh/.test(ua)) return 'Touch ID'
  return 'fingerprint'
}

export async function bioAvailable() {
  try { return !!window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable() } catch { return false }
}

export const bioEnabled = () => { try { return !!localStorage.getItem(KEY) } catch { return false } }

// The lock reuses the Supabase sign-in passkey, so the device keeps ONE passkey
// for this site. (A separate lock-only passkey showed up in the iPhone's sign-in
// picker and Supabase rejected it.)
export async function enableBio() {
  const { data } = await supabase.auth.passkey.list()
  if (!(Array.isArray(data) ? data : []).length) {
    const { error } = await supabase.auth.registerPasskey()
    if (error) throw error
  }
  localStorage.setItem(KEY, '1')
}

export async function unlockBio() {
  await navigator.credentials.get({
    publicKey: { challenge: random(), rpId: location.hostname, userVerification: 'required', timeout: 60000 },
  })
}

export const disableBio = () => localStorage.removeItem(KEY)
