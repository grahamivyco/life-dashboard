import { useProfile, initials } from '../profile.js'

// Round profile picture (phone tab bar, rail, Profile page). Falls back to initials.
export default function Avatar({ size = 24, photo, className = 'avatar' }) {
  const p = useProfile()
  const src = photo ?? p?.photo
  return src
    ? <img className={className} src={src} alt="" width={size} height={size} />
    : <span className={className} style={{ width: size, height: size }}>{initials(p?.name || 'Graham')}</span>
}
