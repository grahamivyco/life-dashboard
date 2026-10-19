// Pull fresh accounts, transactions and holdings from Plaid, and Apple Card from YNAB, into the store.
// Ported from mac/money/sync.py and ynab.py. Keys come from Vault (money_secrets).

const PLAID = 'https://production.plaid.com'
const YNAB = 'https://api.ynab.com/v1'
const APPLE_ACCOUNT = 'file-apple-card'
const APPLE_ITEM = 'file-apple-card'
const CARD_PAYMENT_PLAID = 'LOAN_PAYMENTS/LOAN_PAYMENTS_CREDIT_CARD_PAYMENT'

export class PlaidError extends Error {
  constructor(code, message) { super(`${code}: ${message}`); this.code = code }
}

const now = () => new Date().toISOString()

async function plaid(keys, path, payload) {
  let res
  try {
    res = await fetch(PLAID + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: keys.plaid_client_id, secret: keys.plaid_secret, ...payload }),
      signal: AbortSignal.timeout(60000),
    })
  } catch (e) {
    throw new PlaidError('NETWORK', `Couldn't reach Plaid (${e.message})`)
  }
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    if (!body) throw new PlaidError('HTTP_ERROR', `Plaid answered with status ${res.status}`)
    throw new PlaidError(body.error_code || 'UNKNOWN', body.display_message || body.error_message || '')
  }
  return body
}

export async function syncAll(s, keys, today) {
  if (!keys.plaid_client_id || !keys.plaid_secret) throw new Error('Plaid keys are missing on the server')
  const results = []
  for (const item of s.items.filter((i) => i.kind !== 'file')) {
    try {
      const token = keys[`item:${item.item_id}`]
      if (!token) throw new PlaidError('KEY_MISSING', 'No access token for this bank on the server')
      await syncItem(s, keys, item, token, today)
      item.last_synced = now(); item.last_error = null
      results.push({ institution: item.institution, ok: true })
    } catch (e) {
      item.last_error = e.message
      results.push({ institution: item.institution, ok: false, error: e.message })
    }
  }
  return results
}

async function syncItem(s, keys, item, token, today) {
  // Every call happens before the first change, so a failure leaves the store as it was
  const accounts = (await plaid(keys, '/accounts/get', { access_token: token })).accounts
  if (item.kind === 'investments') {
    const holdings = await plaid(keys, '/investments/holdings/get', { access_token: token })
    saveAccounts(s, item.item_id, accounts, today)
    saveHoldings(s, holdings)
    return
  }
  const changes = await fetchWithRetry(keys, token, item.cursor)
  let holdings = null, holdingsError = null
  if (accounts.some((a) => a.type === 'investment')) {
    try { holdings = await plaid(keys, '/investments/holdings/get', { access_token: token }) } catch (e) { holdingsError = e.code || 'UNKNOWN' }
  }
  saveAccounts(s, item.item_id, accounts, today)
  saveTransactionChanges(s, item, changes)
  if (holdings) saveHoldings(s, holdings)
  if (!['PRODUCT_NOT_READY', 'NETWORK'].includes(holdingsError)) item.holdings_error = holdingsError
}

function saveAccounts(s, itemId, accounts, today) {
  const firstOwner = s.owners[0]?.id ?? 1
  for (const a of accounts) {
    const b = a.balances || {}
    let row = s.accounts.find((x) => x.account_id === a.account_id)
    if (!row) {
      row = { account_id: a.account_id, item_id: itemId, owner_id: firstOwner, mask: a.mask ?? null, type: a.type, subtype: a.subtype ?? null, hidden: 0 }
      s.accounts.push(row)
    }
    Object.assign(row, { name: a.official_name || a.name, current_balance: b.current ?? null, available_balance: b.available ?? null, updated_at: now() })
    if (b.current != null) setBalance(s, a.account_id, today, b.current)
  }
}

function setBalance(s, accountId, day, balance) {
  const found = s.balances.find((x) => x.account_id === accountId && x.date === day)
  if (found) found.balance = balance
  else s.balances.push({ account_id: accountId, date: day, balance })
}

async function fetchWithRetry(keys, token, cursor) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetchChanges(keys, token, cursor)
    } catch (e) {
      // Plaid asks for a restart of the whole page run if data changed mid-way
      if (e.code !== 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION' || attempt === 2) throw e
    }
  }
}

async function fetchChanges(keys, token, cursor) {
  const added = [], modified = [], removed = []
  for (;;) {
    const page = await plaid(keys, '/transactions/sync', { access_token: token, count: 500, ...(cursor ? { cursor } : {}) })
    added.push(...page.added); modified.push(...page.modified); removed.push(...page.removed)
    cursor = page.next_cursor
    if (!page.has_more) return { added, modified, removed, cursor }
  }
}

const HAND_EDITS = ['category_override', 'name_override', 'note', 'hidden', 'tags']

function saveTransactionChanges(s, item, { added, modified, removed, cursor }) {
  const byId = new Map(s.transactions.map((t) => [t.transaction_id, t]))
  for (const txn of [...added, ...modified]) {
    saveTransaction(s, byId, txn)
    if (txn.pending_transaction_id) carryEdits(byId, txn.pending_transaction_id, txn.transaction_id)
  }
  const gone = new Set(removed.map((t) => t.transaction_id))
  if (gone.size) s.transactions = s.transactions.filter((t) => !gone.has(t.transaction_id))
  item.cursor = cursor
  dropOverlap(s)
}

function saveTransaction(s, byId, txn) {
  const c = txn.personal_finance_category
  const fields = {
    account_id: txn.account_id, date: txn.date, description: txn.name, merchant: txn.merchant_name ?? null,
    amount: txn.amount, plaid_category: c ? `${c.primary || ''}/${c.detailed || ''}` : null, pending: txn.pending ? 1 : 0,
  }
  const old = byId.get(txn.transaction_id)
  if (old) Object.assign(old, fields) // your category, name, note, hidden and tags stay
  else {
    const row = { transaction_id: txn.transaction_id, ...fields, category_override: null, name_override: null, note: null, hidden: 0, tags: null }
    s.transactions.push(row)
    byId.set(row.transaction_id, row)
  }
}

// Plaid gives a posted charge a new id. Copy your edits over from the pending one.
function carryEdits(byId, pendingId, postedId) {
  const old = byId.get(pendingId), posted = byId.get(postedId)
  if (!old || !posted) return
  for (const f of HAND_EDITS) {
    if (f === 'hidden') posted.hidden = Math.max(posted.hidden || 0, old.hidden || 0)
    else if (posted[f] == null) posted[f] = old[f] ?? null
  }
}

// Where Plaid now covers dates an imported Robinhood card file did, keep Plaid's copy.
function dropOverlap(s) {
  const accounts = new Set(s.transactions.filter((t) => t.transaction_id.startsWith('rhcard-')).map((t) => t.account_id))
  for (const accountId of accounts) {
    const plaidDates = s.transactions.filter((t) => t.account_id === accountId && !t.transaction_id.startsWith('rhcard-')).map((t) => t.date)
    if (!plaidDates.length) continue
    const start = plaidDates.sort()[0]
    s.transactions = s.transactions.filter((t) => !(t.account_id === accountId && t.transaction_id.startsWith('rhcard-') && t.date >= start))
  }
}

function saveHoldings(s, response) {
  const securities = Object.fromEntries(response.securities.map((x) => [x.security_id, x]))
  const accounts = new Set(response.accounts.map((a) => a.account_id))
  s.holdings = s.holdings.filter((h) => !accounts.has(h.account_id))
  for (const h of response.holdings) {
    const sec = securities[h.security_id] || {}
    s.holdings.push({
      account_id: h.account_id, security_id: h.security_id, ticker: sec.ticker_symbol ?? null, name: sec.name ?? null,
      quantity: h.quantity ?? null, price: h.institution_price ?? null, value: h.institution_value ?? null, cost_basis: h.cost_basis ?? null,
    })
  }
}

// ---------- Apple Card through YNAB ----------
async function ynab(token, path) {
  const res = await fetch(YNAB + path, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(60000) })
  if (!res.ok) throw new Error(`YNAB said ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return (await res.json()).data
}

function knownCategories(s, skipAccount) {
  const counts = {}
  for (const t of s.transactions) {
    if (!t.merchant || !t.plaid_category || t.account_id === skipAccount) continue
    if (t.transaction_id.startsWith('rhcard-') || t.transaction_id.startsWith('apple-')) continue
    const k = `${t.merchant}\u0000${t.plaid_category}`
    counts[k] = (counts[k] || 0) + 1
  }
  const known = {}
  for (const [k] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    const [merchant, category] = k.split('\u0000')
    if (!(merchant.toLowerCase() in known)) known[merchant.toLowerCase()] = category
  }
  return known
}

export async function syncYnab(s, token, today) {
  if (!token) return 0
  const accounts = (await ynab(token, '/budgets/last-used/accounts')).accounts
    .filter((a) => !a.deleted && !a.closed && a.name.toLowerCase().includes('apple') && a.type === 'creditCard')
  if (!accounts.length) return 0
  const account = accounts[0]
  if (!s.items.some((i) => i.item_id === APPLE_ITEM)) s.items.push({ item_id: APPLE_ITEM, institution: 'Apple Card', kind: 'file', cursor: null, last_synced: null, last_error: null, holdings_error: null })
  if (!s.accounts.some((a) => a.account_id === APPLE_ACCOUNT)) {
    s.accounts.push({ account_id: APPLE_ACCOUNT, item_id: APPLE_ITEM, owner_id: s.owners[0]?.id ?? 1, name: 'Apple Card', mask: null, type: 'credit', subtype: 'credit card', current_balance: null, available_balance: null, updated_at: null, hidden: 0 })
  }
  const since = new Date(Date.parse(today) - 730 * 86400000).toISOString().slice(0, 10)
  const txns = (await ynab(token, `/budgets/last-used/accounts/${account.id}/transactions?since_date=${since}`)).transactions
  const known = knownCategories(s, APPLE_ACCOUNT)
  const byId = new Map(s.transactions.map((t) => [t.transaction_id, t]))
  const deleted = new Set()
  let saved = 0
  for (const t of txns) {
    const id = 'ynab-' + t.id
    if (t.deleted) { deleted.add(id); continue }
    const amount = Math.round(-t.amount / 10) / 100 // YNAB: purchases negative, in thousandths. Here money out is positive
    const payee = (t.payee_name || '').trim() || null
    const category = t.transfer_account_id && amount < 0 ? CARD_PAYMENT_PLAID : known[(payee || '').toLowerCase()] ?? null
    const fields = { account_id: APPLE_ACCOUNT, date: t.date, description: payee || t.memo || 'Apple Card', merchant: payee, amount,
      pending: ['cleared', 'reconciled'].includes(t.cleared) ? 0 : 1 }
    const old = byId.get(id)
    if (old) Object.assign(old, fields) // keeps the category it got the first time, like the Mac app
    else s.transactions.push({ transaction_id: id, ...fields, plaid_category: category, category_override: null, name_override: null, note: null, hidden: 0, tags: null })
    saved++
  }
  // YNAB covers the card now, so drop deleted rows and any CSV import for the same dates
  s.transactions = s.transactions.filter((t) => !deleted.has(t.transaction_id)
    && !(t.account_id === APPLE_ACCOUNT && t.transaction_id.startsWith('apple-') && t.date >= since))
  const owed = Math.round(-account.balance / 10) / 100
  const row = s.accounts.find((a) => a.account_id === APPLE_ACCOUNT)
  row.current_balance = owed; row.updated_at = now()
  setBalance(s, APPLE_ACCOUNT, today, owed)
  return saved
}
