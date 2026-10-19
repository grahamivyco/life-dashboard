"""Move the money app to the Life Dashboard's server, once.

    python3 -m money --move-to-cloud

Sends this Mac's database (accounts, two years of transactions, your edits, budgets, bills) and the
Plaid and YNAB keys from the Keychain to Supabase over the dashboard key. The keys land in Supabase's
encrypted Vault. After that the Finances page syncs your banks itself, so this Mac app can stay off.
"""

import json
import sqlite3
from pathlib import Path

from . import bridge, plaid_client

MOVED_FLAG = "moved_to_cloud"  # in the Keychain: once moved, this Mac stops publishing over the server's numbers


def rows(conn: sqlite3.Connection, sql: str) -> list[dict]:
    return [dict(row) for row in conn.execute(sql)]


def export_store(conn: sqlite3.Connection, rules_path: Path) -> dict:
    """The database as the server keeps it (supabase/functions/money/core.js)."""
    settings = {row["key"]: row["value"] for row in conn.execute("SELECT key, value FROM settings")}
    settings["rules"] = rules_path.read_text() if rules_path.exists() else ""
    return {
        "owners": rows(conn, "SELECT id, name FROM owners ORDER BY id"),
        "items": rows(conn, "SELECT * FROM items"),
        "accounts": rows(conn, "SELECT * FROM accounts"),
        "transactions": rows(conn, "SELECT * FROM transactions"),
        "holdings": rows(conn, "SELECT * FROM holdings"),
        "balances": rows(conn, "SELECT account_id, date, balance FROM account_balances"),
        "budgets": rows(conn, "SELECT category, amount FROM budgets"),
        "settings": settings,
        "recurring_ignored": [row["key"] for row in conn.execute("SELECT key FROM recurring_ignored")],
        "recurring_manual": rows(conn, "SELECT * FROM recurring_manual"),
        "amazon_orders": rows(conn, "SELECT * FROM amazon_orders"),
        "payment_plans": rows(conn, "SELECT * FROM payment_plans"),
    }


def secrets(conn: sqlite3.Connection) -> dict:
    """Plaid's keys, each linked bank's access token and the YNAB token, read from the Keychain."""
    found = {
        "plaid_client_id": plaid_client.keychain_get("plaid_client_id"),
        "plaid_secret": plaid_client.keychain_get("plaid_secret_production"),
    }
    for row in conn.execute("SELECT item_id FROM items WHERE kind != 'file'"):
        found[f"item:{row['item_id']}"] = plaid_client.access_token(row["item_id"])
    try:
        found["ynab_token"] = plaid_client.keychain_get("ynab_token")
    except plaid_client.PlaidError:
        pass  # no YNAB token: Apple Card stays as it is
    return found


def move(conn: sqlite3.Connection, rules_path: Path) -> None:
    key = bridge.dashboard_key()
    if not key:
        raise SystemExit("Link this Mac first: make a key on the Finances page, then run python3 -m money --dashboard-key KEY")
    store = json.loads(json.dumps(export_store(conn, rules_path), default=str))
    keys = secrets(conn)
    banks = sum(1 for name in keys if name.startswith("item:"))
    result = bridge.rpc("money_move_in", key, p_secrets=keys, p_store=store)
    plaid_client.keychain_set(MOVED_FLAG, "yes")
    print(f"Moved {len(store['transactions'])} transactions, {len(store['accounts'])} accounts and the keys for "
          f"{banks} bank link{'s' if banks != 1 else ''}{' and YNAB' if 'ynab_token' in keys else ''}.")
    print(f"Server says: {result}")
    print("Open Finances on any device: it syncs your banks itself now. You can stop this app (Ctrl+C) and leave it off.")


def moved() -> bool:
    try:
        return plaid_client.keychain_get(MOVED_FLAG) == "yes"
    except plaid_client.PlaidError:
        return False
