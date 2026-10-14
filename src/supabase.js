import { createClient } from '@supabase/supabase-js'
import { demoClient } from './demo.js'

// Publishable key: safe to ship in the browser. Data is protected by row-level security.
const SUPABASE_URL = 'https://wruevdyyhuizyydibzar.supabase.co'
const SUPABASE_KEY = 'sb_publishable_-IEt38so3aZZdnPJwl-LPQ_z_jVivE2'

export const supabase = import.meta.env.MODE === 'demo'
  ? demoClient
  : createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
  })
