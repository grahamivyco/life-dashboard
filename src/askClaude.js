import { supabase } from './supabase.js'

// Send a message to Claude through the ask-claude edge function (instant reply).
// Returns the saved claude_requests row. Shared by the floating panel and any
// other "Ask Claude" button. If no API key is set yet, the function queues it
// for the hourly worker and returns { queued: true }.
export async function askClaude(message) {
  const { data, error } = await supabase.functions.invoke('ask-claude', { body: { message } })
  if (error) throw new Error(error.message)
  if (data?.error && !data.queued) throw new Error(data.error)
  return data
}
