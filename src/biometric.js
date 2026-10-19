// Face ID / Touch ID / fingerprint unlock for this device. Uses a passkey on the
// device's own authenticator (WebAuthn) as a lock over the saved sign-in.
// Nothing leaves the device: the credential id is kept in localStorage.
const KEY = 'bio-lock'
const enc = (s) => new TextEncoder().encode(s)
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)))
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
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

export async function enableBio(email) {
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: random(),
      rp: { name: 'Life Dashboard' },
      user: { id: enc(email), name: email, displayName: email },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
      timeout: 60000,
    },
  })
  localStorage.setItem(KEY, b64(cred.rawId))
}

export async function unlockBio() {
  const id = localStorage.getItem(KEY)
  await navigator.credentials.get({
    publicKey: {
      challenge: random(),
      allowCredentials: [{ type: 'public-key', id: unb64(id), transports: ['internal'] }],
      userVerification: 'required',
      timeout: 60000,
    },
  })
}

export const disableBio = () => localStorage.removeItem(KEY)
