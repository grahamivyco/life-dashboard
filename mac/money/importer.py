"""Bring in card history Plaid can't reach, from the file the card's app exports.

- Apple Card only shares with approved iPhone apps, so Plaid never sees it. The Wallet app can
  export a CSV: Wallet > Apple Card > Card Balance > a statement > Export Transactions.
- Robinhood's card is linked through Plaid, but Plaid only hands over its last few weeks. The
  Robinhood app exports every transaction since the card opened. Without that history there's
  no way to tell a Robinhood card bill from a Robinhood deposit, since checking calls both
  "Robinhood". With it, every bill pairs with the card's own record of being paid.
- Amazon order history isn't card history, but it says what each Amazon charge bought. Amazon's
  "Request your data" zip has it in "Your Amazon Orders/Order History.csv". The zip or that file
  both work.
"""

import csv
import hashlib
import io
import sqlite3
import zipfile
from collections import Counter
from datetime import date, datetime, timedelta
from pathlib import Path

APPLE_COLUMNS = {"Transaction Date", "Description", "Merchant", "Category", "Amount (USD)"}
APPLE_ITEM = "file-apple-card"
APPLE_ACCOUNT = "file-apple-card"
ROBINHOOD_COLUMNS = {"Date", "Amount", "Status", "Type", "Merchant", "Description", "Points"}
AMAZON_COLUMNS = {"Order ID", "Order Date", "Total Amount", "Product Name", "Order Status"}
AMAZON_FILE = "Order History.csv"

CARD_PAYMENT = "LOAN_PAYMENTS/LOAN_PAYMENTS_CREDIT_CARD_PAYMENT"

# Apple's categories, written the way Plaid writes them so the usual sorting applies.
APPLE_CATEGORIES = {
    "Restaurants": "FOOD_AND_DRINK/FOOD_AND_DRINK_RESTAURANT",
    "Grocery": "FOOD_AND_DRINK/FOOD_AND_DRINK_GROCERIES",
    "Transportation": "TRANSPORTATION/TRANSPORTATION_OTHER_TRANSPORTATION",
    "Govt-services-parking": "TRANSPORTATION/TRANSPORTATION_PARKING",
    "Airlines": "TRAVEL/TRAVEL_FLIGHTS",
    "Hotels": "TRAVEL/TRAVEL_LODGING",
    "Car-rentals": "TRAVEL/TRAVEL_RENTAL_CARS",
    "Shopping": "GENERAL_MERCHANDISE/GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE",
    "Entertainment": "ENTERTAINMENT/ENTERTAINMENT_OTHER_ENTERTAINMENT",
    "Medical": "MEDICAL/MEDICAL_OTHER_MEDICAL",
    "Payment": CARD_PAYMENT,
}


def import_file(conn: sqlite3.Connection, path: Path) -> tuple[str, int]:
    """Work out which export this is and bring it in. Returns (source name, rows added)."""
    if zipfile.is_zipfile(path):
        with zipfile.ZipFile(path) as archive:
            inside = [name for name in archive.namelist() if name.endswith("/" + AMAZON_FILE)]
            if not inside:
                raise ValueError(f"That zip has no {AMAZON_FILE} in it")
            text = archive.read(inside[0]).decode("utf-8-sig")
    else:
        text = path.read_text(encoding="utf-8-sig")
    reader = csv.DictReader(io.StringIO(text, newline=""))
    columns = set(reader.fieldnames or [])
    rows = list(reader)
    if APPLE_COLUMNS <= columns:
        return "Apple Card", import_apple_card(conn, rows)
    if ROBINHOOD_COLUMNS <= columns:
        return "Robinhood card", import_robinhood_card(conn, rows)
    if AMAZON_COLUMNS <= columns:
        return "Amazon", import_amazon_orders(conn, rows)
    raise ValueError("That isn't an Apple Card, Robinhood card or Amazon order export")


def import_amazon_orders(conn: sqlite3.Connection, rows: list[dict]) -> int:
    """Save each order's total and what was in it. The file has one row per item, so the items of
    an order are added up. Importing again replaces the saved copy, so nothing doubles."""
    orders: dict[str, dict] = {}
    for row in rows:
        if row["Order Status"] == "Cancelled":
            continue
        ordered = date.fromisoformat(row["Order Date"][:10]).isoformat()  # a bad date fails here, not on every page load
        order = orders.setdefault(row["Order ID"], {"date": ordered, "total": 0.0, "items": []})
        order["total"] += dollars(row["Total Amount"])
        if row["Product Name"].strip():
            order["items"].append(row["Product Name"].strip())
    for order_id, order in orders.items():
        conn.execute("INSERT OR REPLACE INTO amazon_orders (order_id, date, total, items) VALUES (?, ?, ?, ?)",
                     (order_id, order["date"], round(order["total"], 2), " / ".join(order["items"])))
    conn.commit()
    return len(orders)


def import_apple_card(conn: sqlite3.Connection, rows: list[dict]) -> int:
    """Add the rows to an "Apple Card" account. Rows already brought in are skipped."""
    conn.execute("INSERT OR IGNORE INTO items (item_id, institution, kind) VALUES (?, 'Apple Card', 'file')",
                 (APPLE_ITEM,))
    first_owner = conn.execute("SELECT id FROM owners ORDER BY id LIMIT 1").fetchone()["id"]
    conn.execute("""INSERT OR IGNORE INTO accounts (account_id, item_id, owner_id, name, type, subtype)
                    VALUES (?, ?, ?, 'Apple Card', 'credit', 'credit card')""",
                 (APPLE_ACCOUNT, APPLE_ITEM, first_owner))
    known = known_categories(conn, APPLE_ACCOUNT)
    found = []
    for row in rows:
        day = datetime.strptime(row["Transaction Date"], "%m/%d/%Y").date().isoformat()
        merchant = row["Merchant"].strip() or None
        # "Other" is most of Apple's labels, so borrow your other cards' label for the store.
        category = APPLE_CATEGORIES.get(row["Category"]) or known.get((merchant or "").lower())
        found.append((day, row["Description"], merchant, dollars(row["Amount (USD)"]), category))
    return save(conn, APPLE_ACCOUNT, "apple-", found)


def import_robinhood_card(conn: sqlite3.Connection, rows: list[dict]) -> int:
    """Fill in the Robinhood card's history from before Plaid's copy starts. Rows Plaid
    already has are left to Plaid, so nothing shows up twice."""
    accounts = conn.execute("""SELECT a.account_id FROM accounts a JOIN items i USING (item_id)
                               WHERE a.type = 'credit' AND i.institution LIKE 'Robinhood%' AND i.kind != 'file'""").fetchall()
    if len(accounts) != 1:
        raise ValueError("Link Robinhood first, then import its card history" if not accounts
                         else "More than one Robinhood card is linked, so it's unclear which this file is for")
    account_id = accounts[0]["account_id"]
    plaid_starts = plaid_history_start(conn, account_id)
    if not plaid_starts:
        raise ValueError("Sync Robinhood first, so the import knows where Plaid's copy begins")
    posted = [row for row in rows if row["Status"] == "Posted"]  # pending and declined aren't real yet
    if posted and max(date.fromisoformat(row["Date"]) for row in posted) < date.fromisoformat(plaid_starts) - timedelta(days=7):
        raise ValueError("This export ends before Plaid's copy begins, so there'd be a gap. Export it again")
    # Plaid dates a charge when it posts and the file when you bought it, so a purchase made just
    # before Plaid's start can be in both. Skip those when Plaid has the same amount nearby.
    plaid_near_start = [(date.fromisoformat(day), amount) for day, amount in conn.execute(
        """SELECT date, amount FROM transactions WHERE account_id = ? AND transaction_id NOT LIKE 'rhcard-%'
           AND date <= date(?, '+5 days')""", (account_id, plaid_starts))]
    known = known_categories(conn, None)
    found = []
    for row in posted:
        bought = date.fromisoformat(row["Date"])
        if row["Date"] >= plaid_starts or any(
                amount == dollars(row["Amount"]) and 0 <= (day - bought).days <= 5 for day, amount in plaid_near_start):
            continue
        merchant = row["Merchant"].strip() or None
        if row["Type"] == "Payment":
            category = CARD_PAYMENT
        elif row["Type"] == "Fee":
            category = "BANK_FEES/BANK_FEES_OTHER_BANK_FEES"
        else:
            category = known.get((merchant or "").lower().removeprefix("refund: "))
        found.append((row["Date"], row["Description"] or merchant or row["Type"], merchant,
                      dollars(row["Amount"]), category))
    return save(conn, account_id, "rhcard-", found)


def plaid_history_start(conn: sqlite3.Connection, account_id: str) -> str | None:
    return conn.execute("SELECT MIN(date) FROM transactions WHERE account_id = ? AND transaction_id NOT LIKE 'rhcard-%'",
                        (account_id,)).fetchone()[0]


def drop_overlap(conn: sqlite3.Connection) -> None:
    """Plaid sometimes fills in older weeks later. Where it now covers dates the file did, keep
    Plaid's copy and drop the imported one, so nothing shows up twice."""
    for (account_id,) in conn.execute("SELECT DISTINCT account_id FROM transactions WHERE transaction_id LIKE 'rhcard-%'").fetchall():
        start = plaid_history_start(conn, account_id)
        if start:
            conn.execute("DELETE FROM transactions WHERE account_id = ? AND transaction_id LIKE 'rhcard-%' AND date >= ?",
                         (account_id, start))


def known_categories(conn: sqlite3.Connection, skip_account: str | None) -> dict[str, str]:
    """Each store's most common Plaid label across your linked accounts."""
    known: dict[str, str] = {}
    for merchant, category in conn.execute(
            """SELECT merchant, plaid_category FROM transactions WHERE merchant IS NOT NULL
               AND plaid_category IS NOT NULL AND account_id IS NOT ?
               AND transaction_id NOT LIKE 'rhcard-%' AND transaction_id NOT LIKE 'apple-%'
               GROUP BY merchant, plaid_category
               ORDER BY COUNT(*) DESC""", (skip_account,)):
        known.setdefault(merchant.lower(), category)
    return known


def dollars(text: str) -> float:
    return float(text.replace(",", "").replace("$", ""))


def save(conn: sqlite3.Connection, account_id: str, prefix: str, found: list[tuple]) -> int:
    """Insert (date, description, merchant, amount, category) rows. Each id comes from the row
    itself, so importing an overlapping file again skips what's already in."""
    seen = Counter()  # two identical coffees on the same day are two purchases
    added = 0
    for day, description, merchant, amount, category in found:
        key = f"{day}|{description}|{amount:.2f}"
        seen[key] += 1
        txn_id = prefix + hashlib.sha1(f"{key}|{seen[key]}".encode()).hexdigest()[:20]
        cursor = conn.execute(
            """INSERT OR IGNORE INTO transactions (transaction_id, account_id, date, description, merchant, amount, plaid_category)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (txn_id, account_id, day, description, merchant, amount, category))
        added += cursor.rowcount
    conn.commit()
    return added


def set_apple_card_balance(conn: sqlite3.Connection, balance: float) -> None:
    """The export has no balance, so you type it in. Until then the card is left out of net worth."""
    if not conn.execute("SELECT 1 FROM accounts WHERE account_id = ?", (APPLE_ACCOUNT,)).fetchone():
        raise ValueError("Import an Apple Card file first")
    conn.execute("UPDATE accounts SET current_balance = ?, updated_at = ? WHERE account_id = ?",
                 (balance, datetime.now().isoformat(timespec="seconds"), APPLE_ACCOUNT))
    conn.execute("INSERT OR REPLACE INTO account_balances (account_id, date, balance) VALUES (?, ?, ?)",
                 (APPLE_ACCOUNT, date.today().isoformat(), balance))
    conn.commit()
