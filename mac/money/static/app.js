const TOKEN = document.querySelector('meta[name="token"]').content;

// Local date as YYYY-MM-DD. toISOString() would use UTC and flip to tomorrow on US evenings.
function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseDay(text) {
  const [year, month, day] = text.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function readSetting(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}

function saveSetting(key, value) {
  try { localStorage.setItem(key, value); } catch { /* private window: just don't remember */ }
}

const state = {
  tab: "dashboard",
  netRange: "3m",
  month: localDate().slice(0, 7),
  owner: "",
  owners: [],
  demo: false,
  categories: [],
  transactions: [],
  ruleOfferFor: null,
  recurringView: "upcoming",
  period: "month",
  periodOffset: 0,
  includeBills: true,
  breakdown: "categories",
  openGroups: new Set(),
  range: null,          // { since, until, label } when opened from Spending
  lastSpending: null,
  selecting: false,
  picked: new Set(),
  drawerTxn: null,
  rules: [],
  recurringMenu: null,
  addingRecurring: false,
};

const $ = (selector) => document.querySelector(selector);

const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const wholeDollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

// Bank descriptions are outside text, so escape them everywhere, including inside attributes.
function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", "X-Token": TOKEN },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json();
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || (data.errors || []).join(" ") || "Something went wrong");
  }
  return data;
}

function withOwner(path) {
  if (!state.owner) return path;
  return `${path}${path.includes("?") ? "&" : "?"}owner=${state.owner}`;
}

let bannerTimer;
function showBanner(message, isError = false) {
  const banner = $("#banner");
  banner.textContent = message;
  banner.className = isError ? "error" : "";
  banner.hidden = !message;
  clearTimeout(bannerTimer);
  if (message && !isError) bannerTimer = setTimeout(() => { banner.hidden = true; }, 7000);
}

// ---------- Icons ----------

const PHONE = window.matchMedia("(max-width: 640px)");

const ICONS = {
  filter: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  dashboard: '<rect x="4" y="4" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="2"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2"/>',
  recurring: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4M14 15.5a2.5 2.5 0 1 1 1 2"/>',
  spending: '<rect x="2.5" y="5" width="19" height="12" rx="2"/><circle cx="12" cy="11" r="2.6"/><path d="M4 20h16"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  investments: '<path d="M5 20v-7M10 20V9M15 20v-5M20 20V5"/>',
  bank: '<path d="M3 10l9-6 9 6M5 10v9M19 10v9M9.5 10v9M14.5 10v9M3 21h18"/>',
  rules: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
  sync: '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4"/>',
  "chevron-left": '<path d="M15 6l-6 6 6 6"/>',
  "chevron-right": '<path d="M9 6l6 6-6 6"/>',
  "chevron-down": '<path d="M6 9l6 6 6-6"/>',
  "arrow-down": '<path d="M12 5v14M6 13l6 6 6-6"/>',
  "arrow-up": '<path d="M12 19V5M6 11l6-6 6 6"/>',
  card: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6 15h4"/>',
  cash: '<rect x="2.5" y="5" width="19" height="12" rx="2"/><circle cx="12" cy="11" r="2.6"/><path d="M4 20h16"/>',
  piggy: '<path d="M4 12a7 6 0 0 1 12.5-3.7H19l1 3v3h-1.6l-1.4 3h-3v-1.8h-4V19H7l-1.3-3A5.6 5.6 0 0 1 4 12z"/><path d="M15.5 10.5h.01M10 6.5h4"/>',
  chart: '<path d="M5 20v-7M10 20V9M15 20v-5M20 20V5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  bills: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h4"/>',
  dining: '<path d="M7 3v18M4.5 3v5a2.5 2.5 0 0 0 5 0V3M17.5 21V3c-2.2 0-3.5 3-3.5 7.5h3.5"/>',
  groceries: '<path d="M3 4h2l2.4 11h10.2L20 8H6.2"/><circle cx="9" cy="19.5" r="1.3"/><circle cx="17" cy="19.5" r="1.3"/>',
  shopping: '<path d="M5 8h14l-1 13H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  transport: '<path d="M5 16v-5l2-5h10l2 5v5M3 16h18v3H3zM7.5 13.5h.01M16.5 13.5h.01"/>',
  entertainment: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  health: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  travel: '<path d="M2.5 12.5l19-8-6.5 16-3-6.5z"/><path d="M12 14l9.5-9.5"/>',
  personal: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18"/>',
  home: '<path d="M3 11l9-7 9 7M5 10v10h14V10M10 20v-5h4v5"/>',
  fees: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16h.01"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v9h14v-9M12 8v13M12 8c-1.5-3.5-5.5-4-5.5-1.5S10 8 12 8c2 0 5.5.5 5.5-1.5S13.5 4.5 12 8"/>',
  services: '<path d="M14.7 6.3a4 4 0 0 0 5 5l-8.2 8.2a2.1 2.1 0 0 1-3-3z"/><path d="M14.7 6.3L17 4"/>',
  income: '<path d="M9.5 3.5h5l-1.5 3.5h-2z"/><path d="M7 20.5h10a4 4 0 0 0 1.3-7.2L14 7h-4l-4.3 6.3A4 4 0 0 0 7 20.5z"/><path d="M13.6 11.5H11a1.4 1.4 0 0 0 0 2.8h2a1.4 1.4 0 0 1 0 2.8h-2.6M12 10.5v1M12 17v1"/>',
  transfer: '<circle cx="12" cy="12" r="9"/><path d="M8 12h8M13 9l3 3-3 3"/>',
  ignored: '<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
  question: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .9-1 1.6v.4M12 16.5h.01"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8z"/><path d="M7.5 8h.01"/>',
  expand: '<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>',
  refund: '<rect x="2.5" y="5" width="19" height="12" rx="2"/><circle cx="12" cy="11" r="2.6"/><path d="M18 20v-3M16 18.5l2 2 2-2"/>',
  budget: '<rect x="4" y="3" width="16" height="18" rx="2.5"/><path d="M8 8h3M9.5 6.5v3M13 8h3M8 15l3 3M11 15l-3 3M13 15.5h3M13 17.5h3"/>',
  equals: '<circle cx="12" cy="12" r="9"/><path d="M8.5 10h7M8.5 14h7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  more: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  dots: '<path d="M12 5.5h.01M12 12h.01M12 18.5h.01" stroke-width="3"/>',
  plus: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
};

function icon(name) {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.tag}</svg>`;
}

function fillIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((el) => { el.innerHTML = icon(el.dataset.icon); });
}

// Each category gets the same icon and color everywhere: ring, list and transaction rows.
const CATEGORY_STYLE = {
  "Bills & Utilities": ["bills", "#3c7fc0"],
  "Dining & Drinks": ["dining", "#5b5fe0"],
  "Groceries": ["groceries", "#0b9ea1"],
  "Shopping": ["shopping", "#c08a06"],
  "Auto & Transport": ["transport", "#1f5fd1"],
  "Entertainment & Rec.": ["entertainment", "#cf3468"],
  "Health & Wellness": ["health", "#12a174"],
  "Travel & Vacation": ["travel", "#e2741a"],
  "Personal Care": ["personal", "#a855f7"],
  "Home & Garden": ["home", "#5f8a1f"],
  "Fees": ["fees", "#b45309"],
  "Taxes & Giving": ["gift", "#64748b"],
  "Services": ["services", "#0e7490"],
  "Loan Payments": ["bank", "#475569"],
  "Rent": ["home", "#9a3412"],
  "Card purchases (no detail)": ["card", "#64748b"],
  "Income": ["income", "#16803c"],
  "Transfer": ["transfer", "#8a8a90"],
  "Credit Card Payment": ["card", "#8a8a90"],
  "Investing": ["investments", "#8a8a90"],
  "Ignored": ["ignored", "#8a8a90"],
  "Uncategorized": ["question", "#5876e0"],
};

// Life Dashboard look: ink tones only, no brand colors. Tomato is kept for alerts.
const INK = ["#2F2C27", "#5F5A51", "#8E897E", "#4A463F", "#A5A094", "#77736A", "#BDB8AC", "#3B3832"];
Object.keys(CATEGORY_STYLE).forEach((name, i) => { CATEGORY_STYLE[name][1] = INK[i % INK.length]; });
const EXTRA_COLORS = INK;

function hashText(text) {
  let hash = 0;
  for (const ch of text) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash;
}

function categoryStyle(name) {
  return CATEGORY_STYLE[name] || ["tag", EXTRA_COLORS[hashText(name) % EXTRA_COLORS.length]];
}

function categoryBubble(name) {
  const [iconName, color] = categoryStyle(name);
  return `<span class="bubble" style="background:${color}1f;color:${color}">${icon(iconName)}</span>`;
}

const BRAND_COLORS = {
  spotify: "#1db954", netflix: "#e50914", amazon: "#ff9900", uber: "#111111", verizon: "#cd040b",
  robinhood: "#00c805", venmo: "#3d95ce", paypal: "#003087", icloud: "#3693f3", apple: "#111111",
  target: "#cc0000", costco: "#005daa", "trader joe's": "#c8102e", sweetgreen: "#2f5d3a", equinox: "#111111",
  shell: "#f4b400", cvs: "#cc0000", delta: "#003366", "pg&e": "#0f6cb6",
};

const AVATAR_COLORS = ["#2F2C27", "#4A463F", "#5F5A51", "#77736A"];

function avatar(name) {
  const clean = (name || "?").replace(/^(SQ|TST|SP|PP)\s*\*\s*/i, "").trim();
  const color = AVATAR_COLORS[hashText(clean.toLowerCase()) % AVATAR_COLORS.length];
  return `<span class="bubble letter" style="background:${color}">${escapeHtml(clean.charAt(0).toUpperCase())}</span>`;
}

// ---------- Formatting ----------

function compactDollars(value) {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1).replace(/\.0$/, "")}k`;
  return `${sign}$${Math.round(abs)}`;
}

function longDate(text) {
  return parseDay(text).toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

function shortDate(text) {
  return parseDay(text).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function longDay(text) {
  return parseDay(text).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function daysUntil(text) {
  const days = Math.round((parseDay(text) - parseDay(localDate())) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 0) return `${-days} days ago`;
  return `in ${days} days`;
}

function timeAgo(isoTime) {
  const minutes = Math.round((Date.now() - new Date(isoTime)) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} hr ago`;
  return `${Math.round(minutes / 1440)} days ago`;
}

function monthLabel(month) {
  const [year, number] = month.split("-").map(Number);
  return new Date(year, number - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
}

function greeting() {
  const hour = new Date().getHours();
  const part = hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening";
  const owner = state.owners.find((o) => String(o.id) === state.owner) || state.owners[0];
  return `Good ${part}${owner ? ", " + owner.name : ""}`;
}

// ---------- Charts (plain SVG, nothing loaded from the internet) ----------

// Smooth line through the points that never overshoots them (monotone cubic), like
// Rocket Money's soft curves.
function smoothPath(points) {
  const n = points.length;
  const slopes = [];
  for (let i = 0; i < n - 1; i++) {
    slopes.push((points[i + 1][1] - points[i][1]) / (points[i + 1][0] - points[i][0]));
  }
  const tangents = points.map((_, i) => {
    if (i === 0) return slopes[0];
    if (i === n - 1) return slopes[n - 2];
    if (slopes[i - 1] * slopes[i] <= 0) return 0;  // a peak or valley stays flat
    return (slopes[i - 1] + slopes[i]) / 2;
  });
  let d = `M${points[0][0].toFixed(1)},${points[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const step = (x1 - x0) / 3;
    d += ` C${(x0 + step).toFixed(1)},${(y0 + tangents[i] * step).toFixed(1)} ${(x1 - step).toFixed(1)},${(y1 - tangents[i + 1] * step).toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  return d;
}

// Keep every `step`th value plus the last one, so a long daily series reads as a calm line.
function thin(values, step) {
  const kept = values.filter((_, i) => i % step === 0);
  if ((values.length - 1) % step) kept.push(values[values.length - 1]);
  return kept;
}

// series: [{ values, className, length, fill }]. `length` lets a short line (this month)
// share the x scale of a longer one (last month).
function lineChart(series, { zeroLine = false } = {}) {
  const all = series.flatMap((s) => s.values);
  if (all.length < 2) return `<p class="empty">Not enough history yet.</p>`;
  let min = Math.min(...all);
  let max = Math.max(...all);
  if (zeroLine) { min = Math.min(min, 0); max = Math.max(max, 0); }
  const pad = (max - min) * 0.12 || Math.abs(max) * 0.1 || 1;
  min -= pad;
  max += pad;
  const width = 1000;
  const height = 100;
  const y = (v) => height - ((v - min) / (max - min)) * height;
  const ticks = [max - pad, (max + min) / 2, min + pad];
  const paths = series.filter((s) => s.values.length > 1).map((s) => {
    const span = Math.max((s.length || s.values.length) - 1, 1);
    const points = s.values.map((v, i) => [(i / span) * width, y(v)]);
    const line = smoothPath(points);
    const area = s.fill === false ? "" : `<path class="area" d="${line} L${points[points.length - 1][0]},${height} L0,${height} Z"/>`;
    return `${area}<path class="line ${s.className || ""}" d="${line}"/>`;
  }).join("");
  const grid = ticks.map((t) => `<line class="grid-line" x1="0" x2="${width}" y1="${y(t)}" y2="${y(t)}"/>`).join("");
  const zero = zeroLine && min < 0 ? `<line class="zero" x1="0" x2="${width}" y1="${y(0)}" y2="${y(0)}"/>` : "";
  return `
    <div class="line-chart">
      <div class="ticks">${ticks.map((t) => `<span>${compactDollars(t)}</span>`).join("")}</div>
      <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img">${grid}${zero}${paths}</svg>
    </div>`;
}

// slices: [{ value, color, icon, label }]. Draws a ring with small gaps and icons sitting in the ring.
// A slice's label shows as a popup when you hover it.
function donut(slices, captionTop, captionBottom, total) {
  const r = 160;
  const circumference = 2 * Math.PI * r;
  const sum = slices.reduce((s, x) => s + x.value, 0);
  const gap = slices.length > 1 ? 7 : 0;
  // Tiny slices get a minimum arc so they read as a dash, taken from the bigger ones.
  const minArc = gap + 8;
  const raw = slices.map((s) => (s.value / sum) * circumference);
  const lifted = raw.reduce((t, l) => t + Math.max(minArc - l, 0), 0);
  const big = raw.filter((l) => l > minArc).reduce((t, l) => t + l, 0);
  const lengths = raw.map((l) => (l > minArc ? l - (lifted * l) / big : minArc));
  let start = 0;
  let rings = "";
  let marks = "";
  slices.forEach((slice, i) => {
    const length = lengths[i];
    const drawn = Math.max(length - gap, 1);
    rings += `<circle ${slice.link || ""} cx="200" cy="200" r="${r}" fill="none" stroke="${slice.color}" stroke-width="16"
      stroke-dasharray="${drawn} ${circumference}" stroke-dashoffset="${-start}" transform="rotate(-90 200 200)">${slice.label ? `<title>${escapeHtml(slice.label)}</title>` : ""}</circle>`;
    if (slice.icon && length >= 80) {
      const angle = ((start + length / 2) / circumference) * 2 * Math.PI - Math.PI / 2;
      const cx = 200 + r * Math.cos(angle);
      const cy = 200 + r * Math.sin(angle);
      marks += `<circle cx="${cx}" cy="${cy}" r="24" fill="var(--card)" pointer-events="none"/>
        <svg x="${cx - 17}" y="${cy - 17}" width="34" height="34" viewBox="0 0 24 24" class="icon" style="color:${slice.color}" pointer-events="none">${ICONS[slice.icon]}</svg>`;
    }
    start += length;
  });
  return `
    <svg class="donut" viewBox="0 0 400 400" role="img">
      ${rings}${marks}
      <text x="200" y="164" class="caption">${escapeHtml(captionTop)}</text>
      <text x="200" y="192" class="caption">${escapeHtml(captionBottom)}</text>
      <text x="200" y="250" class="total">${escapeHtml(total)}</text>
    </svg>`;
}

function deltaLine(change, text, good = change >= 0) {
  return `<div class="delta"><span class="delta-icon ${good ? "good" : "bad"}">${icon(change < 0 ? "arrow-down" : "arrow-up")}</span>${text}</div>`;
}

// ---------- Hero header per tab ----------

function renderHero() {
  const titles = {
    dashboard: greeting(),
    recurring: "Recurring",
    spending: "Spending",
    transactions: "Transactions",
    investments: "Investments",
    accounts: "Accounts",
    rules: "Sorting rules",
    networth: "Net Worth",
  };
  $("#page-title").textContent = titles[state.tab];
  const extra = $("#hero-extra");
  if (state.tab === "recurring") {
    extra.innerHTML = `<button class="hero-plus" data-add-recurring="open" aria-label="Add a recurring item">${icon("plus")}</button>
      <div class="tabs">
      <button data-recurring="upcoming" class="${state.recurringView === "upcoming" ? "active" : ""}">Upcoming</button>
      <button data-recurring="all" class="${state.recurringView === "all" ? "active" : ""}">All</button></div>`;
  } else if (state.tab === "transactions") {
    if (!$("#search")) {
      extra.innerHTML = `<label class="search">${icon("search")}<input id="search" type="search" placeholder="Search my transactions">
        <button type="button" class="filter-icon" data-show-filters aria-label="Filters">${icon("filter")}</button></label>`;
    }
  } else if (state.tab === "accounts") {
    extra.innerHTML = `<div class="hero-actions">
      <button class="primary" data-link="banking" ${state.demo ? "disabled" : ""}>${icon("plus")}Link account</button></div>`;
  } else if (state.tab === "rules") {
    extra.innerHTML = `<p class="hero-note">Rules run top to bottom and the first match wins. Your own pick on a single
      transaction beats every rule. Changing a rule re-sorts all your history.</p>`;
  } else if (state.tab === "networth") {
    extra.innerHTML = `<div class="periods">${Object.entries(NET_WORTH_RANGES).map(([key, label]) =>
      `<button data-net-range="${key}" class="${key === state.netRange ? "active" : ""}">${label}</button>`).join("")}</div>`;
  } else if (state.tab !== "spending") {
    extra.innerHTML = "";
  }
}

// ---------- Dashboard ----------

async function renderDashboard() {
  const data = await api(withOwner("/api/dashboard"));
  const b = data.balances;

  const attention = $("#attention");
  attention.hidden = !data.needs_attention.length;
  attention.innerHTML = `${data.needs_attention.length === 1 ? "An account requires" : "Some accounts require"} attention ${icon("chevron-right")}`;

  const history = data.net_worth_history;
  const monthAgo = history[Math.max(history.length - 31, 0)].value;
  const change = b.net_worth - monthAgo;
  $("#net-worth-card").innerHTML = `
    <div class="top">
      <div class="label">Net Worth</div>
      <div class="big">${wholeDollars.format(b.net_worth)}</div>
      ${deltaLine(change, `${wholeDollars.format(Math.abs(change))} past month`)}
    </div>
    ${lineChart([{ values: thin(history.slice(-90).map((p) => p.value), 3) }])}
    <button class="foot" data-goto="networth">${icon("chart")} View Net Worth <span class="chevron">${icon("chevron-right")}</span></button>`;

  const pace = data.pace;
  const paceChange = pace.spent - pace.last_month_same_day;
  $("#pace-card").innerHTML = `
    <div class="top">
      <div class="label">Spent this month</div>
      <div class="big">${wholeDollars.format(pace.spent)}</div>
      ${deltaLine(paceChange, `${wholeDollars.format(Math.abs(paceChange))} ${paceChange > 0 ? "over" : "under"} last month`, paceChange <= 0)}
    </div>
    ${lineChart([
      { values: pace.last_month, className: "last", fill: false, length: pace.days_in_month },
      { values: pace.this_month, length: pace.days_in_month },
    ])}
    <div class="legend"><span><i></i>This month</span><span><i class="last"></i>Last month</span></div>
    <button class="foot" data-goto="spending">${icon("spending")} View Spending <span class="chevron">${icon("chevron-right")}</span></button>`;

  const forecast = data.forecast;
  const forecastChange = forecast.end - forecast.start;
  $("#forecast-card").innerHTML = `
    <div class="top">
      <div class="label">Predicted cash in 30 days</div>
      <div class="big">${wholeDollars.format(forecast.end)}</div>
      ${deltaLine(forecastChange, `from ${wholeDollars.format(forecast.start)} Net Cash today`)}
    </div>
    ${lineChart([{ values: forecast.points.map((p) => p.value), className: "future" }], { zeroLine: true })}
    <button class="foot" data-goto="recurring" data-payday="1">${icon("cash")}
      Lowest ${wholeDollars.format(forecast.lowest.value)} on ${shortDate(forecast.lowest.date)}
      <span class="chevron">${icon("chevron-right")}</span></button>`;

  renderAccountGroups(data.accounts, b);

  const today = localDate();
  const upcoming = data.recurring.filter((r) => r.next_date >= today)
    .sort((x, y) => x.next_date.localeCompare(y.next_date)).slice(0, 4);
  $("#dash-upcoming").innerHTML = upcoming.map((r) => recurringRow(r)).join("") ||
    `<p class="empty">Repeating bills show up after about three months of history.</p>`;

  $("#dash-recent").innerHTML = data.recent.map((t) => `
    <div class="row txn" data-show-txn="${escapeHtml(t.transaction_id)}" data-month="${escapeHtml(t.date.slice(0, 7))}">${txnBadge(t)}
      <div><div class="name">${escapeHtml(t.name)}</div>
        <div class="sub">${longDate(t.date)}${t.pending ? " | Pending" : ""} ${categoryChip(t.category)}</div></div>
      ${amountCell(t)}</div>`).join("") || `<p class="empty">No transactions yet.</p>`;
}

const GROUPS = [
  ["checking", "Checking", "bank"],
  ["card", "Card Balance", "card"],
  ["net_cash", "Net Cash", "cash"],
  ["savings", "Savings", "piggy"],
  ["investments", "Investments", "chart"],
  ["loan", "Loans", "bank"],
];

function renderAccountGroups(accounts, balances) {
  const rows = GROUPS.map(([key, label, iconName]) => {
    if (key === "net_cash") {
      if (!accounts.some((a) => a.group === "checking" || a.group === "card")) return "";
      const plans = balances.on_plans > 0
        ? `<div class="sub">Leaves out ${wholeDollars.format(balances.on_plans)} on 0% plans, not billed yet</div>` : "";
      return `<div class="row" title="Checking minus what you owe on cards, not counting 0% plan balances that aren't billed yet">
        <span class="bubble">${icon(iconName)}</span><div><div class="name">${label}</div>${plans}</div>
        <div class="amount ${balances.net_cash >= 0 ? "income" : ""}">${wholeDollars.format(balances.net_cash)}
          <span class="muted">${icon("info")}</span></div></div>`;
    }
    const members = accounts.filter((a) => a.group === key);
    if (!members.length) return "";
    const open = state.openGroups.has(key);
    const children = open ? members.map((a) => `
      <div class="row child"><div><div class="name">${escapeHtml(niceName(a.name))}</div>
        <div class="sub">${escapeHtml(bankName(a.institution))}${a.mask ? ` ••${escapeHtml(a.mask)}` : ""}${a.last_error ? ` · <span class="error-text">Needs attention</span>` : ""}</div></div>
        <div class="amount">${dollars.format(a.current_balance ?? 0)}</div></div>`).join("") : "";
    return `<button class="row ${open ? "open" : ""}" data-group="${key}">
        <span class="bubble">${icon(iconName)}</span><div class="name">${label}</div>
        <div class="amount">${wholeDollars.format(balances[key])}<span class="chevron">${icon("chevron-down")}</span></div>
      </button>${children}`;
  }).join("");
  $("#account-groups").innerHTML = rows || `<p class="empty">No accounts yet. Use Add account to link one.</p>`;
}

// Money moved between your own accounts, not spent or earned.
const MOVE_LABELS = {
  "Credit Card Payment": "Paid off cards",
  "Investing": "Put into investments",
  "Transfer": "Moved between your accounts",
};
const MOVE_CATEGORIES = Object.keys(MOVE_LABELS);

function txnBadge(t) {
  return MOVE_CATEGORIES.includes(t.category) ? `<span class="bubble">${icon(categoryStyle(t.category)[0])}</span>` : avatar(t.name);
}

function amountCell(t) {
  if (MOVE_CATEGORIES.includes(t.category) || t.category === "Ignored" || t.hidden) {
    return `<div class="amount quiet"><span class="ignored-mark" title="Not counted as spending">${icon("ban")}</span>${t.amount < 0 ? "+" : ""}${dollars.format(Math.abs(t.amount))}</div>`;
  }
  if (t.amount < 0) return `<div class="amount income">+${dollars.format(-t.amount)}</div>`;
  return `<div class="amount">${dollars.format(t.amount)}</div>`;
}

// withMenu adds the ⋮ button that lets you say "not recurring" or delete one you added.
function recurringRow(r, withMenu = false) {
  const income = r.kind === "income";
  const open = withMenu && state.recurringMenu === r.key;
  const menu = withMenu ? `<button class="icon-button kebab" data-recurring-menu="${escapeHtml(r.key)}" aria-label="Options">${icon("dots")}</button>` : "";
  const actions = !open ? "" : `<div class="row-actions">
    ${r.manual
      ? `<button class="secondary small" data-delete-manual="${escapeHtml(r.id)}">Delete</button>`
      : `<button class="secondary small" data-ignore-recurring="${escapeHtml(r.key)}">Not recurring</button>`}
    <button class="secondary small" data-category="" data-search="${escapeHtml(r.name)}">See transactions</button></div>`;
  return `<div class="row txn" data-category="" data-search="${escapeHtml(r.name)}">${avatar(r.name)}
    <div><div class="name">${escapeHtml(r.name)}</div><div class="sub">${daysUntil(r.next_date)}${r.varies ? " · amount varies" : ""}</div></div>
    <div class="amount ${income ? "income" : ""}">${income ? "+" : ""}${dollars.format(r.amount)}${menu}</div></div>${actions}`;
}

// ---------- Recurring ----------

async function renderRecurring() {
  const [items, forecast] = await Promise.all([api(withOwner("/api/recurring?all=1")), api(withOwner("/api/forecast"))]);
  const active = items.filter((r) => !r.ignored);
  $("#recurring-upcoming").hidden = state.recurringView !== "upcoming";
  $("#recurring-all").hidden = state.recurringView !== "all";
  renderAddRecurring();
  if (state.recurringView === "all") return renderRecurringAll(items);

  const today = localDate();
  const weekAhead = localDate(new Date(Date.now() + 7 * 86400000));
  const nextWeek = forecast.events.filter((e) => e.kind !== "income" && e.date <= weekAhead);
  const nextWeekTotal = nextWeek.reduce((s, e) => s - e.change, 0);
  const nextPay = forecast.events.find((e) => e.kind === "income");

  // Two weeks starting this Sunday. Past days show charges that already landed.
  const start = parseDay(today);
  start.setDate(start.getDate() - start.getDay());
  const byDay = {};
  const mark = (day, kind) => {
    byDay[day] ||= { bills: 0, pay: false };
    if (kind === "income") byDay[day].pay = true;
    else byDay[day].bills++;
  };
  forecast.events.forEach((e) => mark(e.date, e.kind));
  active.filter((r) => r.last_date).forEach((r) => mark(r.last_date, r.kind));
  let cells = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => `<div class="dow">${d}</div>`).join("");
  for (let i = 0; i < 14; i++) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    const key = localDate(day);
    const info = byDay[key] || { bills: 0, pay: false };
    const status = key === today ? "today" : key < today ? "past" : "";
    const dots = "<i></i>".repeat(Math.min(info.bills, 3));
    cells += `<div class="day ${status}"><span class="num">${day.getDate()}</span>
      ${dots ? `<span class="dots">${dots}</span>` : ""}${info.pay ? `<span class="pay" title="Payday">$</span>` : ""}</div>`;
  }
  const billsLine = nextWeek.length
    ? `You have ${nextWeek.length} recurring charge${nextWeek.length === 1 ? "" : "s"} for ${wholeDollars.format(nextWeekTotal)} in the next 7 days.`
    : "No bills in the next 7 days.";
  const payLine = nextPay ? ` Next payday is ${parseDay(nextPay.date).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}.` : "";
  $("#coming-up").innerHTML = `
    <div class="row-between"><h3>Coming up</h3><button class="icon-button" data-recurring="all" aria-label="See all">${icon("expand")}</button></div>
    <p class="muted lead">${billsLine}${payLine}</p>
    <div class="week-grid">${cells}</div>`;

  const paydayOn = readSetting("paydayView", "0") === "1";
  $("#payday-toggle").checked = paydayOn;
  $("#payday-body").hidden = !paydayOn;
  if (paydayOn) {
    const billsBefore = forecast.start - forecast.safe_to_spend;
    $("#payday-body").innerHTML = `
      <div class="safe">
        <div><div class="muted">Safe to spend${forecast.next_payday ? ` until ${longDate(forecast.next_payday)}` : ""}</div>
          <div class="big ${forecast.safe_to_spend >= 0 ? "good" : "error-text"}">${wholeDollars.format(forecast.safe_to_spend)}</div></div>
        <div><div class="muted">Net Cash today</div><div class="big">${wholeDollars.format(forecast.start)}</div></div>
        <div><div class="muted">Bills before payday</div><div class="big">${wholeDollars.format(billsBefore)}</div></div>
      </div>
      <p class="muted">Safe to spend is Net Cash minus the bills due before your next paycheck. The line below also
        spreads out your everyday spending at ${wholeDollars.format(forecast.daily_spend)} a day, your recent average.
        Charges tagged "one-off" and bills you added by hand (like rent) stay out of that average.</p>
      ${lineChart([{ values: forecast.points.map((p) => p.value), className: "future" }], { zeroLine: true })}`;
  }

  const soon = active.filter((r) => r.next_date >= today).sort((x, y) => x.next_date.localeCompare(y.next_date));
  $("#coming-soon").innerHTML = soon.map((r) => `<div class="pill-card">${recurringRow(r, true)}</div>`).join("") ||
    `<div class="card"><p class="muted">Nothing coming up. Repeating bills show up after about three months of history.</p></div>`;
}

function renderRecurringAll(items) {
  const active = items.filter((r) => !r.ignored);
  const groups = [
    ["Income", active.filter((r) => r.kind === "income")],
    ["Bills & subscriptions", active.filter((r) => r.kind === "bill")],
    ["Transfers out", active.filter((r) => r.kind === "transfer")],
  ];
  const row = (r) => `
    <div class="row">${avatar(r.name)}
      <div><div class="name">${escapeHtml(r.name)}</div>
        <div class="sub">${escapeHtml(r.frequency)} · ${escapeHtml(r.category)} · next ${shortDate(r.next_date)}${r.manual ? " · added by you" : ""}</div></div>
      <div class="amount ${r.kind === "income" ? "income" : ""}">${dollars.format(r.amount)}${
        r.ignored ? `<button class="secondary small" data-unignore-recurring="${escapeHtml(r.key)}">Make recurring</button>`
          : `<button class="icon-button kebab" data-recurring-menu="${escapeHtml(r.key)}" aria-label="Options">${icon("dots")}</button>`}</div></div>
    ${state.recurringMenu === r.key && !r.ignored ? `<div class="row-actions">${r.manual
      ? `<button class="secondary small" data-delete-manual="${escapeHtml(r.id)}">Delete</button>`
      : `<button class="secondary small" data-ignore-recurring="${escapeHtml(r.key)}">Not recurring</button>`}</div>` : ""}`;
  let html = groups.map(([title, list]) => {
    if (!list.length) return "";
    const monthly = list.reduce((s, r) => s + r.per_month, 0);
    return `<div class="section-head"><h2>${title}</h2><span class="muted">${wholeDollars.format(monthly)} a month</span></div>
      <div class="card list">${list.map(row).join("")}</div>`;
  }).join("");
  const ignored = items.filter((r) => r.ignored);
  if (ignored.length) {
    html += `<div class="section-head"><h2>Not recurring</h2></div><div class="card list">${ignored.map(row).join("")}</div>`;
  }
  $("#recurring-all").innerHTML = html || `<div class="card"><p class="muted">None found yet. This needs about three months of history.</p></div>`;
}

function renderAddRecurring() {
  const box = $("#add-recurring");
  box.hidden = !state.addingRecurring;
  if (!state.addingRecurring) return;
  box.innerHTML = `
    <div class="row-between"><h3>Add a recurring bill or paycheck</h3>
      <button class="icon-button" data-add-recurring="close" aria-label="Close">${icon("close")}</button></div>
    <form id="recurring-form" class="form-grid">
      <label>Name<input id="rec-name" required placeholder="e.g. Car insurance"></label>
      <label>Type<select id="rec-kind" class="pill-select"><option value="bill">Bill</option><option value="income">Paycheck or income</option></select></label>
      <label>Amount<input id="rec-amount" type="number" min="0.01" step="0.01" required></label>
      <label>How often<select id="rec-frequency" class="pill-select">
        <option>monthly</option><option>every 2 weeks</option><option>weekly</option><option>yearly</option></select></label>
      <label>Next date<input id="rec-date" type="date" required value="${localDate()}"></label>
      <button class="primary" type="submit">Add</button>
    </form>`;
}

// ---------- Spending ----------

async function renderSpending() {
  const query = `/api/spending?period=${state.period}&offset=${state.periodOffset}&bills=${state.includeBills ? 1 : 0}`;
  const [data, budget, categories] = await Promise.all([api(withOwner(query)), api(withOwner("/api/budget")), api("/api/categories")]);
  state.categories = categories;
  state.lastSpending = data;

  const tallest = Math.max(1, ...data.history.flatMap((h) => [h.income, h.spent]));
  $("#hero-extra").innerHTML = `
    <div class="periods">${["week", "month", "quarter", "year"].map((p) =>
      `<button data-period="${p}" class="${p === state.period ? "active" : ""}">${p[0].toUpperCase() + p.slice(1)}</button>`).join("")}</div>
    <div class="period-bars">${data.history.map((h) => `
      <button data-offset="${h.offset}" class="${h.offset === state.periodOffset ? "active" : ""}"
        title="Income ${wholeDollars.format(h.income)}, spent ${wholeDollars.format(h.spent)}">
        <span class="pair"><span class="bar" style="height:${(Math.max(h.income, 0) / tallest) * 100}%"></span>
          <span class="bar spend" style="height:${(Math.max(h.spent, 0) / tallest) * 100}%"></span></span>
        ${escapeHtml(h.label)}</button>`).join("")}</div>
    <div class="period-legend"><span><i></i>Income</span><span><i class="spend"></i>Total Spend</span></div>`;

  $("#spend-totals").innerHTML = `
    <button class="row" data-goto-income="1"><span class="bubble">${icon("income")}</span><div class="name">Income</div>
      <div class="amount">${wholeDollars.format(data.income)}<span class="chevron">${icon("chevron-right")}</span></div></button>
    <button class="row" data-goto-spend="1"><span class="bubble">${icon("spending")}</span><div class="name">Total Spend</div>
      <div class="amount">${wholeDollars.format(data.spent)}<span class="chevron">${icon("chevron-right")}</span></div></button>
    <div class="row" title="Income minus spending"><span class="bubble">${icon("equals")}</span><div class="name">Net Income</div>
      <div class="amount ${data.net >= 0 ? "income" : ""}">${data.net < 0 ? "-" : ""}${wholeDollars.format(Math.abs(data.net))}
        <span class="muted">${icon("info")}</span></div></div>`;

  renderBudget(budget);
  renderBreakdown(data);

  $("#needs-sorting-block").innerHTML = data.needs_sorting.length ? `
    <div class="section-head"><h2>Needs categorization</h2></div>
    <article class="card list needs">
      <p class="muted hint">Pick a category for these and it can become a rule.</p>
      ${data.needs_sorting.map((t) => `
        <button class="row" data-show-txn="${escapeHtml(t.transaction_id)}" data-month="${escapeHtml(t.date.slice(0, 7))}" data-unsorted="1">
          <span class="bubble">${icon("question")}</span>
          <div><div class="name">${escapeHtml(t.merchant || t.description)}</div><div class="sub">${longDate(t.date)}</div></div>
          <div class="amount">${dollars.format(t.amount)}</div></button>`).join("")}
    </article>` : "";

  $("#non-spending").innerHTML = `
    <button class="row" data-category="" data-filter="tags" data-value="tax-deductible"><span class="bubble" style="background:#d6f0e0;color:#16803c">${icon("budget")}</span>
      <div class="name">Tax Deductible</div><div class="amount quiet">${wholeDollars.format(data.tax_deductible)}</div></button>
    <button class="row" data-category="" data-filter="tags" data-value="reimbursable"><span class="bubble" style="background:#dbe6fd;color:#1e3a8a">${icon("refund")}</span>
      <div class="name">Reimbursements</div><div class="amount quiet">${wholeDollars.format(data.reimbursable)}</div></button>
    <div class="row"><span class="bubble">${icon("ignored")}</span><div class="name">Ignored</div>
      <div class="amount quiet">${wholeDollars.format(data.ignored)}</div></div>
    ${MOVE_CATEGORIES.map((name) => `
    <button class="row" data-category="${escapeHtml(name)}"><span class="bubble">${icon(categoryStyle(name)[0])}</span>
      <div class="name">${MOVE_LABELS[name]}</div>
      <div class="amount quiet">${wholeDollars.format(data.moves[name])}</div></button>`).join("")}`;
}

// A small progress ring with the category icon inside, like Rocket Money's budget circles.
function budgetRing(c) {
  const [iconName, color] = categoryStyle(c.name);
  const used = c.budget > 0 ? Math.min(c.spent / c.budget, 1) : 0;
  const over = c.left < 0;
  const r = 26;
  const circumference = 2 * Math.PI * r;
  return `<button class="budget-ring" data-category="${escapeHtml(c.name)}" data-month="${localDate().slice(0, 7)}" title="${escapeHtml(c.name)}: ${wholeDollars.format(c.spent)} of ${wholeDollars.format(c.budget)}">
    <svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="${r}" fill="none" stroke="var(--line)" stroke-width="5"/>
      <circle cx="32" cy="32" r="${r}" fill="none" stroke="${over ? "var(--bad)" : color}" stroke-width="5" stroke-linecap="round"
        stroke-dasharray="${used * circumference} ${circumference}" transform="rotate(-90 32 32)"/></svg>
    <span class="ring-icon" style="color:${color}">${icon(iconName)}</span>
    ${over ? `<span class="ring-alert">!</span>` : ""}</button>`;
}

function renderBudget(budget) {
  const card = $("#budget-card");
  const header = `<div class="row"><span class="bubble">${icon("budget")}</span><div class="name">${escapeHtml(budget.month)} Budget</div>
    <div class="amount quiet">${budget.budget == null ? "" : `${wholeDollars.format(budget.spent)} of ${wholeDollars.format(budget.budget)}`}</div></div>`;

  let overall;
  if (budget.budget == null) {
    // Like Rocket Money: one tappable row until you choose to set a budget.
    overall = `
      <button class="row" data-open-budget><span class="bubble">${icon("budget")}</span>
        <div><div class="name">Create a monthly budget</div><div class="sub">See what's left to spend as the month goes.</div></div>
        <span class="chevron">${icon("chevron-right")}</span></button>
      <div class="budget" id="budget-setup" hidden><div class="muted">How much do you want to spend each month?</div>
        <form id="budget-form"><input type="number" min="1" step="1" placeholder="e.g. 4000" id="budget-amount" class="pill-input" aria-label="Monthly budget">
          <button class="primary" type="submit">Set budget</button></form></div>`;
  } else {
    const used = Math.min(budget.spent / budget.budget, 1);
    overall = `<div class="budget">
      <div><div class="muted">${budget.left >= 0 ? "Left for spending" : "Over budget by"}</div>
        <div class="big">${wholeDollars.format(Math.abs(budget.left))}</div>
        <div class="progress ${budget.left < 0 ? "over" : ""}"><div style="width:${used * 100}%"></div>
          <i class="pace" style="left:${budget.month_progress * 100}%" title="Where you'd be spending evenly"></i></div></div>
      <div class="rings">${budget.categories.map(budgetRing).join("")}</div>
      <form id="budget-form"><input type="number" min="1" step="1" value="${Math.round(budget.budget)}" id="budget-amount" class="pill-input" aria-label="Monthly budget">
        <button class="secondary" type="submit">Change</button></form>
    </div>`;
  }

  const rows = budget.categories.map((c) => {
    const used = Math.min(c.spent / c.budget, 1);
    return `<div class="row budget-row" data-category="${escapeHtml(c.name)}" data-month="${localDate().slice(0, 7)}">${categoryBubble(c.name)}
      <div><div class="name">${escapeHtml(c.name)}</div>
        <div class="sub">${c.left >= 0 ? `${wholeDollars.format(c.left)} left` : `${wholeDollars.format(-c.left)} over`} · ${wholeDollars.format(c.spent)} of ${wholeDollars.format(c.budget)}</div>
        <div class="progress thin ${c.left < 0 ? "over" : ""}"><div style="width:${used * 100}%;background:${c.left < 0 ? "var(--bad)" : categoryStyle(c.name)[1]}"></div></div></div>
      <button class="delete" data-remove-budget="${escapeHtml(c.name)}" aria-label="Remove budget">${icon("close")}</button></div>`;
  }).join("");
  const options = state.categories.filter((c) => ![...MOVE_CATEGORIES, "Income", "Ignored"].includes(c) && !budget.categories.some((b) => b.name === c))
    .map((c) => `<option>${escapeHtml(c)}</option>`).join("");
  const addForm = `<form class="add-rule" id="category-budget-form"><strong>Budget a category</strong>
    <select id="budget-category" class="pill-select" aria-label="Category">${options}</select>
    <input type="number" min="1" step="1" id="budget-category-amount" class="pill-input" placeholder="Monthly limit" required>
    <button class="primary small" type="submit">Add</button></form>`;
  if (budget.budget == null) {
    card.innerHTML = overall + rows + (rows ? addForm : "");
    return;
  }
  card.innerHTML = header + overall + rows + addForm;
}

function shareText(share) {
  return share > 0 && share < 0.005 ? "<1%" : `${Math.round(share * 100)}%`;
}

function renderBreakdown(data) {
  const when = data.period === "week" ? "this week" : `in ${data.title.replace(` ${new Date().getFullYear()}`, "")}`;
  const view = state.breakdown;
  const share = (spent) => (data.ring_total > 0 ? spent / data.ring_total : 0);
  const rows = {
    categories: data.categories,
    merchants: data.merchants,
    tags: data.tags.map((t) => ({ ...t, share: share(t.spent) })),
  }[view];
  // A slice and its row in the list both open that slice's transactions.
  const link = (c) => `data-category="${escapeHtml(view === "categories" ? c.name : "")}" data-filter="${escapeHtml(view === "categories" ? "" : view)}" data-value="${escapeHtml(c.name)}"`;
  const slices = rows.slice(0, 8).map((c, i) => {
    const [iconName, color] = view === "categories" ? categoryStyle(c.name) : [null, EXTRA_COLORS[i % EXTRA_COLORS.length]];
    const label = `${c.name}: ${wholeDollars.format(c.spent)} (${shareText(c.share)})`;
    return { value: Math.max(c.spent, 0), color, icon: iconName, label, link: `${link(c)} aria-label="${escapeHtml(label)}"` };
  });
  const rest = rows.slice(8).reduce((s, c) => s + c.spent, 0);
  if (rest > 0) slices.push({ value: rest, color: "#b8b8c0", label: `Other: ${wholeDollars.format(rest)}` });
  const ringTotal = view === "tags" ? rows.reduce((s, c) => s + c.spent, 0) : data.ring_total;

  const ring = ringTotal > 0
    ? donut(slices, view === "tags" ? "Tagged spend" : state.includeBills ? "Total spend" : "Spend minus bills", when, wholeDollars.format(ringTotal))
    : `<p class="empty">${view === "tags" ? "Nothing tagged" : "No spending"} ${when}. ${view === "tags" ? "Add tags from a transaction's detail panel." : ""}</p>`;
  const refund = data.refunds.count && view === "categories" && !state.refundNoticeClosed ? `
    <div class="notice">${icon("refund")}<div>Your spending includes ${data.refunds.count} refund${data.refunds.count === 1 ? "" : "s"}
      for ${wholeDollars.format(data.refunds.total)}. Refunds lower your spending totals and percentages.</div>
      <button class="icon-button notice-close" data-close-notice aria-label="Dismiss">${icon("close")}</button></div>` : "";
  const bubble = (c, i) => {
    if (view === "categories") return categoryBubble(c.name);
    if (view === "merchants") return avatar(c.name);
    return `<span class="bubble" style="background:${EXTRA_COLORS[i % EXTRA_COLORS.length]}1f;color:${EXTRA_COLORS[i % EXTRA_COLORS.length]}">${icon("tag")}</span>`;
  };
  const list = rows.map((c, i) => `
    <button class="row" ${link(c)}>
      ${bubble(c, i)}
      <div><div class="name">${escapeHtml(c.name)}</div><div class="sub">${shareText(c.share)} of spend</div></div>
      <div class="amount">${wholeDollars.format(c.spent)}</div></button>`).join("");

  const tab = (key, label) => `<button data-breakdown="${key}" class="${view === key ? "active" : ""}">${label}</button>`;
  $("#breakdown").innerHTML = `
    <div class="segmented three">${tab("categories", "Categories")}${tab("merchants", "Merchants")}${tab("tags", "Tags")}</div>
    <div class="breakdown-top">Include bills <label class="switch"><input type="checkbox" id="bills-toggle" ${state.includeBills ? "checked" : ""}><span></span></label></div>
    <div class="breakdown-body">
      <div><div class="donut-wrap">${ring}</div>${refund}</div>
      ${list ? `<div class="cat-list">${list}</div>` : ""}
    </div>`;
}

// ---------- Transactions ----------

// The Transactions tab shows a search across all history, a date range picked on Spending, or one month.
function searchText() {
  return ($("#search")?.value || "").trim();
}

function transactionsQuery() {
  const search = searchText();
  if (search) return `/api/transactions?q=${encodeURIComponent(search)}`;
  const params = new URLSearchParams(state.range ? { since: state.range.since, until: state.range.until } : { month: state.month });
  if (state.filter) params.set(state.filter.kind === "tags" ? "tag" : "merchant", state.filter.value);
  return `/api/transactions?${params}`;
}

async function renderTransactions() {
  [state.transactions, state.categories] = await Promise.all([
    api(withOwner(transactionsQuery())),
    api("/api/categories"),
  ]);
  const period = state.range ? state.range.label : monthLabel(state.month);
  let label = period;
  if (searchText()) label = "All time";
  else if (state.filter) label = `${period} · ${state.filter.value}`;
  $("#month-label").textContent = label;
  const options = state.categories.map((c) => `<option>${escapeHtml(c)}</option>`).join("");
  const filter = $("#category-filter");
  const picked = filter.value;
  filter.innerHTML = `<option value="">All categories</option>${options}`;
  filter.value = picked;
  $("#bulk-category").innerHTML = `<option value="">Set category…</option>${options}`;
  drawTransactionList();
}

function categoryChip(name) {
  const [iconName, color] = categoryStyle(name);
  return `<span class="cat-chip" style="background:${color}1a;color:${color}">${icon(iconName)}${escapeHtml(name)}</span>`;
}

function visibleTransactions() {
  const category = $("#category-filter").value;
  const onlyUnsorted = $("#needs-sorting").checked;
  return state.transactions.filter((t) => {
    if (category && t.category !== category) return false;
    if (onlyUnsorted && t.category !== "Uncategorized") return false;
    return true;
  });
}

function drawTransactionList() {
  const selecting = state.selecting;
  $("#bulk-bar").hidden = !selecting;
  $("#select-mode").textContent = selecting ? "Done" : "Select";
  const visible = visibleTransactions();
  const shown = new Set(visible.map((t) => t.transaction_id));
  state.picked.forEach((id) => { if (!shown.has(id)) state.picked.delete(id); });
  $("#bulk-count").textContent = `${state.picked.size} selected`;
  const money = PHONE.matches ? wholeDollars : dollars;
  let total;
  if (searchText()) {
    total = `${visible.length} found`;
  } else if ($("#category-filter").value === "Income") {
    const earned = -visible.filter((t) => t.category === "Income" && !t.hidden).reduce((s, t) => s + t.amount, 0);
    total = `${money.format(earned)} income`;
  } else if (MOVE_CATEGORIES.includes($("#category-filter").value)) {
    const moved = visible.filter((t) => t.amount > 0 && !t.hidden).reduce((s, t) => s + t.amount, 0);
    total = `${money.format(moved)} moved`;
  } else {
    const spent = visible.filter((t) => t.spending).reduce((s, t) => s + t.amount, 0);
    total = `${money.format(spent)} spent`;
  }
  $("#month-total").textContent = total;
  $("#txn-list").innerHTML = visible.map((t) => {
    const id = escapeHtml(t.transaction_id);
    const box = selecting ? `<input type="checkbox" data-pick="${id}" ${state.picked.has(t.transaction_id) ? "checked" : ""} aria-label="Select">` : "";
    const badge = txnBadge(t);
    const note = t.note ? `<span class="note">"${escapeHtml(t.note)}"</span>` : "";
    const tags = t.tags.map((tag) => `<span class="tag-chip">${escapeHtml(tag)}</span>`).join("");
    const bought = t.bought ? `<div class="bought">${escapeHtml(t.bought)}</div>` : "";
    return `
      <div class="row txn ${selecting ? "selecting" : ""}" data-open-txn="${id}">${box}${badge}
        <div><div class="name">${escapeHtml(t.name)}</div>${bought}
          <div class="sub">${longDate(t.date)}${t.pending ? " | Pending" : ""} ${categoryChip(t.category)} ${note}${tags}</div></div>
        ${amountCell(t)}</div>`;
  }).join("") || `<p class="empty">No transactions match.</p>`;
}

// ----- Detail panel for one transaction -----

function openDrawer(txn) {
  state.drawerTxn = txn;
  state.ruleOfferFor = null;
  drawDrawer();
  $("#drawer").hidden = false;
  $("#drawer-backdrop").hidden = false;
}

function closeDrawer() {
  $("#drawer").hidden = true;
  $("#drawer-backdrop").hidden = true;
  state.drawerTxn = null;
}

function drawDrawer() {
  const t = state.drawerTxn;
  const names = new Set([...state.categories, t.category]);
  const categoryOptions = [...names].sort().map((c) =>
    `<option ${c === t.category ? "selected" : ""}>${escapeHtml(c)}</option>`).join("");
  const income = t.amount < 0;
  const otherTags = t.tags.filter((tag) => !["tax-deductible", "reimbursable"].includes(tag)).join(", ");
  $("#drawer").innerHTML = `
    <div class="head">
      <div class="head-main">${avatar(t.name)}<div><div class="name"><strong>${escapeHtml(t.name)}</strong></div>
        <div class="muted">${longDate(t.date)}${t.pending ? " | Pending" : ""}</div></div></div>
      <button class="icon-button" id="drawer-close" aria-label="Close">${icon("close")}</button>
    </div>
    <div class="amount-big ${income ? "good" : ""}">${income ? "+" : ""}${dollars.format(Math.abs(t.amount))}</div>
    <div class="facts">
      <span>${escapeHtml(niceName(t.account_name))}${t.account_mask ? " ••" + escapeHtml(t.account_mask) : ""}</span>
      <span>Bank description: ${escapeHtml(t.description)}</span>
      ${t.bought ? `<span>Amazon order: ${escapeHtml(t.bought)}</span>` : ""}
    </div>
    <div class="field"><label for="drawer-category">Category</label>
      <select id="drawer-category">${categoryOptions}<option value="__new__">New category…</option></select>
      <div class="muted" style="font-size:13px;margin-top:6px">Set by ${escapeHtml(t.category_source)}</div>
      <div id="drawer-offer"></div></div>
    <div class="field"><label for="drawer-name">Name</label>
      <input id="drawer-name" value="${escapeHtml(t.name_override || "")}" placeholder="${escapeHtml(t.merchant || t.description)}"></div>
    <div class="field"><label for="drawer-note">Note</label>
      <textarea id="drawer-note" placeholder="Add a note">${escapeHtml(t.note || "")}</textarea></div>
    <div class="field toggle-row"><div><strong>Hide from spending</strong>
      <div class="muted" style="font-size:14px">Keeps its category but leaves it out of totals.</div></div>
      <label class="switch"><input type="checkbox" id="drawer-hidden" ${t.hidden ? "checked" : ""}><span></span></label></div>
    <div class="field"><span class="label">Tags</span>
      <div class="check-row">
        <label><input type="checkbox" id="tag-tax" ${t.tags.includes("tax-deductible") ? "checked" : ""}> Tax deductible</label>
        <label><input type="checkbox" id="tag-reimb" ${t.tags.includes("reimbursable") ? "checked" : ""}> Reimbursable</label>
      </div>
      <input id="drawer-tags" value="${escapeHtml(otherTags)}" placeholder="Other tags, separated by commas" style="margin-top:10px"></div>
    <div class="actions"><button class="primary" id="drawer-save">Save</button><button class="secondary" id="drawer-cancel">Cancel</button></div>`;
}

function drawRuleOffer() {
  const offer = state.ruleOfferFor;
  $("#drawer-offer").innerHTML = offer ? `
    <div class="rule-offer">Always put stores matching
      <input id="rule-text" value="${escapeHtml(offer.matchText)}"> in <strong>${escapeHtml(offer.category)}</strong>?
      <div class="actions" style="margin-top:10px">
        <button class="primary small" data-rule="yes">Yes, make a rule</button>
        <button class="secondary small" data-rule="no">Just this one</button></div></div>` : "";
}

async function saveDrawer(makeRule = false) {
  const t = state.drawerTxn;
  const offer = state.ruleOfferFor;
  const picked = $("#drawer-category")?.value.trim();  // a dropdown pick, or a typed new name
  const changed = picked && picked !== "__new__" && picked !== t.category;
  const category = offer?.category || (changed ? picked : null);
  const matchText = $("#rule-text")?.value.trim() || offer?.matchText;
  state.ruleOfferFor = null;
  const tags = $("#drawer-tags").value.split(",").map((tag) => tag.trim()).filter(Boolean);
  if ($("#tag-tax").checked) tags.push("tax-deductible");
  if ($("#tag-reimb").checked) tags.push("reimbursable");
  const path = `/api/transactions/${encodeURIComponent(t.transaction_id)}`;
  try {
    await api(path, {
      method: "PATCH",
      body: { name_override: $("#drawer-name").value, note: $("#drawer-note").value, hidden: $("#drawer-hidden").checked, tags },
    });
    if (category) {
      await api(`${path}/category`, {
        method: "POST",
        body: { category, make_rule: makeRule, match_text: matchText },
      });
    }
    showBanner(makeRule ? `Rule added: ${matchText} -> ${category}` : "");
    closeDrawer();
    renderTransactions();
  } catch (error) {
    showBanner(error.message, true);
  }
}

// Trim card-processor prefixes ("SQ *", "TST*") and store numbers so one rule covers every visit.
function suggestedMatch(txn) {
  if (txn.merchant) return txn.merchant;
  const trimmed = txn.description
    .replace(/^(SQ|TST|SP|PAYPAL|PP)\s*\*\s*/i, "")
    .replace(/\s*#?\d[\d\s-]*$/, "")
    .trim();
  return trimmed || txn.description;
}

function offerRule(txn, category) {
  state.ruleOfferFor = { id: txn.transaction_id, category, matchText: suggestedMatch(txn) };
  drawRuleOffer();
}

// ----- Bulk edit -----

async function bulkAction(action) {
  const ids = [...state.picked];
  if (!ids.length) return showBanner("Pick some transactions first.", true);
  try {
    if (action === "hide" || action === "unhide") {
      await api("/api/transactions/bulk", { method: "POST", body: { ids, edit: { hidden: action === "hide" } } });
    } else {
      // Add one tag while keeping each transaction's other tags.
      await Promise.all(state.transactions.filter((t) => state.picked.has(t.transaction_id)).map((t) =>
        api(`/api/transactions/${encodeURIComponent(t.transaction_id)}`, {
          method: "PATCH", body: { tags: [...new Set([...t.tags, action])] },
        })));
    }
    showBanner(`Updated ${ids.length} transaction${ids.length === 1 ? "" : "s"}.`);
    state.picked.clear();
    renderTransactions();
  } catch (error) {
    showBanner(error.message, true);
  }
}

// ---------- Net worth ----------

const NET_WORTH_RANGES = { "1m": "1M", "3m": "3M", "6m": "6M", "1y": "1Y" };
// Non-breaking spaces keep each phrase together when it wraps.
const NET_WORTH_SPANS = { "1m": "past&nbsp;month", "3m": "past&nbsp;3&nbsp;mo.", "6m": "past&nbsp;6&nbsp;mo.", "1y": "past&nbsp;year" };
const ASSET_GROUPS = [["checking", "Checking", "bank"], ["savings", "Savings", "piggy"], ["investments", "Investments", "chart"]];
const DEBT_GROUPS = [["card", "Credit Cards", "card"], ["loan", "Loans", "bank"]];

function accountGroupList(groups, accounts, balances) {
  return groups.map(([key, label, iconName]) => {
    const members = accounts.filter((a) => a.group === key);
    if (!members.length) return "";
    const open = state.openGroups.has(key);
    let children = "";
    if (open) children = members.map((a) => `<div class="row child"><div><div class="name">${escapeHtml(niceName(a.name))}</div>
        <div class="sub">${escapeHtml(bankName(a.institution))}${a.mask ? ` ••${escapeHtml(a.mask)}` : ""}</div></div>
        <div class="amount">${dollars.format(a.current_balance ?? 0)}</div></div>`).join("");
    return `<button class="row ${open ? "open" : ""}" data-group="${key}"><span class="bubble">${icon(iconName)}</span><div class="name">${label}</div>
        <div class="amount">${wholeDollars.format(balances[key])}<span class="chevron">${icon("chevron-down")}</span></div></button>
      ${children}`;
  }).join("") || `<p class="empty">Nothing here.</p>`;
}

async function renderNetWorth() {
  const data = await api(withOwner(`/api/net-worth?range=${state.netRange}`));
  const b = data.balances;
  const values = data.history.map((p) => p.value);
  const change = b.net_worth - values[0];
  const step = Math.max(1, Math.round(values.length / 45));  // fewer points, smoother line
  $("#net-worth-detail").innerHTML = `
    <div class="top">
      <div class="label">Net Worth</div>
      <div class="big">${wholeDollars.format(b.net_worth)}</div>
      ${deltaLine(change, `${wholeDollars.format(Math.abs(change))} ${NET_WORTH_SPANS[state.netRange]}`)}
    </div>
    ${lineChart([{ values: thin(values, step) }])}
    <div class="foot static">${longDay(data.history[0].date)} <span class="chevron">${longDay(data.history.at(-1).date)}</span></div>`;
  $("#assets-total").textContent = wholeDollars.format(b.checking + b.savings + b.investments);
  $("#debts-total").textContent = wholeDollars.format(b.owed);
  $("#assets-list").innerHTML = accountGroupList(ASSET_GROUPS, data.accounts, b);
  $("#debts-list").innerHTML = accountGroupList(DEBT_GROUPS, data.accounts, b);
}

// ---------- Investments ----------

const HOLDING_COLORS = ["#3c7fc0", "#5b5fe0", "#0b9ea1", "#cf3468", "#c08a06", "#e2741a", "#12a174", "#a855f7"];

// Plaid lists each account's position separately and counts cash (CUR:USD) as a holding.
// Add each stock up across accounts and leave cash to the account balance.
function combineHoldings(rows) {
  const byStock = new Map();
  for (const h of rows) {
    if ((h.ticker || "").startsWith("CUR:")) continue;
    const key = h.ticker || h.name;
    const seen = byStock.get(key);
    if (!seen) {
      byStock.set(key, { ...h, accounts: 1 });
      continue;
    }
    seen.quantity = (seen.quantity || 0) + (h.quantity || 0);
    seen.value = (seen.value || 0) + (h.value || 0);
    seen.cost_basis = seen.cost_basis == null || h.cost_basis == null ? null : seen.cost_basis + h.cost_basis;
    seen.accounts += 1;
  }
  return [...byStock.values()].sort((x, y) => (y.value || 0) - (x.value || 0));
}

async function renderInvestments() {
  const [rows, accounts] = await Promise.all([api(withOwner("/api/holdings")), api(withOwner("/api/accounts"))]);
  const holdings = combineHoldings(rows);
  const invested = holdings.reduce((sum, h) => sum + (h.value || 0), 0);
  const balance = accounts.accounts.filter((a) => a.group === "investments" && !a.hidden && (!state.owner || String(a.owner_id) === state.owner)).reduce((s, a) => s + (a.current_balance || 0), 0);
  // What's left of the balance is cash; below zero it's money borrowed on margin.
  const leftover = balance - invested;
  const cash = leftover > 1 ? leftover : 0;
  const borrowed = leftover < -1 ? -leftover : 0;
  const total = invested + cash;
  const top = holdings.slice(0, 8).map((h, i) => ({ ...h, color: HOLDING_COLORS[i] }));
  const rest = holdings.slice(8).reduce((s, h) => s + (h.value || 0), 0);
  const slices = top.map((h) => ({ value: h.value || 0, color: h.color }));
  if (rest > 0) slices.push({ value: rest, color: "#b8b8c0" });
  if (cash > 0) slices.push({ value: cash, color: "#12a174" });
  function legendRow(color, label, value) {
    return `
      <div class="row"><span class="swatch" style="background:${color}"></span>
        <div class="name">${escapeHtml(label)}</div>
        <div class="amount"><span class="muted">${wholeDollars.format(value)}</span>${((value / total) * 100).toFixed(1)}%</div></div>`;
  }
  const legend = top.map((h) => legendRow(h.color, h.ticker || h.name, h.value)).join("") + (rest > 0 ? legendRow("#b8b8c0", "Other", rest) : "") + (cash > 0 ? legendRow("#12a174", "Cash", cash) : "") +
    (borrowed > 0 ? `<div class="row"><span class="swatch" style="background:var(--bad)"></span><div class="name">Borrowed on margin</div>
      <div class="amount"><span class="muted">-${wholeDollars.format(borrowed)}</span></div></div>` : "");

  $("#allocation").innerHTML = total > 0 ? `
    <h3>Allocation</h3>
    <div class="allocation-body">
    <div class="donut-wrap">${donut(slices, "Total value", "all accounts", wholeDollars.format(total))}</div>
    <div class="legend-list">${legend}</div></div>`
    : `<h3>Allocation</h3><p class="muted">Link an investment account to see your holdings.</p>`;

  $("#holdings-list").innerHTML = holdings.map((h, i) => {
    const gain = h.cost_basis != null ? h.value - h.cost_basis : null;
    const gainLine = gain == null ? "" :
      `<div class="sub right ${gain >= 0 ? "good" : "error-text"}">${gain >= 0 ? "+" : "-"}${dollars.format(Math.abs(gain))}</div>`;
    const color = HOLDING_COLORS[i] || "#8a8a90";
    return `<div class="row"><span class="bubble letter" style="background:${color}">${escapeHtml((h.ticker || h.name || "?").charAt(0))}</span>
      <div><div class="name">${escapeHtml(h.ticker || h.name)}</div>
        <div class="sub">${(h.quantity ?? 0).toLocaleString()} shares at ${dollars.format(h.price ?? 0)}${h.accounts > 1 ? ` · ${h.accounts} accounts` : ""}${h.ticker ? `<span class="fund-name"> · ${escapeHtml(h.name)}</span>` : ""}</div></div>
      <div><div class="amount">${dollars.format(h.value ?? 0)}</div>${gainLine}</div></div>`;
  }).join("") || `<p class="empty">No holdings yet.</p>`;
}

// ---------- Accounts and people ----------

async function loadOwners() {
  const data = await api("/api/accounts");
  state.owners = data.owners;
  state.demo = data.demo;
  const select = $("#owner");
  select.hidden = data.owners.length < 2;
  select.innerHTML = `<option value="">Everyone</option>` +
    data.owners.map((o) => `<option value="${escapeHtml(o.id)}">${escapeHtml(o.name)}</option>`).join("");
  select.value = state.owner;
  for (const button of document.querySelectorAll("[data-link]")) {
    button.disabled = data.demo;
    button.title = data.demo ? "Linking is off with sample data" : "";
  }
  document.title = data.demo ? "Money (demo)" : "Money";
  $("#brand-name").textContent = data.demo ? "Money · demo" : "Money";
  $("#updated").textContent = data.demo ? "Sample data" : data.last_synced ? `Updated ${timeAgo(data.last_synced)}` : "Not synced yet";
  return data;
}

const GROUP_ICONS = { checking: "bank", savings: "piggy", card: "card", investments: "chart", loan: "bank" };
const ACCOUNT_SECTIONS = [["checking", "Checking"], ["savings", "Savings"], ["card", "Credit cards"], ["investments", "Investments"], ["loan", "Loans"]];

// Banks often send names in all caps. Keep short codes like "IRA" or "HSA" as they are.
function niceName(name) {
  // Some banks send broken symbols (Wells Fargo's "PLATINUM\uFFFD\uFFFD CARD ...8709") and the last digits, which we show already.
  name = (name || "").replace(/[\uFFFD\u00AE\u2122]/g, "").replace(/\s*\.{2,}\d+$/, "").replace(/\s+/g, " ").trim();
  if (!name || name !== name.toUpperCase()) return name;
  return name.toLowerCase().replace(/\b[a-z]+/g, (word) =>
    word.length <= 3 && !["fee", "no", "the", "and"].includes(word) ? word.toUpperCase() : word[0].toUpperCase() + word.slice(1));
}

function bankName(institution) {
  return (institution || "").split(" - ")[0];
}

async function renderAccounts() {
  const data = await loadOwners();
  const ownerOptions = (selected) => data.owners.map((o) =>
    `<option value="${escapeHtml(o.id)}" ${o.id === selected ? "selected" : ""}>${escapeHtml(o.name)}</option>`).join("");
  // Each account has a switch. Off leaves it out of every total, chart and list, but keeps it linked.
  const row = (a) => `<div class="row account-row ${a.hidden ? "off" : ""}"><span class="bubble">${icon(GROUP_ICONS[a.group] || "bank")}</span>
      <div><div class="name">${escapeHtml(niceName(a.name))}</div>
        <div class="sub">${a.hidden ? "Not counted · " : ""}${escapeHtml(bankName(a.institution))}${a.mask ? ` ••${escapeHtml(a.mask)}` : ""}${a.last_error ? ` · <span class="error-text">${escapeHtml(a.last_error)}</span>` : ""}
          ${data.owners.length > 1 ? `· <select class="inline-select owner-chip" data-account="${escapeHtml(a.account_id)}" aria-label="Owner">${ownerOptions(a.owner_id)}</select>` : ""}</div></div>
      <div class="amount">${a.current_balance === null ? `<span class="muted">Balance unknown</span>` : wholeDollars.format(a.current_balance)}</div>
      <label class="switch" title="${a.hidden ? "Turn on to count this account" : "Turn off to leave this account out"}">
        <input type="checkbox" data-account-toggle="${escapeHtml(a.account_id)}" ${a.hidden ? "" : "checked"} aria-label="Count ${escapeHtml(niceName(a.name))}"><span></span></label></div>`;
  const asks = data.needs_holdings.map((item) => `<div class="row account-row"><span class="bubble">${icon("investments")}</span>
      <div><div class="name">See your ${escapeHtml(bankName(item.institution))} stocks</div>
        <div class="sub">It was linked without permission to share holdings. Reconnecting doesn't use up a link.</div></div>
      <button class="primary small" data-allow-holdings="${escapeHtml(item.item_id)}">Allow</button></div>`).join("");
  $("#accounts-list").innerHTML = asks + ACCOUNT_SECTIONS.map(([group, label]) => {
    const members = data.accounts.filter((a) => a.group === group);
    if (!members.length) return "";
    const counted = members.filter((a) => !a.hidden);
    const total = counted.reduce((s, a) => s + (a.current_balance || 0), 0);
    const owed = (group === "card" || group === "loan") && counted.length;
    const summary = !counted.length ? "Off" : `${owed ? "Owed " : ""}${wholeDollars.format(total)}`;
    return `<div class="group-head"><span>${label}</span><span class="${owed ? "owed" : ""}">${summary}</span></div>
      ${members.map(row).join("")}`;
  }).join("") || `<p class="empty">No accounts yet. Use the button above to link one.</p>`;
  $("#owners-list").innerHTML = data.owners.map((o) => `<span>${escapeHtml(o.name)}</span>`).join("");
}

function loadPlaid() {
  if (window.Plaid) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Couldn't load Plaid. Check your internet connection."));
    document.head.append(script);
  });
}

// With an itemId, reconnects that bank to ask for more (its holdings) instead of adding a new one.
async function linkAccount(kind, itemId) {
  try {
    const { link_token } = await api("/api/link-token", { method: "POST", body: itemId ? { kind, item_id: itemId } : { kind } });
    await loadPlaid();
    const handler = Plaid.create({
      token: link_token,
      onSuccess: async (publicToken, metadata) => {
        showBanner("Linked. Pulling your data, this can take a minute…");
        if (itemId) {
          try {
            reportSync((await api("/api/relink-done", { method: "POST", body: {} })).results);
          } catch (error) {
            showBanner(error.message, true);
          }
          return render();
        }
        try {
          const result = await api("/api/link-done", {
            method: "POST",
            body: { public_token: publicToken, institution: metadata.institution?.name, kind },
          });
          reportSync(result.results);
          if (kind === "banking") showBanner("Linked. Plaid can take a few minutes to fetch your history. Press Sync again shortly if transactions are missing.");
        } catch (error) {
          showBanner(error.message, true);
        }
        render();
      },
      onExit: (error) => { if (error) showBanner(error.display_message || error.error_message, true); },
    });
    handler.open();
  } catch (error) {
    showBanner(error.message, true);
  }
}

function reportSync(results) {
  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    showBanner(failed.map((r) => `${r.institution}: ${r.error}`).join(" · "), true);
  } else {
    showBanner(results.length ? `Synced ${results.length} connection(s).` : "Nothing to sync yet.");
  }
}

// ---------- Rules ----------

async function renderRules() {
  const [data, categories] = await Promise.all([api("/api/rules"), api("/api/categories")]);
  state.rules = data.rules;
  $("#rules-text").value = data.text;
  $("#rules-status").textContent = data.errors.join(" ");
  const condition = (r) => r.op ? `${r.op === ">" ? "Over" : "Under"} ${wholeDollars.format(r.amount)}` : "";
  $("#rules-list").innerHTML = data.rules.map((r, i) => `
    <div class="row rule-row">${categoryBubble(r.category)}
      <div><div class="name"><span class="rule-match">${escapeHtml(r.text)}</span>
        <span class="arrow">→</span>${escapeHtml(r.category)}</div>
        <div class="sub">${escapeHtml(condition(r))}${r.op ? " · " : ""}Rule ${i + 1}${i === 0 ? " · checked first" : ""}</div></div>
      <button class="delete" data-delete-rule="${i}" aria-label="Delete rule">${icon("close")}</button></div>`).join("") +
    `<form class="add-rule" id="add-rule-form">
      <strong>Add a rule</strong>
      <input id="new-rule-text" placeholder="Store name contains…" required>
      <input id="new-rule-category" list="rule-categories" placeholder="Category" required>
      <datalist id="rule-categories">${categories.map((c) => `<option value="${escapeHtml(c)}">`).join("")}</datalist>
      <button class="primary small" type="submit">Add</button></form>`;
}

// ---------- Wiring ----------

async function render() {
  const inMore = ["investments", "accounts", "rules"].includes(state.tab);
  const navTab = state.tab === "networth" ? "dashboard" : state.tab;  // Net Worth opens from the dashboard
  document.querySelectorAll("nav button").forEach((b) =>
    b.classList.toggle("active", b.dataset.tab === navTab || (b.id === "more-button" && inMore)));
  document.querySelectorAll("main section").forEach((s) => { s.hidden = s.id !== state.tab; });
  renderHero();
  const renderers = {
    dashboard: renderDashboard,
    recurring: renderRecurring,
    spending: renderSpending,
    transactions: renderTransactions,
    investments: renderInvestments,
    accounts: renderAccounts,
    rules: renderRules,
    networth: renderNetWorth,
  };
  try {
    await renderers[state.tab]();
  } catch (error) {
    showBanner(error.message, true);
  }
}

// Each tab change is a browser history step, so Back returns to the tab you came from,
// scrolled to where you left it.
const scrollPositions = {};
history.scrollRestoration = "manual";

async function goTo(tab, { fromHistory = false } = {}) {
  scrollPositions[state.tab] = window.scrollY;
  if (fromHistory || tab === state.tab) history.replaceState(null, "", `#${tab}`);
  else history.pushState(null, "", `#${tab}`);
  state.tab = tab;
  showBanner("");
  window.scrollTo(0, 0);
  await render();
  if (fromHistory) window.scrollTo(0, scrollPositions[tab] || 0);
}

// Going to a tab directly drops any filter left over from a click on Spending.
function clearTransactionFilters() {
  state.filter = null;
  state.range = null;
  $("#category-filter").value = "";
  $("#needs-sorting").checked = false;
}

// Phone tab bar: Investments, Accounts and Rules live under "More", like Rocket Money.
function toggleMoreMenu(open) {
  $("#more-menu").hidden = !open;
  $("#more-button").setAttribute("aria-expanded", String(open));
}

for (const menu of [document.querySelector("nav"), $("#more-menu")]) {
  menu.addEventListener("click", (event) => {
    if (event.target.closest("#more-button")) return toggleMoreMenu($("#more-menu").hidden);
    const button = event.target.closest("[data-tab]");
    if (!button) return;
    toggleMoreMenu(false);
    clearTransactionFilters();
    goTo(button.dataset.tab);
  });
}

$("#owner").addEventListener("change", (event) => { state.owner = event.target.value; render(); });

$("#sync").addEventListener("click", async () => {
  showBanner("Syncing…");
  try {
    reportSync((await api("/api/sync", { method: "POST" })).results);
  } catch (error) {
    showBanner(error.message, true);
  }
  await loadOwners();
  render();
});

$("#attention").addEventListener("click", () => goTo("accounts"));

$(".hero-cards").addEventListener("scroll", (event) => {
  const strip = event.target;
  const index = Math.round(strip.scrollLeft / (strip.scrollWidth / 3));
  document.querySelectorAll("#carousel-dots i").forEach((dot, i) => dot.classList.toggle("on", i === index));
}, { passive: true });

// Jump to the Transactions tab with filters already set. Without a month, it shows the
// exact dates picked on the Spending tab (a week, month, quarter or year).
async function openTransactions({ month, category = "", search = "", unsorted = false, filter = null }) {
  state.filter = filter;
  if (month) {
    state.month = month;
    state.range = null;
  } else if (state.lastSpending) {
    const { start, end, title } = state.lastSpending;
    state.range = { since: start, until: end, label: title };
    state.month = start.slice(0, 7);
  }
  state.selecting = false;
  $("#needs-sorting").checked = unsorted;
  $("#category-filter").value = "";
  if ($("#search")) $("#search").value = search;
  await goTo("transactions");
  $("#search").value = search;
  if (search || filter) await renderTransactions();
  const select = $("#category-filter");
  if (category && ![...select.options].some((o) => o.value === category)) select.add(new Option(category));
  select.value = category;
  drawTransactionList();
}

// Clicks on rows and buttons that are drawn on the fly, handled in one place.
document.addEventListener("click", (event) => {
  const target = event.target.closest(
    "[data-pick], [data-open-txn], [data-goto], [data-net-range], [data-group], [data-recurring], [data-period], [data-offset], [data-breakdown], " +
    "[data-category], [data-show-txn], [data-goto-income], [data-goto-spend], [data-rule], [data-bulk], [data-delete-rule], [data-remove-budget], " +
    "[data-recurring-menu], [data-ignore-recurring], [data-unignore-recurring], [data-delete-manual], [data-add-recurring], " +
    "[data-open-budget], [data-close-notice], [data-show-filters], #drawer-close, #drawer-cancel, #drawer-save, #drawer-backdrop");
  if (!target) return;
  const d = target.dataset;
  if (d.closeNotice !== undefined) {
    state.refundNoticeClosed = true;
    target.closest(".notice").remove();
  } else if (d.showFilters !== undefined) {
    $("#category-filter").focus();
    $("#category-filter").scrollIntoView({ block: "center", behavior: "smooth" });
  } else if (d.openBudget !== undefined) {
    target.hidden = true;
    $("#budget-setup").hidden = false;
    $("#budget-amount").focus();
  } else if (target.id === "drawer-close" || target.id === "drawer-cancel" || target.id === "drawer-backdrop") {
    closeDrawer();
  } else if (target.id === "drawer-save") {
    saveDrawer();
  } else if (d.pick) {
    target.checked ? state.picked.add(d.pick) : state.picked.delete(d.pick);
    $("#bulk-count").textContent = `${state.picked.size} selected`;
  } else if (d.openTxn) {
    const txn = state.transactions.find((t) => t.transaction_id === d.openTxn);
    if (!state.selecting) return openDrawer(txn);
    // In select mode a click anywhere on the row ticks its box.
    const box = target.querySelector("[data-pick]");
    box.checked = !box.checked;
    box.checked ? state.picked.add(d.openTxn) : state.picked.delete(d.openTxn);
    $("#bulk-count").textContent = `${state.picked.size} selected`;
  } else if (d.goto) {
    if (d.payday) { saveSetting("paydayView", "1"); state.recurringView = "upcoming"; }
    clearTransactionFilters();
    goTo(d.goto);
  } else if (d.group) {
    state.openGroups.has(d.group) ? state.openGroups.delete(d.group) : state.openGroups.add(d.group);
    state.tab === "networth" ? renderNetWorth() : renderDashboard();
  } else if (d.recurring) {
    state.recurringView = d.recurring;
    render();
  } else if (d.netRange) {
    state.netRange = d.netRange;
    render();
  } else if (d.period) {
    state.period = d.period;
    state.periodOffset = 0;
    renderSpending();
  } else if (d.offset !== undefined) {
    state.periodOffset = Number(d.offset);
    renderSpending();
  } else if (d.breakdown) {
    state.breakdown = d.breakdown;
    renderSpending();
  } else if (d.rule) {
    saveDrawer(d.rule === "yes");
  } else if (d.bulk) {
    bulkAction(d.bulk);
  } else if (d.recurringMenu) {
    state.recurringMenu = state.recurringMenu === d.recurringMenu ? null : d.recurringMenu;
    renderRecurring();
  } else if (d.ignoreRecurring || d.unignoreRecurring) {
    state.recurringMenu = null;
    api("/api/recurring/ignore", { method: "POST", body: { key: d.ignoreRecurring || d.unignoreRecurring, ignored: !!d.ignoreRecurring } })
      .then(renderRecurring);
  } else if (d.deleteManual) {
    state.recurringMenu = null;
    api(`/api/recurring/manual/${encodeURIComponent(d.deleteManual)}/delete`, { method: "POST" }).then(renderRecurring);
  } else if (d.addRecurring) {
    state.addingRecurring = d.addRecurring === "open";
    renderAddRecurring();
  } else if (d.removeBudget) {
    api("/api/budget/category", { method: "PUT", body: { category: d.removeBudget, amount: null } }).then(renderSpending);
  } else if (d.deleteRule !== undefined) {
    deleteRule(state.rules[Number(d.deleteRule)]);
  } else if (d.showTxn) {
    openTransactions({ month: d.month, unsorted: Boolean(d.unsorted) }).then(() => {
      const txn = state.transactions.find((t) => t.transaction_id === d.showTxn);
      if (txn) openDrawer(txn);
    });
  } else if (d.gotoIncome) {
    openTransactions({ category: "Income" });
  } else if (d.gotoSpend) {
    openTransactions({});
  } else if (d.category !== undefined) {
    openTransactions({ month: d.month, category: d.category, search: d.search, filter: d.filter ? { kind: d.filter, value: d.value } : null });
  }
});

async function deleteRule(rule) {
  try {
    await api("/api/rules/delete", { method: "POST", body: { line: rule.line, expected: rule.raw } });
    showBanner(`Rule removed: ${rule.raw}`);
  } catch (error) {
    showBanner(error.message, true);
  }
  renderRules();
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.drawerTxn) closeDrawer();
});

document.addEventListener("change", (event) => {
  const id = event.target.id;
  if (id === "payday-toggle") {
    saveSetting("paydayView", event.target.checked ? "1" : "0");
    renderRecurring();
  } else if (id === "bills-toggle") {
    state.includeBills = event.target.checked;
    renderSpending();
  } else if (id === "drawer-category") {
    const select = event.target;
    if (select.tagName === "INPUT") return;  // a typed new name is read when you press Save
    if (select.value === state.drawerTxn.category) {
      // Picking the current category again would pin it and stop rules from applying.
      state.ruleOfferFor = null;
      return drawRuleOffer();
    }
    if (select.value !== "__new__") return offerRule(state.drawerTxn, select.value);
    // Swap the dropdown for a text box so the new name can be typed in place.
    const input = document.createElement("input");
    input.id = "drawer-category";
    input.placeholder = "New category";
    state.ruleOfferFor = null;
    drawRuleOffer();
    select.replaceWith(input);
    input.focus();
    input.addEventListener("keydown", (keyEvent) => {
      if (keyEvent.key === "Enter" && input.value.trim()) offerRule(state.drawerTxn, input.value.trim());
    });
  } else if (id === "bulk-category" && event.target.value) {
    setBulkCategory(event.target.value);
  }
});

async function setBulkCategory(category) {
  const ids = [...state.picked];
  if (!ids.length) return showBanner("Pick some transactions first.", true);
  try {
    await api("/api/transactions/bulk", { method: "POST", body: { ids, category } });
    showBanner(`Moved ${ids.length} to ${category}.`);
    state.picked.clear();
    renderTransactions();
  } catch (error) {
    showBanner(error.message, true);
  }
}

document.addEventListener("submit", async (event) => {
  const form = event.target.id;
  if (!["budget-form", "add-rule-form", "category-budget-form", "recurring-form"].includes(form)) return;
  event.preventDefault();
  try {
    if (form === "budget-form") {
      await api("/api/budget", { method: "PUT", body: { amount: $("#budget-amount").value } });
      renderSpending();
    } else if (form === "recurring-form") {
      await api("/api/recurring/manual", { method: "POST", body: {
        name: $("#rec-name").value, kind: $("#rec-kind").value, amount: $("#rec-amount").value,
        frequency: $("#rec-frequency").value, next_date: $("#rec-date").value,
      } });
      state.addingRecurring = false;
      renderRecurring();
    } else if (form === "category-budget-form") {
      await api("/api/budget/category", { method: "PUT", body: { category: $("#budget-category").value, amount: $("#budget-category-amount").value } });
      renderSpending();
    } else {
      await api("/api/rules/add", { method: "POST", body: { text: $("#new-rule-text").value, category: $("#new-rule-category").value } });
      renderRules();
    }
  } catch (error) {
    showBanner(error.message, true);
  }
});

// Search runs on the server across all history; wait for a pause in typing.
let searchTimer;
$("#hero-extra").addEventListener("input", (event) => {
  if (event.target.id !== "search") return;
  state.filter = null;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(renderTransactions, 250);
});

function shiftMonth(delta) {
  if (state.range) {
    // Prev: the month before the range. Next: the month after it, but never past this month.
    const [year, number] = state.range[delta < 0 ? "since" : "until"].split("-").map(Number);
    const month = localDate(new Date(year, number - 1 + (delta < 0 ? -1 : 0), 1)).slice(0, 7);
    const thisMonth = localDate().slice(0, 7);
    state.month = month > thisMonth ? thisMonth : month;
  } else {
    const [year, number] = state.month.split("-").map(Number);
    const month = localDate(new Date(year, number - 1 + delta, 1)).slice(0, 7);
    const thisMonth = localDate().slice(0, 7);
    state.month = month > thisMonth ? thisMonth : month;
  }
  state.range = null;
  state.filter = null;
  if ($("#search")) $("#search").value = "";
  renderTransactions();
}

$("#prev-month").addEventListener("click", () => shiftMonth(-1));
$("#next-month").addEventListener("click", () => shiftMonth(1));
$("#category-filter").addEventListener("change", drawTransactionList);
$("#needs-sorting").addEventListener("change", drawTransactionList);
$("#select-mode").addEventListener("click", () => {
  state.selecting = !state.selecting;
  state.picked.clear();
  drawTransactionList();
});

$("#accounts-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-allow-holdings]");
  if (button) linkAccount("banking", button.dataset.allowHoldings);
});

$("#accounts-list").addEventListener("change", async (event) => {
  const toggle = event.target.closest("[data-account-toggle]");
  if (toggle) {
    try {
      await api(`/api/accounts/${encodeURIComponent(toggle.dataset.accountToggle)}/hidden`, { method: "POST", body: { hidden: !toggle.checked } });
      showBanner(toggle.checked ? "Account turned on. It counts in your totals again." : "Account turned off. It's left out of every total.");
    } catch (error) {
      showBanner(error.message, true);
    }
    return renderAccounts();
  }
  const select = event.target.closest("select[data-account]");
  if (!select) return;
  await api(`/api/accounts/${encodeURIComponent(select.dataset.account)}/owner`, { method: "POST", body: { owner_id: Number(select.value) } });
  showBanner("Owner updated.");
});

$("#add-owner").addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = $("#owner-name").value.trim();
  if (!name) return;
  await api("/api/owners", { method: "POST", body: { name } });
  $("#owner-name").value = "";
  renderAccounts();
});

$("#hero-extra").addEventListener("click", (event) => {
  const button = event.target.closest("[data-link]");
  if (button && !button.disabled) linkAccount(button.dataset.link);
});

$("#save-rules").addEventListener("click", async () => {
  try {
    await api("/api/rules", { method: "PUT", body: { text: $("#rules-text").value } });
    $("#rules-status").textContent = "Saved. Every transaction is re-sorted with the new rules.";
    $("#rules-status").className = "muted";
    renderRules();
  } catch (error) {
    $("#rules-status").textContent = error.message;
    $("#rules-status").className = "error-text";
  }
});

// Open the tab named in the address (e.g. #spending), so a reload stays put.
const startTab = location.hash.slice(1);
if (document.getElementById(startTab)?.tagName === "SECTION") state.tab = startTab;
window.addEventListener("hashchange", () => {
  const tab = location.hash.slice(1);
  if (tab !== state.tab && document.getElementById(tab)?.tagName === "SECTION") goTo(tab, { fromHistory: true });
});

fillIcons();
loadOwners().then(render);
