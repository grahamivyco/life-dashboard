"""Apple Card through YNAB. Apple lets YNAB's iPhone app read the card, and YNAB has an API,
so the card's purchases and balance can come in with no export. The YNAB token lives in the Keychain.

  Save the token:  security add-generic-password -U -s money-dashboard -a ynab_token -w
  Check it works:  python3 -m money --ynab-check
"""

import json
import sqlite3
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta

from . import importer, plaid_client

API = "https://api.ynab.com/v1"
ACCOUNT_ID = importer.APPLE_ACCOUNT  # the same "Apple Card" account the CSV import fills
PREFIX = "ynab-"


def token() -> str:
    return plaid_client.keychain_get("ynab_token")


def get(path: str) -> dict:
    request = urllib.request.Request(API + path, headers={"Authorization": f"Bearer {token()}"})
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.load(response)["data"]
    except urllib.error.HTTPError as error:
        raise ValueError(f"YNAB said {error.code}: {error.read().decode()[:200]}")


def apple_accounts(budget: str = "last-used") -> list[dict]:
    accounts = get(f"/budgets/{budget}/accounts")["accounts"]
    # "Apple Card", not "Apple Cash": the card is the credit account.
    return [a for a in accounts if not a["deleted"] and not a["closed"]
            and "apple" in a["name"].lower() and a["type"] == "creditCard"]


def check() -> None:
    """Print what YNAB has for Apple Card, without saving anything."""
    budgets = get("/budgets")["budgets"]
    print(f"YNAB budgets: {', '.join(b['name'] for b in budgets)}")
    for budget in budgets:
        for account in apple_accounts(budget["id"]):
            txns = get(f"/budgets/{budget['id']}/accounts/{account['id']}/transactions"
                       f"?since_date={(date.today() - timedelta(days=60)).isoformat()}")["transactions"]
            txns = [t for t in txns if not t["deleted"]]
            latest = max((t["date"] for t in txns), default="none")
            print(f"- {account['name']} in {budget['name']}: owes ${-account['balance'] / 1000:,.2f}, "
                  f"{len(txns)} transactions in the last 60 days, newest {latest}, "
                  f"{'linked to Apple' if account.get('direct_import_linked') else 'NOT linked (entered by hand)'}")
            for t in sorted(txns, key=lambda t: t["date"], reverse=True)[:5]:
                print(f"    {t['date']}  {(t['payee_name'] or '')[:30]:30}  ${-t['amount'] / 1000:,.2f}")
    if not any(apple_accounts(b["id"]) for b in budgets):
        print("No open account with 'Apple' in its name.")


def sync(conn: sqlite3.Connection) -> int:
    """Bring Apple Card's last two years from YNAB into the Apple Card account. Returns rows saved."""
    found = apple_accounts()
    if not found:
        return 0
    account = found[0]
    importer.import_apple_card(conn, [])  # makes the Apple Card account if it isn't there yet
    since = (date.today() - timedelta(days=730)).isoformat()
    txns = get(f"/budgets/last-used/accounts/{account['id']}/transactions?since_date={since}")["transactions"]
    known = importer.known_categories(conn, ACCOUNT_ID)
    saved = 0
    for t in txns:
        txn_id = PREFIX + t["id"]
        if t["deleted"]:
            conn.execute("DELETE FROM transactions WHERE transaction_id = ?", (txn_id,))
            continue
        amount = round(-t["amount"] / 1000, 2)  # YNAB: purchases are negative. Here: money out is positive
        payee = (t["payee_name"] or "").strip() or None
        if t.get("transfer_account_id") and amount < 0:
            category = importer.CARD_PAYMENT  # paying the card from checking
        else:
            category = known.get((payee or "").lower())
        conn.execute(
            """INSERT INTO transactions (transaction_id, account_id, date, description, merchant, amount, plaid_category, pending)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT (transaction_id) DO UPDATE SET date = excluded.date, description = excluded.description,
                 merchant = excluded.merchant, amount = excluded.amount, pending = excluded.pending""",
            (txn_id, ACCOUNT_ID, t["date"], payee or t.get("memo") or "Apple Card", payee, amount, category,
             0 if t["cleared"] in ("cleared", "reconciled") else 1))
        saved += 1
    # YNAB now covers the card, so drop rows a CSV import added for the same dates.
    conn.execute("DELETE FROM transactions WHERE account_id = ? AND transaction_id LIKE 'apple-%' AND date >= ?",
                 (ACCOUNT_ID, since))
    owed = round(-account["balance"] / 1000, 2)
    conn.execute("UPDATE accounts SET current_balance = ?, updated_at = ? WHERE account_id = ?",
                 (owed, datetime.now().isoformat(timespec="seconds"), ACCOUNT_ID))
    conn.execute("INSERT OR REPLACE INTO account_balances (account_id, date, balance) VALUES (?, ?, ?)",
                 (ACCOUNT_ID, date.today().isoformat(), owed))
    conn.commit()
    return saved
