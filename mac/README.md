# Money dashboard

A private, Rocket-Money-style dashboard that runs only on this Mac.

- **Open it:** double-click `Open Money.command` (or `python3 -m money`).
- **Try it with fake data:** double-click `Open Money (demo).command`.
- **Tests:** `python3 -m unittest discover -s tests -t .`

## Where things live

| What | Where |
|---|---|
| Plaid keys and bank access tokens | macOS Keychain, service `money-dashboard` |
| Your transactions | `~/.money-dashboard/money.db` (outside any repo) |
| Your sorting rules | `~/.money-dashboard/rules.txt` (plain text, also editable in the Rules tab) |
| Demo data and rules | `~/.money-dashboard/demo-money.db`, `demo-rules.txt` |

No Python packages to install: standard library only.

## How a transaction gets its category

1. A category you picked by hand for that one transaction.
2. The first matching line in `rules.txt`.
3. Plaid's own guess, renamed into plain words (`money/rules.py`).

`Transfer` and `Income` never count as spending. Credit card payments and
account-to-account moves default to `Transfer`, so money isn't counted twice.

## Life Dashboard link

The dashboard's Finances page shows this app's numbers and sends edits back.

1. On the Finances page, press **Make a key** and run the command it shows (`python3 -m money --dashboard-key …`).
2. Run `python3 -m money` (or `Open Money.command`). While it runs it publishes every few minutes and after each change (`money/bridge.py`), and carries out edits made on the web page.
3. Apple Card comes from YNAB (`money/ynab.py`). Save a YNAB token once: `security add-generic-password -U -s money-dashboard -a ynab_token -w`, check with `python3 -m money --ynab-check`.
4. Exports dropped in iCloud Drive › Money Inbox (Apple Card CSV, Robinhood card CSV, Amazon zip) import on their own.

Linking a bank stays in this app's own page (http://127.0.0.1:8765).
