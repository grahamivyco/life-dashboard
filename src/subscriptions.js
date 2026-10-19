// Where to manage or cancel each subscription, and the short steps to do it.
// Matched by name (case-insensitive substring). Unknown ones fall back to a search.
const GUIDES = [
  { match: 'claude', url: 'https://claude.ai/settings/billing', steps: ['Open Settings, then Billing.', 'Pick Cancel plan, or a smaller plan to downgrade.', 'You keep access until the end of the paid month.'] },
  { match: 'youtube', url: 'https://www.youtube.com/paid_memberships', steps: ['Open Purchases and memberships.', 'Under YouTube Premium, pick Deactivate.', 'Choose Continue to cancel and confirm.'] },
  { match: 'apple', url: 'https://apps.apple.com/account/subscriptions', steps: ['On iPhone: Settings, tap your name, then Subscriptions.', 'Pick the subscription and tap Cancel Subscription.', 'Apple bundles several apps here, so check each one.'] },
  { match: 'google one', url: 'https://one.google.com/settings', steps: ['Open Google One settings.', 'Pick Cancel membership, or Change membership plan for a smaller one.', 'Storage over the free 15 GB becomes read-only.'] },
  { match: 'workspace', url: 'https://admin.google.com/ac/billing/subscriptions', steps: ['Open Billing, then Subscriptions in the Admin console.', 'Pick the Workspace plan, then More, then Cancel subscription.', 'Export any mail or files first.'] },
  { match: 'amazon prime', url: 'https://www.amazon.com/mc/manage', steps: ['Open Manage Prime membership.', 'Pick End membership and follow the prompts.', 'Unused months may be refunded.'] },
  { match: 'patreon', url: 'https://www.patreon.com/settings/memberships', steps: ['Open Memberships in Patreon settings.', 'Pick the creator, then Edit, then Cancel membership.'] },
  { match: 'flexjobs', url: 'https://www.flexjobs.com/members/account', steps: ['Log in and open Account Settings.', 'Pick Cancel subscription.'] },
  { match: 'tune my music', url: 'https://www.tunemymusic.com/', steps: ['Log in and open your account.', 'Pick Manage subscription, then Cancel.'] },
]

export function cancelGuide(name) {
  const n = name.toLowerCase()
  return GUIDES.find((g) => n.includes(g.match)) || {
    url: `https://www.google.com/search?q=${encodeURIComponent(`cancel ${name} subscription`)}`,
    steps: ['Search shows the official cancel page.', 'Look for Billing, Membership or Subscription in your account.'],
    search: true,
  }
}
