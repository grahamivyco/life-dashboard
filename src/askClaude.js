import { supabase } from './supabase.js'

// Send a message to Claude. It lands in the claude_requests queue (action 'ask')
// and the hourly worker answers it. Shared by the floating panel and any other
// "Ask Claude" button. (supabase/functions/ask-claude can give instant replies
// later if an ANTHROPIC_API_KEY is ever added; it is not used right now.)
export async function askClaude(message) {
  const { data, error } = await supabase.from('claude_requests').insert({ action: 'ask', note: message }).select().single()
  if (error) throw new Error(error.message)
  return { row: data }
}
