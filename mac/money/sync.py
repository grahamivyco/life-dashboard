"""Pull fresh accounts, transactions and holdings from Plaid into the local database."""

import sqlite3
from datetime import date, datetime

from . import importer, plaid_client


def now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def add_item(conn: sqlite3.Connection, item_id: str, institution: str, kind: str) -> None:
    conn.execute(
        "INSERT OR IGNORE INTO items (item_id, institution, kind) VALUES (?, ?, ?)",
        (item_id, institution, kind),
    )
    conn.commit()


def sync_all(conn: sqlite3.Connection) -> list[dict]:
    results = []
    for item in conn.execute("SELECT * FROM items WHERE kind != 'file'").fetchall():  # files come in by hand
        try:
            sync_item(conn, item)
            conn.execute("UPDATE items SET last_synced = ?, last_error = NULL WHERE item_id = ?", (now(), item["item_id"]))
            results.append({"institution": item["institution"], "ok": True})
        except Exception as error:  # one broken bank shouldn't stop the others
            conn.rollback()
            conn.execute("UPDATE items SET last_error = ? WHERE item_id = ?", (str(error), item["item_id"]))
            results.append({"institution": item["institution"], "ok": False, "error": str(error)})
        conn.commit()
    return results


def sync_item(conn: sqlite3.Connection, item: sqlite3.Row) -> None:
    # Every Plaid call happens before the first write, so the database is never locked
    # while we wait on the network and your edits in the page don't stall.
    token = plaid_client.access_token(item["item_id"])
    accounts = plaid_client.call("/accounts/get", access_token=token)["accounts"]
    if item["kind"] == "investments":
        holdings = plaid_client.call("/investments/holdings/get", access_token=token)
        save_accounts(conn, item["item_id"], accounts)
        save_holdings(conn, holdings)
        return
    changes = fetch_with_retry(token, item["cursor"])
    holdings, holdings_error = None, None
    if any(account["type"] == "investment" for account in accounts):
        try:
            holdings = plaid_client.call("/investments/holdings/get", access_token=token)
        except plaid_client.PlaidError as error:
            holdings_error = error.code  # balances still come through either way
    save_accounts(conn, item["item_id"], accounts)
    save_transaction_changes(conn, item, *changes)
    if holdings:
        save_holdings(conn, holdings)
    # A slow first fetch or a network blip says nothing new, so keep the last reason.
    if holdings_error not in ("PRODUCT_NOT_READY", "NETWORK"):
        conn.execute("UPDATE items SET holdings_error = ? WHERE item_id = ?", (holdings_error, item["item_id"]))


def save_accounts(conn: sqlite3.Connection, item_id: str, accounts: list[dict]) -> None:
    first_owner = conn.execute("SELECT id FROM owners ORDER BY id LIMIT 1").fetchone()["id"]
    for account in accounts:
        balances = account["balances"]
        conn.execute(
            """INSERT INTO accounts (account_id, item_id, owner_id, name, mask, type, subtype,
                                     current_balance, available_balance, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(account_id) DO UPDATE SET
                 name = excluded.name, current_balance = excluded.current_balance,
                 available_balance = excluded.available_balance, updated_at = excluded.updated_at""",
            (account["account_id"], item_id, first_owner, account.get("official_name") or account["name"],
             account.get("mask"), account["type"], account.get("subtype"),
             balances.get("current"), balances.get("available"), now()),
        )
        if balances.get("current") is not None:
            # One balance per account per day, so the net worth chart can use real history.
            conn.execute(
                "INSERT OR REPLACE INTO account_balances (account_id, date, balance) VALUES (?, ?, ?)",
                (account["account_id"], date.today().isoformat(), balances["current"]),
            )


def fetch_with_retry(token: str, start_cursor: str | None):
    for attempt in range(3):
        try:
            return fetch_transaction_changes(token, start_cursor)
        except plaid_client.PlaidError as error:
            # Plaid asks us to restart the whole page run if data changed mid-way.
            if error.code != "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION" or attempt == 2:
                raise


def save_transaction_changes(conn: sqlite3.Connection, item: sqlite3.Row, added, modified, removed, cursor) -> None:
    for txn in added + modified:
        save_transaction(conn, txn)
        if txn.get("pending_transaction_id"):
            carry_edits(conn, txn["pending_transaction_id"], txn["transaction_id"])
    for txn in removed:
        conn.execute("DELETE FROM transactions WHERE transaction_id = ?", (txn["transaction_id"],))
    conn.execute("UPDATE items SET cursor = ? WHERE item_id = ?", (cursor, item["item_id"]))
    importer.drop_overlap(conn)


# Things you set by hand that should survive a pending charge turning into a posted one.
HAND_EDITS = ("category_override", "name_override", "note", "hidden", "tags")


def carry_edits(conn: sqlite3.Connection, pending_id: str, posted_id: str) -> None:
    """Plaid gives a posted charge a new id. Copy your edits over from the pending one."""
    old = conn.execute(f"SELECT {', '.join(HAND_EDITS)} FROM transactions WHERE transaction_id = ?",
                       (pending_id,)).fetchone()
    if not old:
        return
    assignments = ", ".join(f"{field} = COALESCE({field}, ?)" if field != "hidden" else "hidden = MAX(hidden, ?)"
                            for field in HAND_EDITS)
    conn.execute(f"UPDATE transactions SET {assignments} WHERE transaction_id = ?", (*old, posted_id))


def fetch_transaction_changes(token: str, cursor: str | None):
    added, modified, removed = [], [], []
    while True:
        payload = {"access_token": token, "count": 500}
        if cursor:
            payload["cursor"] = cursor
        page = plaid_client.call("/transactions/sync", **payload)
        added += page["added"]
        modified += page["modified"]
        removed += page["removed"]
        cursor = page["next_cursor"]
        if not page["has_more"]:
            return added, modified, removed, cursor


def save_transaction(conn: sqlite3.Connection, txn: dict) -> None:
    category = txn.get("personal_finance_category") or {}
    plaid_category = f"{category.get('primary', '')}/{category.get('detailed', '')}" if category else None
    # Keep any category you picked by hand when Plaid sends an update.
    conn.execute(
        """INSERT INTO transactions (transaction_id, account_id, date, description, merchant,
                                     amount, plaid_category, pending)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(transaction_id) DO UPDATE SET
             date = excluded.date, description = excluded.description, merchant = excluded.merchant,
             amount = excluded.amount, plaid_category = excluded.plaid_category, pending = excluded.pending""",
        (txn["transaction_id"], txn["account_id"], txn["date"], txn["name"], txn.get("merchant_name"),
         txn["amount"], plaid_category, int(txn.get("pending", False))),
    )


def save_holdings(conn: sqlite3.Connection, response: dict) -> None:
    securities = {s["security_id"]: s for s in response["securities"]}
    account_ids = [a["account_id"] for a in response["accounts"]]
    conn.executemany("DELETE FROM holdings WHERE account_id = ?", [(a,) for a in account_ids])
    for holding in response["holdings"]:
        security = securities.get(holding["security_id"], {})
        conn.execute(
            """INSERT INTO holdings (account_id, security_id, ticker, name, quantity, price, value, cost_basis)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (holding["account_id"], holding["security_id"], security.get("ticker_symbol"),
             security.get("name"), holding.get("quantity"), holding.get("institution_price"),
             holding.get("institution_value"), holding.get("cost_basis")),
        )
