// Demo mode: a fake Supabase client with sample data, used for preview screenshots.
// Built with `vite build --mode demo`. Never touches real data.

const now = Date.now()
const iso = (h) => new Date(now - h * 3600e3).toISOString()
const day = (d) => new Date(now + d * 864e5).toISOString().slice(0, 10)


// Simple drawn "room" pictures for listing photos (no network in previews)
const room = (wall, floor, sky) => 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200"><rect width="320" height="200" fill="${wall}"/><rect y="150" width="320" height="50" fill="${floor}"/><rect x="190" y="34" width="86" height="104" rx="2" fill="${sky}"/><rect x="231" y="34" width="4" height="104" fill="${wall}"/><rect x="190" y="84" width="86" height="4" fill="${wall}"/><rect x="36" y="118" width="110" height="34" rx="6" fill="#8C8577"/><rect x="40" y="104" width="30" height="20" rx="5" fill="#A49D8F"/></svg>`)

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
    { id: 'r1', action: 'auto', item_id: 'i1', status: 'needs_approval', summary: 'Drafted a message to Emma', approval_ask: 'Send this email to Emma?', result: 'Hi Emma, Tess’s wedding is set for…', links: [], item: { title: 'Tell Emma about Tess’s wedding' }, updated_at: iso(1) },
    { id: 'r4', action: 'auto', item_id: 'i5', status: 'done', summary: 'Built together with the mic button', result: 'The wave is part of the mic button preview.\nApprove "Mic button on Mac and iPhone" to ship both.', links: [], item: { title: 'Voice wave animation' }, updated_at: iso(0.2) },
    { id: 'r5', action: 'auto', item_id: 'i5', status: 'needs_approval', summary: 'Mic button and live transcript in the brain dump box', approval_ask: 'Ship this to the app?', result: 'Mic button next to Save.', links: [], item: { title: 'Mic button on Mac and iPhone' }, updated_at: iso(0.3) },
    { id: 'r2', action: 'auto', item_id: 'i2', status: 'done', summary: '3 outfit options under €150', result: '1. Linen suit…', links: [], item: { title: 'Get an outfit for the wedding' }, updated_at: iso(1) },
    { id: 'a2', action: 'ask', note: 'Remind me to call the landlord about the heating on Friday', status: 'done', result: 'Added for Friday: call the landlord about the heating.', created_at: iso(0.3), updated_at: iso(0.3) },
    { id: 'a3', action: 'ask', note: 'Make the week tile show the next 14 days', status: 'needs_approval', summary: 'Week tile now covers 14 days', result: 'Renamed it to Next two weeks and grouped events by week.', approval_ask: 'Ship this to the app?', links: [{ title: 'Preview', url: 'previews/baseline/finances-desktop.png', image: true }], created_at: iso(0.5), updated_at: iso(0.4) },
    { id: 'a1', action: 'ask', note: 'What should I wear to Tess’s wedding in Sitges?', status: 'done', result: 'Beach ceremony at 6pm, so a light linen suit or chinos with a linen shirt. Loafers, no socks.', links: [], created_at: iso(3), updated_at: iso(2) },
    { id: 'r3', action: 'auto', item_id: 'i5', status: 'queued', item: { title: 'Mic button on Mac and iPhone' }, updated_at: iso(1) },
  ],
  clients: [
    { id: 'c1', name: 'Riverside Quilt Club', short: 'RQC', notes: 'Website and newsletter. $200 a week, paused until we agree a plan.\nTalk to Dana about the events page first.', position: 0 },
    { id: 'c2', name: 'Northwind Apps', notes: '', position: 1 },
  ],
  section_snapshots: [
    { section: 'clients', synced_at: iso(0.3), payload: { clients: [
      { id: 'c1', summary: 'Dana asked to pause the weekly invoice until there’s a plan. Sam is waiting on the events page fixes.', threads: [
        { id: 't1', from: 'Kym Duea', subject: 'Annual Meeting page has slipped a stitch', date: iso(1), unread: true, needs_reply: true, url: '#' },
        { id: 'x2', from: 'Dana Brook', subject: 'Fwd: Invoice #29', date: iso(70), unread: true, needs_reply: true, url: '#' },
        { id: 'x3', from: 'Club president', subject: 'Find a fellow stitcher page', date: iso(150), needs_reply: false, url: '#' },
        { id: 'x4', from: 'Sam Lee', subject: 'Re: Scrolling on the member list', date: iso(280), needs_reply: false, url: '#' },
        { id: 'x5', from: 'Club president', subject: 'Names on Leadership Team', date: iso(500), needs_reply: false, url: '#' },
      ], invoices: [
        { number: 29, amount: 200, date: iso(70), status: 'disputed', note: 'Asked to pause', url: '#' },
        { number: 28, amount: 200, date: iso(170), status: 'paid', note: 'Paid by check', url: '#' },
        { number: 26, amount: 220, date: iso(430), status: 'disputed', note: 'Asked to cancel', url: '#' },
        { number: 25, amount: 260, date: iso(450), status: 'sent', url: '#' },
      ] },
      { id: 'c2', summary: '', threads: [
        { id: 'y1', from: 'Slack', subject: 'You have 14 unread messages in Northwind Dev', date: iso(900), needs_reply: false, url: '#' },
      ], invoices: [] },
    ] } },
    { section: 'housing', synced_at: iso(0.4), payload: {
      source: 'idealista',
      search: { label: 'Homes in several areas · up to €1,600 · 3+ bedrooms · balcony', url: '#' },
      listings: [
        { id: '112847192', street: 'Calle de l’Agricultura', area: 'Sant Martí de Provençals', district: 'Sant Martí', price: 1132, beds: 3, size_m2: 75, floor: '1', exterior: true, lift: true, balcony: true, photo: room('#E9E1D3', '#B9A27F', '#BFD6E4'), url: '#', first_seen: iso(5) },
        { id: 'h2', street: 'Calle de Fluvià', area: 'Sant Martí de Provençals', district: 'Sant Martí', price: 1280, beds: 3, size_m2: 82, floor: '4', exterior: true, lift: true, balcony: true, photo: room('#EEE8DC', '#C2AE8E', '#CADFEA'), url: '#', first_seen: iso(52) },
        { id: 'h3', street: 'Calle de Mateu', area: 'Vila de Gràcia', district: 'Gràcia', price: 1363, beds: 3, size_m2: 78, floor: '2', exterior: true, lift: false, balcony: true, photo: room('#F0E6D6', '#A88C66', '#D2E3EC'), url: '#', first_seen: iso(125) },
        { id: 'h4', street: 'Calle d’Alí Bei', area: 'El Fort Pienc', district: 'Eixample', price: 1200, beds: 3, size_m2: 86, floor: '3', exterior: false, lift: true, balcony: true, photo: room('#E6E2DA', '#9F8A6C', '#C5D8E2'), url: '#', first_seen: iso(76) },
        { id: 'h5', street: 'Calle del Marquès de Campo Sagrado', area: 'Sant Antoni', district: 'Eixample', price: 1424, prev_price: 1500, beds: 3, size_m2: 106, floor: '2', exterior: true, lift: true, balcony: true, photo: room('#EFE9DF', '#B49A74', '#CFE0E8'), url: '#', first_seen: iso(100) },
        { id: 'h6', street: 'Calle de Lepant', area: 'La Sagrada Família', district: 'Eixample', price: 1081, beds: 3, size_m2: 77, floor: '7', exterior: true, lift: true, balcony: true, photo: room('#E8E4DA', '#B7A386', '#C8DCE7'), url: '#', first_seen: iso(122) },
        { id: 'h7', street: 'Doctor Letamendi', area: 'L’Antiga Esquerra de l’Eixample', district: 'Eixample', price: 1252, prev_price: 1375, beds: 1, size_m2: 70, floor: 'Mezzanine', exterior: true, balcony: false, url: '#', first_seen: iso(150), gone: true },
      ],
    } },
    { section: 'email', synced_at: iso(0.2), payload: { unread: 3, threads: [
      { id: 't1', from: 'Kym Duea', subject: 'Annual Meeting page has slipped a stitch', snippet: 'I noticed an issue on the Annual Meeting page…', message: 'Also the registration link at the bottom goes nowhere. Thanks for taking a look!\n\nKym', date: iso(1), unread: true, important: true, count: 2, url: '#', replies: [
        { label: 'On it today', body: 'Hi Kym,\n\nThanks for catching this. I’ll fix the page and the registration link today and let you know when it’s live.\n\nGraham' },
        { label: 'This week', body: 'Hi Kym,\n\nThanks for the heads up and the screenshot. I’ll have the page and the link fixed by Friday.\n\nGraham' },
        { label: 'Ask for details', body: 'Hi Kym,\n\nThanks for flagging this. Which browser were you using? I want to make sure I see the same thing before I fix it.\n\nGraham' },
      ] },
      { id: 't2', from: 'idealista', subject: 'New home in your search', snippet: 'Gràcia 1,100 €/month…', date: iso(4), unread: true, important: false, count: 3, url: '#' },
      { id: 't4', from: 'Queles Alivés', subject: 'Re: Piso en Calle dels Boters', snippet: 'Can you come Thursday at 10 to sign?', message: 'Hola Graham,\n\n¿Puedes venir el jueves a las 10:00 para firmar el contrato? Trae el pasaporte.\n\nQueles', date: iso(3), unread: true, important: true, count: 6, url: '#', replies: [
        { label: 'Sí, el jueves', body: 'Hola Queles,\n\nPerfecto, el jueves a las 10:00 allí estaré con el pasaporte.\n\nGracias,\nGraham' },
        { label: 'Otro día', body: 'Hola Queles,\n\nEl jueves no me va bien. ¿Podría ser el viernes por la mañana?\n\nGracias,\nGraham' },
        { label: 'Una pregunta', body: 'Hola Queles,\n\nGenial. ¿Necesito traer algo más aparte del pasaporte, como la fianza?\n\nGracias,\nGraham' },
      ] },
      { id: 't3', from: 'CIEE TEFL', subject: 'Your TEFL certificate', snippet: 'Please find your certificate attached.', date: iso(28), unread: false, important: true, count: 2, url: '#' },
    ] } },
    { section: 'jobs', synced_at: iso(0.3), payload: {
      source: 'Job Hub', hub_url: '#', updated: 'Oct 15, 2026',
      digest: { date: day(0), url: '#', thread_id: 'dg1',
        intro: 'Number 1 is the cleanest fit: worldwide contract that asks for a USD rate. Number 2 closes soon.',
        picks: [
          { n: 1, role: 'Graphic Designer (contract)', org: 'Lingo Studio', url: '#', where: 'Worldwide', pay: 'Asks for a USD rate', deadline: day(50), why: 'Ongoing contract. Social and ad graphics. Lead with your Spanish and Portuguese.', apply: 'Free account, then apply with CV.' },
          { n: 2, role: 'Video Editor and Designer', org: 'Ocean Trust', url: '#', where: 'Worldwide', pay: 'Not listed', deadline: day(5), why: 'Conservation mission. Short-form video plus print. Lead with Reels work.' },
          { n: 3, role: 'Brand Designer', org: 'Fieldnotes', url: '#', where: 'Remote, EU', pay: '€45–55K', deadline: day(30), why: 'Mid-level brand role. Lead with Open Frame identity work.' },
          { n: 4, role: 'Learning Designer', org: 'Open Classroom', url: '#', where: 'Worldwide', pay: '$60–70K', deadline: day(21), why: 'Education mission, curriculum and visual design.' },
          { n: 5, role: 'Community Coordinator', org: 'Makers Co', url: '#', where: 'Worldwide', pay: 'USD salary', deadline: day(40), why: 'Run a creator community. Lead with social strategy and Spanish.' },
        ],
        closing: [{ text: 'Instructional Design Consultant, Health Org', deadline: day(1) }, { text: 'Communications Contractor, UN Lab', deadline: day(2) }],
        also: [{ text: 'Email Designer, part-time', url: '#' }, { text: 'Landing page designer, $20–25/h', url: '#' }],
      },
      jobs: [
        { slug: 'a', role: 'Digital Content and Marketing Coordinator', short: 'Data for Good', org: 'Data for Good · fully remote', pay: '$60–65K', score: 80, grade: 'B', due: null, dueText: 'Rolling', why: 'Nonprofit, fully remote, pay in your range.', next: 'Confirm your references, then apply.', actions: [{ label: 'Apply', href: '#', primary: true }, { label: 'Job posting', href: '#' }], docs: ['Resume PDF', 'Cover letter PDF'], steps: ['Click Apply and fill in your details.', 'Upload resume and cover letter.', 'Paste the answers below.'], paste: [{ title: 'Desired pay', text: '$62,000–65,000 USD per year.' }], app: null },
        { slug: 'b', role: 'Learning Experience Designer', short: 'Bright Path', org: 'Bright Path · remote worldwide', pay: 'Asked $75K', score: 76, grade: 'B', actions: [], docs: [], paste: [], app: { status: 'applied', appliedAt: iso(240), waitingOn: 'Waiting to hear back.', updates: [{ date: iso(240), text: 'Submitted. Confirmation email received.' }, { date: iso(70), text: 'Follow-up email sent.' }] } },
        { slug: 'c', role: 'Visual Designer', short: 'Studio North', org: 'Studio North', pay: 'Not listed', score: 72, grade: 'B', actions: [], docs: [], paste: [], app: { status: 'approved', needsYou: true, finishUrl: '#', waitingOn: 'They ban AI-written answers, so these three are yours to write.', asks: [{ q: 'Describe your most complex web design project.' }, { q: 'What design tools do you like best?' }], updates: [{ date: iso(30), text: 'Form filled with your details and resume.' }] } },
        { slug: 'd', role: 'Educational Content Designer', short: 'Coffee Lab', org: 'Coffee Lab · part-time contract', pay: 'Not listed', score: 72, grade: 'B', due: day(4), actions: [{ label: 'Apply', href: '#', primary: true }], docs: [], paste: [], app: null, why: 'Education design you have done before, remote anywhere.' },
        { slug: 'e', role: 'Brand Designer', short: 'Robo Co', org: 'Robo Co', pay: '$50K', score: 64, grade: 'C', actions: [], docs: [], paste: [], app: { status: 'interview', appliedAt: iso(300), waitingOn: 'Interview Thursday 15:00.', updates: [{ date: iso(20), text: 'Interview invite for Thursday 15:00 CET.' }] } },
        { slug: 'f', role: 'AI Tutor, Design', short: 'Model Lab', org: 'Model Lab · contract', pay: 'Hourly', score: 62, grade: 'C', actions: [], docs: [], paste: [], app: { status: 'approved', needsYou: false, waitingOn: 'Claude is filling the form.' } },
      ],
    } },
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

const demoChannel = { on: () => demoChannel, subscribe: () => demoChannel }

export const demoClient = {
  from: builder,
  functions: { invoke: async () => ({ data: { row: null }, error: null }) },
  channel: () => demoChannel,
  removeChannel: () => {},
  auth: {
    getSession: async () => ({ data: { session: { user: { email: 'demo@example.com' } } } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signOut: async () => {}, signInWithOtp: async () => ({}),
  },
}

// Demo Gmail for the Email page
const demoThreads = {
  t1: { id: 't1', messages: [
    { id: 'm1', threadId: 't1', from: 'Kym Duea <kym@example.com>', to: 'me', subject: 'Annual Meeting page has slipped a stitch', date: iso(26), labels: ['INBOX'], files: [{ name: 'screenshot.png', type: 'image/png', size: 182000, id: 'a1', messageId: 'm1' }],
      body: 'Good evening,\n\nWhile helping a new member get oriented on the guild website, I noticed the Annual Meeting 2027 page has an issue. Screenshot attached.\n\nKym' },
    { id: 'm2', threadId: 't1', from: 'Kym Duea <kym@example.com>', to: 'me', subject: 'Re: Annual Meeting page has slipped a stitch', date: iso(1), labels: ['INBOX', 'UNREAD'], files: [],
      body: 'Also the registration link at the bottom goes nowhere. Thanks for taking a look!' },
  ] },
  t2: { id: 't2', messages: [
    { id: 'm3', threadId: 't2', from: 'idealista <noreply@example.com>', to: 'me', subject: 'New home in your search', date: iso(4), labels: ['INBOX', 'UNREAD'], files: [], body: 'Gràcia, 1,100 €/month, 3 bedrooms, balcony.' },
  ] },
  t3: { id: 't3', messages: [
    { id: 'm4', threadId: 't3', from: 'CIEE TEFL <tefl@example.com>', to: 'me', subject: 'Your TEFL certificate', date: iso(28), labels: ['INBOX'], files: [{ name: 'TEFL-certificate.pdf', type: 'application/pdf', size: 241000, id: 'a2', messageId: 'm4' }], body: 'Greetings, Graham! Please find your TEFL certificate attached.' },
  ] },
}
const wait = () => new Promise((r) => setTimeout(r, 50))
export const demoGmail = {
  ready: () => true, connected: () => true, connect: async () => 'demo', disconnect: () => {},
  threads: async () => { await wait(); return fixtures.section_snapshots.find((s) => s.section === 'email').payload.threads },
  thread: async (id) => { await wait(); return demoThreads[id] },
  drafts: async () => { await wait(); return [
    { id: 'd1', threadId: 't1', from: 'me', to: 'Kym Duea <kym@example.com>', subject: 'Re: Annual Meeting page has slipped a stitch', date: iso(0.5), files: [],
      body: 'Hi Kym,\n\nThanks for catching this. I’ll fix the layout and the registration link by [day].\n\nGraham' },
    { id: 'd2', threadId: null, from: 'me', to: 'emma@example.com', subject: 'Tess’s wedding', date: iso(2), files: [],
      body: 'Hi Emma,\n\nTess’s wedding is on 14 November in Sitges. Want to go together?\n\nGraham' },
  ] },
  download: async () => {}, reply: async () => {}, sendDraft: async () => {}, deleteDraft: async () => {}, archive: async () => {}, markRead: async () => {},
}
