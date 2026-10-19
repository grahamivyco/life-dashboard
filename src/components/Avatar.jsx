import { useEffect, useState } from 'react'
import { supabase } from '../supabase.js'

// Round profile picture for the phone tab bar. Falls back to the first initial.
export default function Avatar({ size = 24, photo }) {
  const [initial, setInitial] = useState('G')
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const e = data.session?.user?.email
      if (e) setInitial(e[0].toUpperCase())
    })
  }, [])
  return photo
    ? <img className="avatar" src={photo} alt="" width={size} height={size} />
    : <span className="avatar" style={{ width: size, height: size }}>{initial}</span>
}
