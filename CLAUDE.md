# Life Dashboard

Graham Ivy's personal app. Live at https://grahamivyco.github.io/life-dashboard/ (installable on iPhone and Mac).

## Stack
- React + Vite (plain JSX), HashRouter, deployed to GitHub Pages by `.github/workflows/deploy.yml` on every push to `main`
- Supabase project `wruevdyyhuizyydibzar` (eu-west-3). Email magic-link login. Every table is owner-only via RLS.
- Graham's user_id: `c2cbf3bf-95b2-4c27-bc60-c598543f4cfa`

## Working rules
- Commit and push straight to `main` after every change (Graham wants it automatic and immediate). Run `npm run build` first.
- Concise UI copy. No em-dash asides, no hype words.
- When Graham asks for a UI change or idea, include screenshots of what it looks like:
  `node scripts/screenshot.mjs <name> <route> [...]` builds with sample data (`--mode demo`, `src/demo.js`), saves desktop + phone PNGs to `public/previews/<name>/`, and prints their live URLs. Commit them so the URLs work. Never screenshot real data.

## Design (Open Frame, refined)
- Cream page `#F3F1EA`, surface `#FFFDF8`, ink `#2F2C27`, muted `#77736A`, hairline `#E4E0D5`
- Tomato `#F24333` is the only accent (active icon, badges, alerts). No colored fills or tinted cards.
- Fraunces for page titles and big numbers, Inter 13–14px for everything else
- Icon rail menu that expands to labels on hover / tap of the mark
- Tiles: 12px radius, 1px hairline, no shadows. Lists use collapsible rows with a chevron; delete/dismiss are icon buttons.

## Data
- `brain_dumps` → sorted by Claude into `items` (task/goal/idea/note) and `events`; set `processed_at`
- `items` insert trigger auto-queues tasks and ideas into `claude_requests`
- `claude_requests`: queued → working → needs_approval → approved → done/failed/dismissed. `links` is `[{title,url,image?}]`; `image: true` renders as a thumbnail on Today.
- Ask Claude (floating ✦ panel, `src/askClaude.js`): inserts a `claude_requests` row with `action='ask'`; the hourly worker answers in `result`. `supabase/functions/ask-claude` (instant replies via the Claude API) is deployed but unused, since Graham chose the queue.
- `section_snapshots`: latest payload per section (`email`, `finances`, …) written by the hourly sync

## Pages
Today (dump box, ✦ Claude tile, tasks, week, sync) · Inbox (Gmail snapshot) · Brain Dump · Goals & Ideas · Timeline · Finances · Jobs/Clients/Housing (link to old dashboards for now) · Events · Settings

## Roadmap
1. Web app shell ✓  2. Tauri Mac app  3. Brain dump flow ✓  4. Move in Jobs, Clients, Housing, Events + Google Calendar sync  5. Sync tasks, ⌘K search  6. Share pages with Ben
