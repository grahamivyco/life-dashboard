// The money app's reports and edits (mac/money: rules.py, reports.py, server.py), ported to run
// on the server. Works on one in-memory store:
//   { owners, items, accounts, transactions, holdings, balances, budgets, settings,
//     recurring_ignored, recurring_manual, amazon_orders, payment_plans, next_id }
// Rows look like the Mac app's SQLite rows. Dates are 'YYYY-MM-DD' strings.
// Keep it in step with the Python: mac/tests has the cases, scripts/money-parity.mjs compares.

// ---------- dates ----------
const DAY = 86400000
const parse = (s) => new Date(s + 'T00:00:00Z')
const iso = (d) => d.toISOString().slice(0, 10)
export const addDays = (s, n) => iso(new Date(parse(s).getTime() + n * DAY))
const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / DAY) // b - a
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const mon = (s) => MONTHS[+s.slice(5, 7) - 1].slice(0, 3)

export function addMonths(s, months) {
  const y0 = +s.slice(0, 4), m0 = +s.slice(5, 7) - 1, d0 = +s.slice(8, 10)
  const total = m0 + months
  const year = y0 + Math.floor(total / 12), month = ((total % 12) + 12) % 12
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return iso(new Date(Date.UTC(year, month, Math.min(d0, last))))
}
const firstOfMonth = (s) => s.slice(0, 8) + '01'

// Python's round(): halves go to the even neighbour
function pyRound(x, nd = 0) {
  const f = 10 ** nd, v = x * f, r = Math.round(v)
  const out = Math.abs(v % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r
  return out / f
}
const r2 = (x) => Math.round(x * 100) / 100
const sum = (xs) => xs.reduce((a, b) => a + b, 0)
function median(xs) {
  const s = [...xs].sort((a, b) => a - b), n = s.length
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2
}
const byKeyDesc = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]) // stable, like sorted()

// ---------- rules (rules.py) ----------
const RULE_PATTERN = /^(.+?)\s*(?:([<>])\s*\$?(\d+(?:\.\d+)?))?\s*->\s*(.+?)\s*$/
export const CARD_PAYMENT = 'Credit Card Payment'
export const INVESTING = 'Investing'
export const UNSEEN_CARD_SPENDING = 'Card purchases (no detail)'
export const MOVE_CATEGORIES = new Set(['Transfer', CARD_PAYMENT, INVESTING])
export const NOT_SPENDING = new Set([...MOVE_CATEGORIES, 'Income', 'Ignored'])

export function cleanCategory(name) {
  name = name.trim()
  for (const special of NOT_SPENDING) if (name.toLowerCase() === special.toLowerCase()) return special
  return name
}

export const PLAID_PRIMARY_NAMES = {
  INCOME: 'Income', TRANSFER_IN: 'Transfer', TRANSFER_OUT: 'Transfer', LOAN_PAYMENTS: 'Loan Payments',
  BANK_FEES: 'Fees', ENTERTAINMENT: 'Entertainment & Rec.', FOOD_AND_DRINK: 'Dining & Drinks',
  GENERAL_MERCHANDISE: 'Shopping', HOME_IMPROVEMENT: 'Home & Garden', MEDICAL: 'Health & Wellness',
  PERSONAL_CARE: 'Personal Care', GENERAL_SERVICES: 'Services', GOVERNMENT_AND_NON_PROFIT: 'Taxes & Giving',
  TRANSPORTATION: 'Auto & Transport', TRAVEL: 'Travel & Vacation', RENT_AND_UTILITIES: 'Bills & Utilities',
}
export const PLAID_DETAILED_NAMES = {
  LOAN_PAYMENTS_CREDIT_CARD_PAYMENT: CARD_PAYMENT,
  TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS: INVESTING,
  TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS: INVESTING,
  TRANSFER_IN_DEPOSIT: 'Income',
  FOOD_AND_DRINK_GROCERIES: 'Groceries',
  PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS: 'Health & Wellness',
}
const DEPOSIT = /\b(check|cheque|mobile|atm|cash|branch) deposit/
export const BILL_CATEGORIES = new Set(['Rent', 'Bills & Utilities', 'Loan Payments'])

export function parseRules(source) {
  const rules = [], errors = []
  ;(source || '').split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim()
    if (!line || line.startsWith('#')) return
    const m = RULE_PATTERN.exec(line)
    if (!m) { errors.push(`Line ${i + 1}: needs the form 'store name -> Category'`); return }
    rules.push({ line: i + 1, text: m[1], op: m[2] || null, amount: m[3] ? Number(m[3]) : null, category: cleanCategory(m[4]) })
  })
  return [rules, errors]
}

function ruleMatches(rule, haystack, amount) {
  if (!haystack.includes(rule.text.toLowerCase())) return false
  if (rule.op === '>') return Math.abs(amount) > rule.amount
  if (rule.op === '<') return Math.abs(amount) < rule.amount
  return true
}

function plaidCategoryName(pc) {
  if (!pc) return 'Uncategorized'
  const i = pc.indexOf('/')
  const primary = i < 0 ? pc : pc.slice(0, i), detailed = i < 0 ? '' : pc.slice(i + 1)
  if (PLAID_DETAILED_NAMES[detailed]) return PLAID_DETAILED_NAMES[detailed]
  return PLAID_PRIMARY_NAMES[primary] || 'Uncategorized'
}

export function categorize(txn, rules) {
  if (txn.category_override) return [txn.category_override, 'you']
  const haystack = `${txn.merchant || ''} ${txn.description}`.toLowerCase()
  for (const rule of rules) if (ruleMatches(rule, haystack, txn.amount)) return [rule.category, `rule on line ${rule.line}`]
  if (txn.amount < 0 && DEPOSIT.test(haystack)) return ['Income', 'check or cash deposit']
  return [plaidCategoryName(txn.plaid_category), 'Plaid']
}

export function addRule(store, text, category) {
  text = text.replace(/[<>\r\n]|->/g, ' ').trim().replace(/^#+/, '').trim()
  category = cleanCategory(category.replace(/->/g, ' '))
  if (!text || !category) throw new Error('A rule needs both a store name and a category')
  const lines = (store.settings.rules || '').split('\n')
  if (lines.at(-1) === '') lines.pop()
  let at = 0
  while (at < lines.length && (!lines[at].trim() || lines[at].trimStart().startsWith('#'))) at++
  lines.splice(at, 0, `${text} -> ${category}`)
  store.settings.rules = lines.join('\n') + '\n'
}

// ---------- reports (reports.py) ----------
const ONE_OFF_TAG = 'one-off'
const OWED_TYPES = new Set(['credit', 'loan'])
const SAVINGS_SUBTYPES = new Set(['savings', 'money market', 'cd', 'hsa'])

export function accountGroup(a) {
  if (OWED_TYPES.has(a.type)) return a.type === 'credit' ? 'card' : 'loan'
  if (a.type === 'investment') return 'investments'
  return SAVINGS_SUBTYPES.has(a.subtype) ? 'savings' : 'checking'
}

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
const visibleAccounts = (s) => s.accounts.filter((a) => !a.hidden)
const company = (institution) => institution.split(' - ')[0].toLowerCase()
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const like = (v, pre = '', post = '') => (v || '').toUpperCase().startsWith(pre) && (v || '').toUpperCase().endsWith(post)

function cardPaymentWithdrawals(s) {
  const acc = Object.fromEntries(s.accounts.map((a) => [a.account_id, a]))
  const inst = Object.fromEntries(s.items.map((i) => [i.item_id, i.institution]))
  const byDate = (a, b) => cmp(a.date, b.date) || cmp(a.transaction_id, b.transaction_id)
  const unpaired = {}
  for (const t of [...s.transactions].sort(byDate)) {
    const a = acc[t.account_id]
    if (!a || a.type !== 'credit' || !(t.amount < 0) || !like(t.plaid_category, '', 'CREDIT_CARD_PAYMENT')) continue
    const key = company(inst[a.item_id]) + '|' + r2(-t.amount)
    ;(unpaired[key] ||= []).push(t.date)
  }
  const historyStarts = {}
  for (const t of s.transactions) {
    const a = acc[t.account_id]
    if (!a || a.type !== 'credit' || inst[a.item_id] == null) continue
    const name = company(inst[a.item_id])
    if (!(name in historyStarts) || t.date < historyStarts[name]) historyStarts[name] = t.date
  }
  const names = Object.keys(historyStarts)
  const matched = {}
  for (const t of [...s.transactions].sort(byDate)) {
    const a = acc[t.account_id]
    if (!a || !['depository', 'investment'].includes(a.type) || !(t.amount > 0)) continue
    if (!like(t.plaid_category, 'TRANSFER_OUT') && !like(t.plaid_category, 'LOAN_PAYMENTS')) continue
    const text = `${t.merchant || ''} ${t.description}`.toLowerCase()
    for (const name of names) {
      if (!new RegExp(`\\b${escapeRe(name)}\\b`).test(text)) continue
      const payments = unpaired[name + '|' + r2(t.amount)] || []
      const i = payments.findIndex((day) => Math.abs(daysBetween(day, t.date)) <= 5)
      if (i >= 0) { payments.splice(i, 1); matched[t.transaction_id] = 'matched'; break }
      if (t.date < historyStarts[name] && !Number.isInteger(t.amount)) { matched[t.transaction_id] = 'before history'; break }
    }
  }
  return matched
}

function amazonPurchases(s) {
  const byTotal = {}
  for (const o of [...s.amazon_orders].filter((o) => o.total > 0).sort((a, b) => cmp(a.date, b.date))) {
    ;(byTotal[r2(o.total)] ||= []).push([o.date, o.items])
  }
  if (!Object.keys(byTotal).length) return {}
  const unpaid = Object.fromEntries(Object.entries(byTotal).map(([k, v]) => [k, [...v]]))
  const acc = Object.fromEntries(s.accounts.map((a) => [a.account_id, a]))
  const bought = {}
  const charges = s.transactions.filter((t) => acc[t.account_id]?.type === 'credit' && /^(amazon|amzn)/i.test(t.description))
    .sort((a, b) => cmp(a.date, b.date) || cmp(a.transaction_id, b.transaction_id))
  for (const t of charges) {
    const total = r2(Math.abs(t.amount))
    const fits = t.amount > 0
      ? (unpaid[total] || []).filter((o) => { const d = daysBetween(o[0], t.date); return d >= -3 && d <= 30 })
      : (byTotal[total] || []).filter((o) => { const d = daysBetween(o[0], t.date); return d >= 0 && d <= 120 })
    if (!fits.length) continue
    const order = fits.reduce((best, o) => (Math.abs(daysBetween(o[0], t.date)) < Math.abs(daysBetween(best[0], t.date)) ? o : best))
    bought[t.transaction_id] = order[1] || 'Amazon order'
    if (t.amount > 0) unpaid[total].splice(unpaid[total].indexOf(order), 1)
  }
  return bought
}

function paymentReceived(t, source) {
  return source === 'Plaid' && t.account_type === 'credit' && t.amount < 0
    && /\bpayment\b/i.test(t.description) && ['Income', 'Transfer', 'Uncategorized'].includes(t.category)
}

const TXN_FIELDS = ['transaction_id', 'account_id', 'date', 'description', 'merchant', 'amount', 'plaid_category',
  'pending', 'category_override', 'name_override', 'note', 'hidden', 'tags']

// Every visible transaction, worked out once per request, newest first (transactions() with no filter).
function enrich(s, rules) {
  const acc = Object.fromEntries(visibleAccounts(s).map((a) => [a.account_id, a]))
  const bought = amazonPurchases(s)
  const paid = cardPaymentWithdrawals(s)
  const out = []
  for (const row of s.transactions) {
    const a = acc[row.account_id]
    if (!a) continue
    const t = {}
    for (const f of TXN_FIELDS) t[f] = row[f] ?? null
    t.pending = t.pending ? 1 : 0
    t.hidden = t.hidden ? 1 : 0
    t.account_name = a.name; t.account_mask = a.mask ?? null; t.account_type = a.type
    t.name = t.name_override || t.merchant || t.description
    ;[t.category, t.category_source] = categorize(t, rules)
    const paidCard = MOVE_CATEGORIES.has(t.category) && t.category_source !== 'you'
    const how = paidCard ? paid[t.transaction_id] : undefined
    if (how === 'before history') [t.category, t.category_source] = [UNSEEN_CARD_SPENDING, "a card bill from before the card's history"]
    else if (how || paymentReceived(t, t.category_source)) [t.category, t.category_source] = [CARD_PAYMENT, 'matches a payment on your card']
    t.bought = bought[t.transaction_id] ?? null
    t.tags = (t.tags || '').split(',').filter(Boolean)
    t.spending = !t.hidden && !NOT_SPENDING.has(t.category)
    out.push(t)
  }
  return out.sort((a, b) => cmp(b.date, a.date) || cmp(a.transaction_id, b.transaction_id))
}

const between = (txns, since, until) => txns.filter((t) => (!since || t.date >= since) && (!until || t.date < until))

function statementClosings(after, until, closeDay) {
  const out = []
  let month = firstOfMonth(after)
  while (month <= until) {
    const last = +addDays(addMonths(month, 1), -1).slice(8, 10)
    const closing = month.slice(0, 8) + String(Math.min(closeDay, last)).padStart(2, '0')
    if (after < closing && closing <= until) out.push(closing)
    month = addMonths(month, 1)
  }
  return out
}

function paymentPlans(s, today) {
  const vis = new Set(visibleAccounts(s).map((a) => a.account_id))
  return s.payment_plans.filter((p) => vis.has(p.account_id)).map((p) => {
    const billed = statementClosings(p.as_of, today, p.close_day).length
    return { ...p, unbilled: r2(Math.max(p.remaining - billed * p.monthly, 0)) }
  })
}

function balances(s, today) {
  const g = { checking: 0, card: 0, savings: 0, investments: 0, loan: 0 }
  for (const a of visibleAccounts(s)) g[accountGroup(a)] += a.current_balance || 0
  const onPlans = sum(paymentPlans(s, today).map((p) => p.unbilled))
  return {
    ...g,
    cash: g.checking + g.savings,
    owed: g.card + g.loan,
    on_plans: onPlans,
    net_cash: g.checking - g.card + onPlans,
    net_worth: g.checking + g.savings + g.investments - g.card - g.loan,
  }
}

export function merchantKey(t) {
  return (t.merchant || t.description).toLowerCase().replace(/[^a-z ]/g, '').trim()
}

const FREQUENCIES = [
  ['weekly', 6, 8, 52 / 12],
  ['every 2 weeks', 13, 16, 26 / 12],
  ['monthly', 26, 35, 1.0],
  ['yearly', 350, 380, 1 / 12],
]
export const FREQUENCY_DAYS = { weekly: 7, 'every 2 weeks': 14, monthly: 30, yearly: 365 }

function recurring(s, all, today, includeIgnored = false) {
  const cutoff = addDays(today, -400)
  const checking = new Set(s.accounts.filter((a) => accountGroup(a) === 'checking').map((a) => a.account_id))
  const groups = {}
  for (const t of all) {
    const isBill = t.amount > 0 && t.spending && t.category !== UNSEEN_CARD_SPENDING
    const isPay = t.amount < 0 && t.category === 'Income'
    const intoSavings = t.category === 'Transfer' && (t.plaid_category || '').endsWith('TRANSFER_OUT_SAVINGS')
    const isMove = t.amount > 0 && checking.has(t.account_id) && (t.category === INVESTING || intoSavings)
    if (t.date < cutoff || !(isBill || isPay || isMove)) continue
    const suffix = isPay ? ' pay' : isMove ? ' transfer' : ''
    ;(groups[merchantKey(t) + suffix] ||= []).push(t)
  }
  const ignored = new Set(s.recurring_ignored)
  const found = []
  for (const [key, list] of Object.entries(groups)) {
    if (ignored.has(key) && !includeIgnored) continue
    const charges = [...list].sort((a, b) => cmp(a.date, b.date))
    const dates = charges.map((t) => t.date)
    const gaps = dates.slice(1).map((d, i) => daysBetween(dates[i], d))
    if (!gaps.length) continue
    const gap = median(gaps)
    const amounts = charges.map((t) => Math.abs(t.amount))
    const typical = median(amounts)
    const last = charges.at(-1)
    const varies = amounts.slice(-3).some((a) => Math.abs(a - typical) > typical * 0.25)
    if (varies && !BILL_CATEGORIES.has(last.category)) continue
    const kind = last.amount < 0 ? 'income' : key.endsWith(' transfer') ? 'transfer' : 'bill'
    for (const [name, low, high, perMonth] of FREQUENCIES) {
      const enough = name === 'yearly' ? 2 : 3
      const steady = gaps.filter((g) => low <= g && g <= high).length >= 0.7 * gaps.length
      if (low <= gap && gap <= high && steady && charges.length >= enough) {
        if (daysBetween(dates.at(-1), today) > high + 10) break
        const amount = varies ? median(amounts.slice(-3)) : amounts.at(-1)
        const next = addDays(dates.at(-1), pyRound(gap))
        found.push({
          key, name: last.name, category: last.category, kind, frequency: name, gap_days: pyRound(gap),
          amount, varies, per_month: amount * perMonth, last_date: dates.at(-1),
          next_date: next > today ? next : today, manual: false, ignored: ignored.has(key),
        })
        break
      }
    }
  }
  found.push(...manualRecurring(s, today))
  return found.sort((a, b) => b.per_month - a.per_month)
}

function manualRecurring(s, today) {
  return s.recurring_manual.map((r) => {
    const perMonth = FREQUENCIES.find((f) => f[0] === r.frequency)[3]
    let due = r.next_date
    while (due < today) due = r.frequency === 'monthly' ? addMonths(due, 1) : addDays(due, FREQUENCY_DAYS[r.frequency])
    return {
      key: `manual-${r.id}`, id: r.id, name: r.name,
      category: r.category || (r.kind === 'income' ? 'Income' : 'Bills & Utilities'),
      kind: r.kind, frequency: r.frequency, gap_days: FREQUENCY_DAYS[r.frequency], amount: r.amount, varies: false,
      per_month: r.amount * perMonth, last_date: null, next_date: due, manual: true, ignored: false,
    }
  })
}

function holdings(s) {
  const acc = Object.fromEntries(visibleAccounts(s).map((a) => [a.account_id, a]))
  return s.holdings.filter((h) => acc[h.account_id]).map((h) => ({ ...h, account_name: acc[h.account_id].name }))
    .sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity))
}

function accounts(s, includeHidden = false) {
  const items = Object.fromEntries(s.items.map((i) => [i.item_id, i]))
  const owners = Object.fromEntries(s.owners.map((o) => [o.id, o.name]))
  return s.accounts.filter((a) => includeHidden || !a.hidden).filter((a) => items[a.item_id] && owners[a.owner_id] != null)
    .map((a) => {
      const i = items[a.item_id]
      return { ...a, hidden: a.hidden ? 1 : 0, institution: i.institution, last_synced: i.last_synced ?? null, last_error: i.last_error ?? null,
        owner_name: owners[a.owner_id], group: accountGroup(a) }
    })
    .sort((a, b) => cmp(a.institution, b.institution) || cmp(a.name, b.name))
}

// ---------- spending tab ----------
function periodStart(period, day) {
  if (period === 'week') return addDays(day, -parse(day).getUTCDay()) // weeks start on Sunday
  if (period === 'month') return firstOfMonth(day)
  if (period === 'quarter') return `${day.slice(0, 4)}-${String(3 * Math.floor((+day.slice(5, 7) - 1) / 3) + 1).padStart(2, '0')}-01`
  return day.slice(0, 4) + '-01-01'
}
function shiftPeriod(period, start, count) {
  if (period === 'week') return addDays(start, 7 * count)
  return addMonths(start, count * { month: 1, quarter: 3, year: 12 }[period])
}
const quarter = (s) => Math.floor((+s.slice(5, 7) - 1) / 3) + 1
function periodLabel(period, start) {
  if (period === 'week') return `${mon(start)} ${+start.slice(8, 10)}`
  if (period === 'month') return mon(start)
  if (period === 'quarter') return `Q${quarter(start)} ${start.slice(2, 4)}`
  return start.slice(0, 4)
}
function periodTitle(period, start, end) {
  if (period === 'week') { const e = addDays(end, -1); return `${mon(start)} ${+start.slice(8, 10)} to ${mon(e)} ${+e.slice(8, 10)}` }
  if (period === 'month') return `${MONTHS[+start.slice(5, 7) - 1]} ${start.slice(0, 4)}`
  if (period === 'quarter') return `Q${quarter(start)} ${start.slice(0, 4)}`
  return start.slice(0, 4)
}

function moneyInOut(txns) {
  const income = -sum(txns.filter((t) => t.category === 'Income' && !t.hidden).map((t) => t.amount))
  const spent = sum(txns.filter((t) => t.spending).map((t) => t.amount))
  return [income, spent]
}

function spending(all, period, offset, today, includeBills = true) {
  const start = shiftPeriod(period, periodStart(period, today), offset)
  const end = shiftPeriod(period, start, 1)
  const history = []
  for (let back = 5; back >= 0; back--) {
    const barStart = shiftPeriod(period, start, -back)
    const [income, spent] = moneyInOut(between(all, barStart, shiftPeriod(period, barStart, 1)))
    history.push({ label: periodLabel(period, barStart), offset: offset - back, income, spent })
  }
  const txns = between(all, start, end)
  const [income, spent] = moneyInOut(txns)
  const ring = txns.filter((t) => t.spending && (includeBills || !BILL_CATEGORIES.has(t.category)))
  const byCategory = {}, byMerchant = {}
  for (const t of ring) byCategory[t.category] = (byCategory[t.category] || 0) + t.amount
  const ringTotal = sum(Object.values(byCategory))
  for (const t of ring) byMerchant[t.name] = (byMerchant[t.name] || 0) + t.amount
  const refunds = ring.filter((t) => t.amount < 0 && t.account_type === 'credit')
  const share = (amount) => (ringTotal > 0 ? amount / ringTotal : 0)
  return {
    period, offset, start, end, title: periodTitle(period, start, end), history, income, spent, net: income - spent,
    ring_total: ringTotal,
    categories: byKeyDesc(byCategory).filter(([, v]) => v > 0).map(([name, v]) => ({ name, spent: v, share: share(v) })),
    merchants: byKeyDesc(byMerchant).slice(0, 15).filter(([, v]) => v > 0).map(([name, v]) => ({ name, spent: v, share: share(v) })),
    refunds: { count: refunds.length, total: -sum(refunds.map((t) => t.amount)) },
    needs_sorting: txns.filter((t) => t.category === 'Uncategorized'),
    tags: tagTotals(txns),
    tax_deductible: sum(txns.filter((t) => t.tags.includes('tax-deductible')).map((t) => t.amount)),
    reimbursable: sum(txns.filter((t) => t.tags.includes('reimbursable')).map((t) => t.amount)),
    ignored: sum(txns.filter((t) => t.category === 'Ignored' || t.hidden).map((t) => t.amount)),
    moves: Object.fromEntries([CARD_PAYMENT, INVESTING, 'Transfer'].map((name) =>
      [name, sum(txns.filter((t) => t.category === name && t.amount > 0 && !t.hidden).map((t) => t.amount))])),
  }
}

function tagTotals(txns) {
  const totals = {}
  for (const t of txns) {
    if (!t.spending) continue
    for (const tag of t.tags) totals[tag] = (totals[tag] || 0) + t.amount
  }
  return byKeyDesc(totals).map(([name, spent]) => ({ name, spent }))
}

function budgetStatus(s, all, today) {
  const budget = s.settings.monthly_budget != null ? Number(s.settings.monthly_budget) : null
  const start = firstOfMonth(today)
  const next = addMonths(start, 1)
  const txns = between(all, start, next)
  const [, spent] = moneyInOut(txns)
  const byCategory = {}
  for (const t of txns) if (t.spending) byCategory[t.category] = (byCategory[t.category] || 0) + t.amount
  return {
    month: MONTHS[+start.slice(5, 7) - 1],
    budget, spent, left: budget == null ? null : budget - spent,
    month_progress: +today.slice(8, 10) / daysBetween(start, next),
    categories: [...s.budgets].sort((a, b) => b.amount - a.amount).map((r) => ({
      name: r.category, budget: r.amount, spent: byCategory[r.category] || 0, left: r.amount - (byCategory[r.category] || 0),
    })),
  }
}

function netWorthHistory(s, today, days = 180) {
  const vis = visibleAccounts(s)
  const acc = Object.fromEntries(vis.map((a) => [a.account_id, a]))
  const firstDay = addDays(today, -days)
  const daily = {}
  for (const t of s.transactions) {
    const a = acc[t.account_id]
    if (!a || a.type === 'investment' || a.current_balance == null || !(t.date > firstDay)) continue
    if ((t.plaid_category || '').toUpperCase().endsWith('INVESTMENT_AND_RETIREMENT_FUNDS')) continue
    daily[t.date] = (daily[t.date] || 0) + t.amount
  }
  const accountCount = vis.filter((a) => a.current_balance != null).length
  const snaps = {}
  for (const b of s.balances) {
    const a = acc[b.account_id]
    if (!a || b.date < firstDay) continue
    const x = (snaps[b.date] ||= { n: 0, total: 0 })
    x.n++; x.total += OWED_TYPES.has(a.type) ? -b.balance : b.balance
  }
  let value = balances(s, today).net_worth
  const points = []
  for (let back = 0; back <= days; back++) {
    const day = addDays(today, -back)
    if (back && snaps[day]?.n === accountCount) value = snaps[day].total
    points.push({ date: day, value: r2(value) })
    value += daily[day] || 0
  }
  return points.reverse()
}

function cumulative(txns, start, days) {
  const byDay = new Array(days).fill(0)
  for (const t of txns) {
    if (!t.spending) continue
    const i = daysBetween(start, t.date)
    if (i >= 0 && i < days) byDay[i] += t.amount
  }
  let running = 0
  return byDay.map((x) => r2((running += x)))
}

function monthPace(all, today) {
  const start = firstOfMonth(today), lastStart = addMonths(start, -1)
  const thisMonth = cumulative(between(all, start, addDays(today, 1)), start, +today.slice(8, 10))
  const lastMonth = cumulative(between(all, lastStart, start), lastStart, daysBetween(lastStart, start))
  return {
    this_month: thisMonth, last_month: lastMonth,
    spent: thisMonth.length ? thisMonth.at(-1) : 0,
    last_month_same_day: lastMonth.length ? lastMonth[Math.min(+today.slice(8, 10), lastMonth.length) - 1] : 0,
    days_in_month: daysBetween(start, addMonths(start, 1)),
  }
}

function forecast(s, all, today, days = 30) {
  const found = recurring(s, all, today)
  const repeating = new Set(found.map((r) => (r.manual ? merchantKey({ merchant: r.name }) : r.key)))
  const picked = new Set(s.recurring_manual.map((r) => r.category).filter((c) => c != null))
  const covered = new Set([...picked].filter((c) => BILL_CATEGORIES.has(c)))
  const recent = between(all, addDays(today, -90), addDays(today, 1))
  const everyday = sum(recent.filter((t) => t.spending && !repeating.has(merchantKey(t)) && !covered.has(t.category)
    && !t.tags.includes(ONE_OFF_TAG)).map((t) => t.amount))
  const dailySpend = Math.max(everyday, 0) / 90

  const events = []
  const horizon = addDays(today, days)
  for (const item of found) {
    const tomorrow = addDays(today, 1)
    let due = item.next_date > tomorrow ? item.next_date : tomorrow
    const change = item.kind === 'income' ? item.amount : -item.amount
    while (due <= horizon) {
      events.push({ date: due, name: item.name, change, kind: item.kind })
      due = item.frequency === 'monthly' ? addMonths(due, 1) : addDays(due, item.gap_days)
    }
  }
  for (const plan of paymentPlans(s, today)) {
    let left = plan.unbilled
    for (const closing of statementClosings(today, horizon, plan.close_day)) {
      if (left <= 0) break
      const slice = Math.min(plan.monthly, left)
      events.push({ date: closing, name: plan.name, change: -slice, kind: 'bill' })
      left -= slice
    }
  }
  events.sort((a, b) => cmp(a.date, b.date))

  let balance = balances(s, today).net_cash
  const points = [{ date: today, value: r2(balance) }]
  for (let step = 1; step <= days; step++) {
    const day = addDays(today, step)
    balance += sum(events.filter((e) => e.date === day).map((e) => e.change)) - dailySpend
    points.push({ date: day, value: r2(balance) })
  }
  const paydays = events.filter((e) => e.kind === 'income').map((e) => e.date)
  const nextPayday = paydays[0] ?? null
  const billsBefore = sum(events.filter((e) => e.kind !== 'income' && (nextPayday == null || e.date < nextPayday)).map((e) => -e.change))
  const lowest = points.reduce((lo, p) => (p.value < lo.value ? p : lo))
  return {
    points, events, daily_spend: dailySpend, start: points[0].value, end: points.at(-1).value, lowest,
    next_payday: nextPayday, safe_to_spend: points[0].value - billsBefore,
  }
}

// ---------- the payload the Finances page reads (bridge.build_payload) ----------
const SPENDING_PAGES = { week: 8, month: 13, quarter: 5, year: 3 }
const TRANSACTION_LIMIT = 6000
const DROP = new Set(['account_name', 'account_mask', 'account_type', 'plaid_category'])

function compact(t) {
  const out = {}
  for (const [k, v] of Object.entries(t)) {
    if (k === 'amount') { out[k] = v; continue }
    if (DROP.has(k) || v == null || v === '' || v === 0 || v === false || (Array.isArray(v) && !v.length)) continue
    out[k] = v
  }
  return out
}

function rulesView(s) {
  const text = s.settings.rules || ''
  const [parsed, errors] = parseRules(text)
  const lines = text.split(/\r?\n/)
  return { text, errors, rules: parsed.map((r) => ({ line: r.line, raw: lines[r.line - 1], text: r.text, op: r.op, amount: r.amount, category: r.category })) }
}

function categories(s, rules) {
  const names = new Set([...Object.values(PLAID_PRIMARY_NAMES), ...Object.values(PLAID_DETAILED_NAMES), ...NOT_SPENDING])
  for (const r of rules) names.add(r.category)
  for (const t of s.transactions) if (t.category_override) names.add(t.category_override)
  return [...names].sort()
}

const NEEDS_PERMISSION = ['ADDITIONAL_CONSENT_REQUIRED', 'INVALID_PRODUCT']

export function buildPayload(s, today) {
  const [rules] = parseRules(s.settings.rules)
  const all = enrich(s, rules)
  const spend = {}
  for (const [period, pages] of Object.entries(SPENDING_PAGES)) {
    for (let offset = 0; offset < pages; offset++) {
      const page = spending(all, period, -offset, today)
      if (offset) delete page.needs_sorting
      spend[`${period}:${offset}`] = page
    }
  }
  const since = `${+today.slice(0, 4) - 2}${today.slice(4, 8)}01`
  const visible = accounts(s)
  const lastSynced = s.items.map((i) => i.last_synced).filter(Boolean).sort().at(-1) ?? null
  return {
    version: 1,
    demo: false,
    dashboard: {
      balances: balances(s, today),
      net_worth_history: netWorthHistory(s, today),
      pace: monthPace(all, today),
      forecast: forecast(s, all, today),
      recurring: recurring(s, all, today),
      budget: budgetStatus(s, all, today),
      recent: all.slice(0, 6),
      accounts: visible,
      needs_attention: visible.filter((a) => a.last_error).map((a) => a.institution),
    },
    net_worth: { history: netWorthHistory(s, today, 365), balances: balances(s, today) },
    spending: spend,
    budget: budgetStatus(s, all, today),
    recurring: recurring(s, all, today, true),
    transactions: between(all, since).slice(0, TRANSACTION_LIMIT).map(compact),
    categories: categories(s, rules),
    rules: rulesView(s),
    holdings: holdings(s),
    accounts: {
      accounts: accounts(s, true), owners: s.owners, demo: false, last_synced: lastSynced,
      needs_holdings: s.items.filter((i) => NEEDS_PERMISSION.includes(i.holdings_error))
        .map((i) => ({ item_id: i.item_id, institution: i.institution })).sort((a, b) => cmp(a.institution, b.institution)),
    },
    payment_plans: paymentPlans(s, today),
  }
}

// ---------- edits from the page (server.py routes) ----------
const EDITABLE = new Set(['name_override', 'note', 'hidden', 'tags'])

function cleanEdit(patch) {
  const edit = {}
  for (const [field, value] of Object.entries(patch || {})) {
    if (!EDITABLE.has(field)) throw new Error(`Can't change ${field}`)
    if (field === 'hidden') edit.hidden = value ? 1 : 0
    else if (field === 'tags') {
      const tags = (value || []).map((t) => String(t).toLowerCase().replace(/[^a-z0-9 -]/g, '').trim().slice(0, 30))
      edit.tags = [...new Set(tags.filter(Boolean))].sort().join(',') || null
    } else edit[field] = value != null ? String(value).trim().slice(0, 200) || null : null
  }
  return edit
}

const positive = (amount, what = 'Budget') => {
  const n = Number(amount)
  if (!(n > 0 && n < 1e7)) throw new Error(`${what} must be a positive number`)
  return n
}
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v)) && !Number.isNaN(parse(String(v)).getTime())

// Runs one edit on the store. Returns { ok, ... } and throws Error for a bad request.
// '/api/sync' is handled by the caller (it needs the network).
export function runAction(s, method, path, body = {}, today) {
  const txn = (id) => {
    const t = s.transactions.find((x) => x.transaction_id === id)
    if (!t) throw new Error('No such transaction')
    return t
  }
  let m
  if (method === 'PATCH' && (m = path.match(/^\/api\/transactions\/([\w-]+)$/))) {
    Object.assign(txn(m[1]), cleanEdit(body))
    return { ok: true }
  }
  if (method === 'POST' && path === '/api/transactions/bulk') {
    if (!Array.isArray(body.ids)) throw new Error('ids must be a list')
    const ids = new Set(body.ids.slice(0, 1000).map(String))
    const edit = cleanEdit(body.edit || {})
    const category = body.category != null ? (typeof body.category === 'string' ? cleanCategory(body.category) || null : (() => { throw new Error('category must be text') })()) : undefined
    for (const t of s.transactions) {
      if (!ids.has(t.transaction_id)) continue
      if (category !== undefined) t.category_override = category
      Object.assign(t, edit)
    }
    return { ok: true, count: ids.size }
  }
  if (method === 'POST' && (m = path.match(/^\/api\/transactions\/([\w-]+)\/category$/))) {
    let category = cleanCategory(String(body.category || '')) || null
    const t = s.transactions.find((x) => x.transaction_id === m[1])
    if (body.make_rule && category) {
      addRule(s, String(body.match_text || ''), category)
      const [rules] = parseRules(s.settings.rules)
      const covered = t ? categorize({ ...t, category_override: null }, rules)[0] === category : false
      if (covered && !MOVE_CATEGORIES.has(category)) category = null
    }
    if (t) t.category_override = category
    return { ok: true }
  }
  if (method === 'PUT' && path === '/api/budget') {
    if (body.amount == null || body.amount === '') delete s.settings.monthly_budget
    else s.settings.monthly_budget = String(positive(body.amount))
    return { ok: true }
  }
  if (method === 'PUT' && path === '/api/budget/category') {
    const category = cleanCategory(String(body.category || ''))
    if (!category) throw new Error('Pick a category')
    s.budgets = s.budgets.filter((b) => b.category !== category)
    if (!(body.amount == null || body.amount === '')) s.budgets.push({ category, amount: positive(body.amount) })
    return { ok: true }
  }
  if (method === 'POST' && path === '/api/rules/add') { addRule(s, String(body.text || ''), String(body.category || '')); return { ok: true } }
  if (method === 'POST' && path === '/api/rules/delete') {
    const lines = (s.settings.rules || '').split('\n')
    if (lines.at(-1) === '') lines.pop()
    const i = Number(body.line) - 1
    if (!(i >= 0 && i < lines.length) || lines[i].trim() !== String(body.expected ?? '').trim()) throw new Error('The rules file changed. Reload and try again.')
    lines.splice(i, 1)
    s.settings.rules = lines.join('\n') + '\n'
    return { ok: true }
  }
  if (method === 'PUT' && path === '/api/rules') {
    if (typeof body.text !== 'string') throw new Error('Rules text is missing')
    const errors = parseRules(body.text)[1]
    if (errors.length) return { ok: false, errors }
    s.settings.rules = body.text
    return { ok: true, errors: [] }
  }
  if (method === 'POST' && path === '/api/recurring/ignore') {
    const key = String(body.key || '').slice(0, 200)
    if (!key) throw new Error('Missing key')
    s.recurring_ignored = s.recurring_ignored.filter((k) => k !== key)
    if (body.ignored ?? true) s.recurring_ignored.push(key)
    return { ok: true }
  }
  if (method === 'POST' && path === '/api/recurring/manual') {
    const incomplete = 'Fill in a name, amount, how often, and the next date'
    const name = String(body.name || '').trim().slice(0, 100)
    const amount = Number(body.amount)
    const next = String(body.next_date)
    if (!name || !['bill', 'income'].includes(body.kind) || !(body.frequency in FREQUENCY_DAYS) || !(amount > 0 && amount < 1e7)
      || !isDate(next) || Math.abs(daysBetween(today, next)) > 400) throw new Error(incomplete)
    s.recurring_manual.push({ id: nextId(s), name, kind: body.kind, amount, frequency: body.frequency, next_date: next,
      category: cleanCategory(String(body.category || '')) || null })
    return { ok: true }
  }
  if (method === 'POST' && (m = path.match(/^\/api\/recurring\/manual\/(\d+)\/delete$/))) {
    s.recurring_manual = s.recurring_manual.filter((r) => r.id !== Number(m[1]))
    return { ok: true }
  }
  if (method === 'POST' && path === '/api/payment-plans') {
    const incomplete = "Fill in the card, a name, the monthly amount, what's left, the statement date and closing day"
    const name = String(body.name || '').trim().slice(0, 100)
    const monthly = Number(body.monthly), remaining = Number(body.remaining), closeDay = Number(body.close_day)
    const card = s.accounts.find((a) => a.account_id === String(body.account_id || '') && a.type === 'credit' && a.current_balance != null)
    if (!name || !card || !(monthly > 0 && monthly <= remaining && remaining < 1e7) || !Number.isInteger(closeDay)
      || closeDay < 1 || closeDay > 31 || !isDate(body.as_of)) throw new Error(incomplete)
    s.payment_plans.push({ id: nextId(s), account_id: card.account_id, name, monthly, remaining, as_of: String(body.as_of), close_day: closeDay })
    return { ok: true }
  }
  if (method === 'POST' && (m = path.match(/^\/api\/payment-plans\/(\d+)\/delete$/))) {
    s.payment_plans = s.payment_plans.filter((p) => p.id !== Number(m[1]))
    return { ok: true }
  }
  if (method === 'POST' && (m = path.match(/^\/api\/accounts\/([\w-]+)\/hidden$/))) {
    if (typeof body.hidden !== 'boolean') throw new Error('hidden must be true or false')
    const a = s.accounts.find((x) => x.account_id === m[1])
    if (a) a.hidden = body.hidden ? 1 : 0
    return { ok: true }
  }
  if (method === 'POST' && (m = path.match(/^\/api\/accounts\/([\w-]+)\/owner$/))) {
    const a = s.accounts.find((x) => x.account_id === m[1])
    if (a) a.owner_id = Number(body.owner_id)
    return { ok: true }
  }
  throw new Error("The server doesn't do that")
}

function nextId(s) {
  const used = [...s.recurring_manual, ...s.payment_plans].map((r) => r.id)
  s.next_id = Math.max(s.next_id || 0, ...used, 0) + 1
  return s.next_id
}

export function emptyStore() {
  return {
    owners: [{ id: 1, name: 'Me' }], items: [], accounts: [], transactions: [], holdings: [], balances: [],
    budgets: [], settings: {}, recurring_ignored: [], recurring_manual: [], amazon_orders: [], payment_plans: [], next_id: 0,
  }
}
