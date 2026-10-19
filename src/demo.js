// Demo mode: a fake Supabase client with sample data, used for preview screenshots.
// Built with `vite build --mode demo`. Never touches real data.

const now = Date.now()
const iso = (h) => new Date(now - h * 3600e3).toISOString()
// d days from today at h:m local time
const at = (d, h, m = 0) => { const x = new Date(now + d * 864e5); x.setHours(h, m, 0, 0); return x.toISOString() }
const gcal = 'https://calendar.google.com/'
const workBlocks = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
  .map((d) => new Date(now + d * 864e5)).filter((x) => x.getDay() > 0 && x.getDay() < 6)
  .map((x, i) => { const s = new Date(x); s.setHours(11, 0, 0, 0); const e = new Date(s); e.setHours(16); return { id: `w${i}`, title: 'Work block', start: s.toISOString(), end: e.toISOString(), calendar: 'Graham', series: 'work', url: gcal } })
const day = (d) => new Date(now + d * 864e5).toISOString().slice(0, 10)


// Simple drawn "room" pictures for listing photos (no network in previews)
const room = (wall, floor, sky) => 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200"><rect width="320" height="200" fill="${wall}"/><rect y="150" width="320" height="50" fill="${floor}"/><rect x="190" y="34" width="86" height="104" rx="2" fill="${sky}"/><rect x="231" y="34" width="4" height="104" fill="${wall}"/><rect x="190" y="84" width="86" height="4" fill="${wall}"/><rect x="36" y="118" width="110" height="34" rx="6" fill="#8C8577"/><rect x="40" y="104" width="30" height="20" rx="5" fill="#A49D8F"/></svg>`)


// Jobs page sample rows (public.jobs shape)
const dg = (n) => ({ n, date: day(0), thread_id: 'dg1', url: '#' })
const J = (o) => ({ status: 'new', needs_you: false, actions: [{ label: 'Job posting', href: '#', primary: true }], docs: [], paste: [], steps: [], asks: [], updates: [], extra: {}, ...o })
const resume = { label: 'Resume PDF', path: 'docs/demo-resume.pdf', save: 'Graham-Ivy-Resume.pdf' }
const cover = { label: 'Cover letter PDF', path: 'docs/demo-cover-letter.pdf' }
const portfolio = { label: 'Portfolio PDF', path: 'docs/base/Graham-Ivy-Portfolio.pdf' }
const demoJobs = [
  J({ slug: 'p1', source: 'digest', role: 'Graphic Designer (contract)', short: 'Lingo Studio', org: 'Lingo Studio', pay: 'Asks for a USD rate', score: 82, due: day(50), extra: { where: 'Worldwide', digest: dg(1) }, why: 'Ongoing contract. Social and ad graphics for a translation company. Lead with your Spanish and Portuguese.', steps: ['Free account, then apply with CV.', 'Upload the design resume and portfolio.'], docs: [resume, portfolio], paste: [{ title: 'Rate', text: '$35 USD per hour.' }] }),
  J({ slug: 'p2', source: 'digest', role: 'Video Editor and Designer', short: 'Ocean Trust', pay: 'Not listed', score: 74, due: day(5), extra: { where: 'Worldwide', digest: dg(2) }, why: 'Conservation mission. Short-form video plus print. Lead with Reels work.' }),
  J({ slug: 'p3', source: 'digest', role: 'Brand Designer', short: 'Fieldnotes', pay: '€45–55K', score: 70, due: day(30), extra: { where: 'Remote, EU', digest: dg(3) }, why: 'Mid-level brand role. Lead with Open Frame identity work.' }),
  J({ slug: 'p4', source: 'digest', role: 'Learning Designer', short: 'Open Classroom', pay: '$60–70K', score: 77, due: day(21), extra: { where: 'Worldwide', digest: dg(4) }, why: 'Education mission, curriculum and visual design.' }),
  J({ slug: 'p5', source: 'digest', role: 'Community Coordinator', short: 'Makers Co', pay: 'USD salary', score: 61, due: day(40), extra: { where: 'Worldwide', digest: dg(5) }, why: 'Run a creator community. Lead with social strategy and Spanish.' }),
  J({ slug: 'a', role: 'Digital Content and Marketing Coordinator', short: 'Data for Good', org: 'Data for Good · fully remote', pay: '$60–65K', score: 80, due_text: 'Rolling', why: 'Nonprofit, fully remote, pay in your range.', docs: [resume, cover] }),
  J({ slug: 'd', role: 'Educational Content Designer', short: 'Coffee Lab', org: 'Coffee Lab · part-time contract', pay: 'Not listed', score: 72, due: day(4), why: 'Education design you have done before, remote anywhere.' }),
  J({ slug: 'c', status: 'approved', needs_you: true, role: 'Visual Designer', short: 'Studio North', pay: 'Not listed', score: 72, decided_at: iso(50), filling_at: iso(30), finish_url: '#', docs: [resume, portfolio], waiting_on: 'They ban AI-written answers, so these two are yours to write. Type them here and Claude pastes them in and submits.', asks: [{ q: 'Describe your most complex web design project.', long: true }, { q: 'What design tools do you like best?', hint: 'A few sentences' }], updates: [{ date: iso(50), text: 'You approved it.' }, { date: iso(30), text: 'Form filled with your details and resume.' }], extra: { prep: { about: 'Studio North makes brand systems for open-source projects.', questions: ['Walk us through a design system you built.'], stories: ['Needlework Guild rebrand.'], ask: ['How do designers and engineers work together?'] } } }),
  J({ slug: 'm', status: 'applied', needs_you: true, role: 'Graphic Designer, AI projects', short: 'Model Lab', pay: '$30/hr', score: 66, decided_at: iso(240), applied_at: iso(236), followed_up_at: iso(70), waiting_on: 'Create your Model Lab account from their email. It needs a password, so it’s yours.', updates: [{ date: iso(236), text: 'Submitted with resume and portfolio link.' }] }),
  J({ slug: 'f', status: 'approved', role: 'AI Tutor, Design', short: 'Tutor Co', pay: 'Hourly', score: 62, decided_at: iso(3), waiting_on: 'Claude is filling the form.', updates: [{ date: iso(3), text: 'You approved it.' }] }),
  J({ slug: 'e', status: 'interview', role: 'Brand Designer', short: 'Robo Co', pay: '$50K', score: 64, decided_at: iso(320), applied_at: iso(300), confirmed_at: iso(299), followed_up_at: iso(130), responded_at: iso(20), waiting_on: 'Interview Thursday 15:00.', updates: [{ date: iso(20), text: 'Interview invite for Thursday 15:00 CET.' }] }),
  J({ slug: 'b', status: 'applied', role: 'Learning Experience Designer', short: 'Bright Path', pay: 'Asked $75K', score: 76, decided_at: iso(250), applied_at: iso(240), confirmed_at: iso(239), followed_up_at: iso(70), waiting_on: 'Waiting to hear back.', docs: [{ label: 'Resume PDF', path: 'docs/bright-path-resume.pdf' }], updates: [{ date: iso(240), text: 'Submitted. Confirmation email received.' }, { date: iso(70), text: 'Follow-up email sent.' }] }),
  J({ slug: 'g', status: 'applied', role: 'Social Media Designer', short: 'Reef Fund', pay: '$45K', score: 70, decided_at: iso(30), applied_at: iso(26), waiting_on: 'Submitted. Waiting for their confirmation email.' }),
  J({ slug: 'r', status: 'rejected', role: 'Exhibit Designer', short: 'City Museum', pay: '$55K', score: 68, decided_at: iso(500), applied_at: iso(490), responded_at: iso(100) }),
]
const demoProfile = {
  user_id: 'demo', more: 'Also easy-entry online work: tutoring, user testing.',
  info: [['Professional name', 'Graham Ivy'], ['Email', 'graham@example.com'], ['Phone', '+34 600 000 000'], ['Portfolio', 'https://example.com'], ['Languages', 'English (native), Spanish (fluent)'], ['Availability', 'Two weeks after an offer.']],
  picks: { roles: ['Graphic design', 'UX/UI design', 'Brand design', 'Social media'], causes: ['Museums', 'Conservation', 'Education'], where: ['Remote, Spain OK', 'US contract (USD)'], hours: ['Full time', 'Part time'] },
  watchlist: ['Ocean Trust', 'City Museum', 'Open Classroom', 'Reef Fund'], weights: { 'Mission and cause': 30, Pay: 20, 'Spain eligibility': 20, 'Skills match': 15, Level: 15 },
  base_docs: [{ group: 'Resumes', label: 'Design', path: 'docs/base/design-resume.pdf' }, { group: 'Resumes', label: 'UX/UI', path: 'docs/base/ux-ui-resume.pdf' }, { group: 'Portfolio', label: 'Portfolio PDF', path: 'docs/base/Graham-Ivy-Portfolio.pdf' }],
  search: { instagram: ['@remotedesignjobs', '@museumjobs'] },
}

// Drawn stand-in portrait for the profile photo (no real photos in previews)
const demoPhoto = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#D9D3C4"/><circle cx="50" cy="40" r="18" fill="#8C8577"/><path d="M18 100c4-22 18-32 32-32s28 10 32 32z" fill="#8C8577"/></svg>`)

const fixtures = {
  profile: [{ name: 'Sam Rivera', tagline: 'Designer in Barcelona', photo_path: 'demo/photo.svg', events: { cats: ['dance', 'latin', 'design'] } }],
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
    { id: 'e1', title: 'Salsa at Imperial', starts_at: at(1, 21), location: 'Imperial Meeting Point', notes: 'From the brain dump: go with Marc.' },
    { id: 'e2', title: 'Bailaqueer', starts_at: at(3, 22, 30), location: 'Pati Llimona' },
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
  housing_profile: [{ specs: { max_price: 1600, min_beds: 3, balcony: true, exterior: true, lift: false, ac: false, areas: [] } }],
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
        { id: 'f1', source: 'fotocasa', street: 'Carrer de Verdi', area: 'Vila de Gràcia', district: 'Gràcia', price: 1450, beds: 3, size_m2: 84, floor: '3', exterior: true, lift: true, balcony: true, photo: room('#EDE5D8', '#B09673', '#C9DCE6'), url: '#', first_seen: iso(20) },
        { id: 'fb1', source: 'facebook', street: 'Carrer de Blai', area: 'El Poble-sec', district: 'Sants-Montjuïc', price: 1350, beds: 3, size_m2: 80, floor: '2', exterior: true, balcony: true, url: '#', first_seen: iso(30) },
        { id: 'h2', street: 'Calle de Fluvià', area: 'Sant Martí de Provençals', district: 'Sant Martí', price: 1280, beds: 3, size_m2: 82, floor: '4', exterior: true, lift: true, balcony: true, photo: room('#EEE8DC', '#C2AE8E', '#CADFEA'), url: '#', first_seen: iso(52) },
        { id: 'h3', street: 'Calle de Mateu', area: 'Vila de Gràcia', district: 'Gràcia', price: 1690, beds: 3, size_m2: 78, floor: '2', exterior: true, lift: false, balcony: true, photo: room('#F0E6D6', '#A88C66', '#D2E3EC'), url: '#', first_seen: iso(125) },
        { id: 'h4', street: 'Calle d’Alí Bei', area: 'El Fort Pienc', district: 'Eixample', price: 1100, beds: 3, size_m2: 90, floor: '1', exterior: false, lift: true, balcony: true, photo: room('#E6E2DA', '#9F8A6C', '#C5D8E2'), url: '#', first_seen: iso(76) },
        { id: 'h5', street: 'Calle del Marquès de Campo Sagrado', area: 'Sant Antoni', district: 'Eixample', price: 1424, prev_price: 1500, beds: 3, size_m2: 106, floor: '2', exterior: true, lift: true, balcony: true, photo: room('#EFE9DF', '#B49A74', '#CFE0E8'), url: '#', first_seen: iso(100) },
        { id: 'h6', street: 'Calle de Lepant', area: 'La Sagrada Família', district: 'Eixample', price: 1081, beds: 3, size_m2: 77, floor: '7', exterior: true, lift: true, balcony: true, photo: room('#E8E4DA', '#B7A386', '#C8DCE7'), url: '#', first_seen: iso(122) },
        { id: 'h7', street: 'Doctor Letamendi', area: 'L’Antiga Esquerra de l’Eixample', district: 'Eixample', price: 1252, prev_price: 1375, beds: 1, size_m2: 70, floor: 'Mezzanine', exterior: true, balcony: false, url: '#', first_seen: iso(150), gone: true },
      ],
    } },
    { section: 'email', synced_at: iso(0.2), payload: { unread: 3, threads: [
      { id: 't1', from: 'Kym Duea', subject: 'Annual Meeting page has slipped a stitch', snippet: 'I noticed an issue on the Annual Meeting page…', message: 'Also the registration link at the bottom goes nowhere. Thanks for taking a look!\n\nKym', help: { title: 'Fix the page and the link', steps: ['Open the Annual Meeting page in the site editor.', 'Compare it with the screenshot Kym sent and fix the layout.', 'Point the registration link to the event form.', 'Test the link in a private window, then reply to Kym.'], doc: { title: 'Note for the board', body: 'The Annual Meeting page is fixed and the registration link now goes to the event form.' } }, date: iso(1), unread: true, important: true, count: 2, url: '#', replies: [
        { label: 'On it today', body: 'Hi Kym,\n\nThanks for catching this. I’ll fix the page and the registration link today and let you know when it’s live.\n\nGraham' },
        { label: 'This week', body: 'Hi Kym,\n\nThanks for the heads up and the screenshot. I’ll have the page and the link fixed by Friday.\n\nGraham' },
        { label: 'Ask for details', body: 'Hi Kym,\n\nThanks for flagging this. Which browser were you using? I want to make sure I see the same thing before I fix it.\n\nGraham' },
      ] },
      { id: 't2', from: 'idealista', subject: 'New home in your search', snippet: 'Gràcia 1,100 €/month…', date: iso(4), unread: true, important: false, count: 3, url: '#' },
      { id: 't4', from: 'Queles Alivés', subject: 'Re: Piso en Calle dels Boters', subject_en: 'Re: Flat on Carrer dels Boters', lang: 'es', snippet: 'Can you come Thursday at 10 to sign?', message: 'Hola Graham,\n\n¿Puedes venir el jueves a las 10:00 para firmar el contrato? Trae el pasaporte.\n\nQueles', message_en: 'Hi Graham,\n\nCan you come on Thursday at 10:00 to sign the contract? Bring your passport.\n\nQueles', date: iso(3), unread: true, important: true, count: 6, url: '#', replies: [
        { label: 'Sí, el jueves', body: 'Hola Queles,\n\nPerfecto, el jueves a las 10:00 allí estaré con el pasaporte.\n\nGracias,\nGraham', tr: {
          es: 'Hola Queles,\n\nPerfecto, el jueves a las 10:00 allí estaré con el pasaporte.\n\nGracias,\nGraham',
          en: 'Hi Queles,\n\nPerfect, I will be there Thursday at 10:00 with my passport.\n\nThanks,\nGraham',
          ca: 'Hola Queles,\n\nPerfecte, dijous a les 10:00 hi seré amb el passaport.\n\nGràcies,\nGraham',
        } },
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
    } },
    { section: 'events', synced_at: iso(0.3), payload: { events: [
      ...workBlocks,
      { id: 'c1', title: 'Coffee with Emma', start: at(0, 18), end: at(0, 19), location: 'Satan’s Coffee Corner', calendar: 'Friends', url: gcal },
      { id: 'c2', title: 'Nude yoga to wake up', start: at(2, 9, 45), end: at(2, 10, 45), location: 'Prakasa', calendar: 'Graham', url: gcal },
      { id: 'c3', title: 'Dentist', start: at(2, 15, 30), end: at(2, 16), location: 'Clínica Dental Gràcia', calendar: 'Health & Medical', notes: 'Bring the insurance card.', url: gcal },
      { id: 'c4', title: 'Sagrada Família', start: at(6, 17), end: at(6, 18), calendar: 'Graham', url: gcal },
      { id: 'c5', title: 'La Castanyada', start: day(12), all_day: true, calendar: 'Graham', url: gcal },
      { id: 'c6', title: 'Tess’s wedding', start: day(26), all_day: true, location: 'Sitges', calendar: 'Family', url: gcal },
      { id: 'c7', title: 'Bachata class', start: at(1, 19, 30), end: at(1, 21), location: 'Imperial Meeting Point', calendar: 'Dance & Movement', url: gcal },
      { id: 'c8', title: 'Date night', start: at(3, 20), end: at(3, 23), calendar: 'B & G Calendar', url: gcal },
      { id: 'c9', title: 'Therapy', start: at(4, 17), end: at(4, 18), calendar: 'Self-Care & Mental Wellness', url: gcal },
      { id: 'c10', title: 'Contact improv jam', start: at(9, 18), end: at(9, 20), calendar: 'Dance & Movement', url: gcal },
    ], picks_city: 'Barcelona', picks: [
      { id: 'p1', title: 'Queer salsa class and social', cats: ['dance', 'latin'], where: 'Centre Cívic Pati Llimona', price: 'Free · register', url: 'https://example.com', note: 'Workshop, then a social. Everyone rotates lead and follow.', slots: [{ start: at(5, 11), end: at(5, 12, 30) }] },
      { id: 'p2', title: 'Founders run club', cats: ['founders', 'move', 'net'], where: 'Barceloneta', price: null, url: 'https://example.com', note: 'Easy-pace run, then coffee.', weekly: 'Saturdays', slots: [{ start: at(5, 9, 20), end: at(5, 11) }] },
      { id: 'p3', title: 'Friends of Figma meetup', cats: ['design', 'net'], where: 'MediaTIC, Poblenou', price: 'Free · limited spots', url: 'https://example.com', note: 'Design talk, then networking.', slots: [{ start: at(8, 18, 30), end: at(8, 20) }] },
      { id: 'p4', title: 'Disco night', cats: ['club'], where: 'Sala Apolo', price: '€15', url: 'https://example.com', note: 'Pop room and house room.', slots: [{ start: at(5, 23, 55), end: at(6, 5) }] },
      { id: 'p5', title: 'Food market weekend', cats: ['food'], where: 'Glòries', price: 'Free', url: 'https://example.com', note: 'Stalls and chef demos.', slots: [{ start: day(12), end: day(14), all_day: true }] },
      { id: 'p6', title: 'Queer comedy open mic', cats: ['culture'], where: 'Comedy Clubhouse', price: 'Free', url: 'https://example.com', note: null, slots: [{ start: at(15, 21), end: at(15, 22, 45) }] },
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
      subscriptions: [{ name: 'Claude', amount: 100 }, { name: 'YouTube Premium', amount: 29.19 }, { name: 'Apple', amount: 21.98 }, { name: 'Google One', amount: 19.99 }, { name: 'Gym app', amount: 12 }],
    } },
  ],
  jobs: demoJobs,
  job_profile: [demoProfile],
  subscription_overrides: [{ name: 'Gym app', hidden: true }, { name: 'Google One', amount: 9.99 }],
}

function builder(table) {
  let rows = [...(fixtures[table] || [])]
  const q = {
    select: () => q, order: () => q, limit: () => q, not: () => q, is: () => q, like: () => q,
    gte: () => q, lt: () => q, lte: () => q, neq: () => q,
    eq: (k, v) => { rows = rows.filter((r) => r[k] === undefined || r[k] === v); return q },
    in: (k, vs) => { rows = rows.filter((r) => r[k] === undefined || vs.includes(r[k])); return q },
    insert: () => q, upsert: () => q, update: () => q, upsert: () => q, delete: () => q,
    then: (res) => res({ data: rows, count: rows.length, error: null }),
  }
  return q
}

const demoChannel = { on: () => demoChannel, subscribe: () => demoChannel }

export const demoClient = {
  from: builder,
  functions: { invoke: async () => ({ data: { row: null }, error: null }) },
  channel: () => demoChannel,
  storage: { from: () => ({
    createSignedUrls: async (ps) => ({ data: ps.map((p) => ({ path: p, signedUrl: '#', error: null })) }),
    createSignedUrl: async (p) => ({ data: { signedUrl: p.includes('photo') ? demoPhoto : '#' } }),
    upload: async () => ({ error: null }),
    remove: async () => ({ error: null }),
    list: async (dir) => ({ data: dir.endsWith('/docs') ? [
      { name: 'Passport.pdf', metadata: { size: 1240000 } },
      { name: 'Digital Nomad Visa application.pdf', metadata: { size: 860000 } },
      { name: 'TEFL certificate.pdf', metadata: { size: 241000 } },
    ] : [] }),
  }) },
  removeChannel: () => {},
  auth: {
    // #/?login=1 shows the sign-in screen
    getSession: async () => ({ data: { session: location.hash.includes('login=1') ? null : { user: { id: 'demo', email: 'demo@example.com' } } } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signOut: async () => {}, signInWithOtp: async () => ({}), verifyOtp: async () => ({}),
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

