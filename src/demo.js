// Demo mode: a fake Supabase client with sample data, used for preview screenshots.
// Built with `vite build --mode demo`. Never touches real data.

const now = Date.now()
const iso = (h) => new Date(now - h * 3600e3).toISOString()
const day = (d) => new Date(now + d * 864e5).toISOString().slice(0, 10)

const fixtures = {
  items: [
    { id: 'i1', kind: 'task', title: 'Tell Emma about Tess’s wedding', status: 'open', due_date: day(1), created_at: iso(2) },
    { id: 'i2', kind: 'task', title: 'Get an outfit for the wedding', status: 'open', due_date: day(3), created_at: iso(2) },
    { id: 'i3', kind: 'task', title: 'Finish dashboard pages', status: 'open', due_date: day(0), created_at: iso(3) },
    { id: 'i4', kind: 'goal', title: 'Post on Hey Famm every week', body: 'Post and reply to people', status: 'open', progress: 30, created_at: iso(5) },
    { id: 'i5', kind: 'idea', title: 'Mic button on Mac and iPhone', status: 'open', created_at: iso(5) },
    { id: 'i6', kind: 'note', title: 'Joined Hey Famm', status: 'open', created_at: iso(6) },
  ],
  brain_dumps: [
    { id: 'd1', content: 'Woke up and worked on the events calendar. Reggaeton class at 7:30. Need to plan Tess’s wedding trip.', created_at: iso(3), processed_at: iso(2) },
    { id: 'd2', content: 'Morning plan: finish the inbox page, reply to Kym, groceries.', created_at: iso(26), processed_at: iso(25) },
  ],
  events: [
    { id: 'e1', title: 'Salsa at Imperial', starts_at: new Date(now + 864e5 * 1).toISOString(), location: 'Imperial Meeting Point' },
    { id: 'e2', title: 'Bailaqueer', starts_at: new Date(now + 864e5 * 3).toISOString(), location: 'Pati Llimona' },
  ],
  claude_requests: [
    { id: 'r1', item_id: 'i1', status: 'needs_approval', summary: 'Drafted a message to Emma', approval_ask: 'Send this email to Emma?', result: 'Hi Emma, Tess’s wedding is set for…', links: [], item: { title: 'Tell Emma about Tess’s wedding' }, updated_at: iso(1) },
    { id: 'r2', item_id: 'i2', status: 'done', summary: '3 outfit options under €150', result: '1. Linen suit…', links: [], item: { title: 'Get an outfit for the wedding' }, updated_at: iso(1) },
    { id: 'r3', item_id: 'i5', status: 'queued', item: { title: 'Mic button on Mac and iPhone' }, updated_at: iso(1) },
  ],
  section_snapshots: [
    { section: 'email', synced_at: iso(0.2), payload: { unread: 3, threads: [
      { id: 't1', from: 'Kym Duea', subject: 'Annual Meeting page has slipped a stitch', snippet: 'I noticed an issue on the Annual Meeting page…', date: iso(1), unread: true, important: true, count: 2, url: '#' },
      { id: 't2', from: 'idealista', subject: 'New home in your search', snippet: 'Gràcia 1,100 €/month…', date: iso(4), unread: true, important: false, count: 3, url: '#' },
      { id: 't3', from: 'CIEE TEFL', subject: 'Your TEFL certificate', snippet: 'Please find your certificate attached.', date: iso(28), unread: false, important: true, count: 2, url: '#' },
    ] } },
    { section: 'finances', synced_at: iso(0.5), payload: {
      currency: 'USD', source: 'Era', warnings: [],
      totals: { cash: 2400, invest: 41000, credit: 650, net_worth: 42750 },
      accounts: [
        { institution: 'Bank', name: 'Checking', group: 'cash', balance: 1400 },
        { institution: 'Business', name: 'Checking', group: 'cash', balance: 1000 },
        { institution: 'Broker', name: 'Brokerage', group: 'invest', balance: 30000 },
        { institution: 'Broker', name: 'Roth IRA', group: 'invest', balance: 11000 },
        { institution: 'Card', name: 'Credit card', group: 'credit', balance: 650 },
      ],
      cashflow: [
        { label: 'May', income: 900, spending: 2800, net: -1900 }, { label: 'Jun', income: 1300, spending: 4200, net: -2900 },
        { label: 'Jul', income: 8000, spending: 5000, net: 3000 }, { label: 'Aug', income: 600, spending: 2100, net: -1500 },
        { label: 'Sep', income: 6000, spending: 5200, net: 800 }, { label: 'Oct', income: 3000, spending: 2600, net: 400 },
      ],
      avg: { income: 3300, spending: 3650, net: -350 },
      transactions: [
        { date: day(-1), merchant: 'Mercadona', account: 'Card', amount: -42.1, transfer: false },
        { date: day(-2), merchant: 'Client payment', account: 'Business', amount: 400, transfer: false },
        { date: day(-3), merchant: 'Café', account: 'Card', amount: -6.5, transfer: false },
      ],
      subscriptions: [{ name: 'Claude', amount: 100 }, { name: 'YouTube', amount: 29.19 }],
    } },
  ],
}

function builder(table) {
  let rows = [...(fixtures[table] || [])]
  const q = {
    select: () => q, order: () => q, limit: () => q, not: () => q, is: () => q, like: () => q,
    gte: () => q, lt: () => q, lte: () => q, neq: () => q,
    eq: (k, v) => { rows = rows.filter((r) => r[k] === undefined || r[k] === v); return q },
    in: (k, vs) => { rows = rows.filter((r) => r[k] === undefined || vs.includes(r[k])); return q },
    insert: () => q, update: () => q, delete: () => q,
    then: (res) => res({ data: rows, count: rows.length, error: null }),
  }
  return q
}

export const demoClient = {
  from: builder,
  auth: {
    getSession: async () => ({ data: { session: { user: { email: 'demo@example.com' } } } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signOut: async () => {}, signInWithOtp: async () => ({}),
  },
}
