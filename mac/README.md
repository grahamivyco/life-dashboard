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
