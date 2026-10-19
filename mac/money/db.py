"""SQLite storage. The database lives in ~/.money-dashboard, outside any git repo."""

import sqlite3
from pathlib import Path

DATA_DIR = Path.home() / ".money-dashboard"
DEFAULT_OWNER = "Me"

SCHEMA = """
CREATE TABLE IF NOT EXISTS owners (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS items (
  item_id TEXT PRIMARY KEY,
  institution TEXT NOT NULL,
  kind TEXT NOT NULL,              -- 'banking', 'investments', or 'file' (imported by hand)
  cursor TEXT,
  last_synced TEXT,
  last_error TEXT
);
CREATE TABLE IF NOT EXISTS accounts (
  account_id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(item_id),
  owner_id INTEGER NOT NULL REFERENCES owners(id),
  name TEXT NOT NULL,
  mask TEXT,
  type TEXT NOT NULL,              -- depository, credit, loan, investment
  subtype TEXT,
  current_balance REAL,
  available_balance REAL,
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS transactions (
  transaction_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(account_id),
  date TEXT NOT NULL,
  description TEXT NOT NULL,
  merchant TEXT,
  amount REAL NOT NULL,            -- Plaid convention: positive = money out
  plaid_category TEXT,             -- e.g. FOOD_AND_DRINK/FOOD_AND_DRINK_GROCERIES
  pending INTEGER NOT NULL DEFAULT 0,
  category_override TEXT
);
CREATE INDEX IF NOT EXISTS transactions_date ON transactions(date);
CREATE TABLE IF NOT EXISTS holdings (
  account_id TEXT NOT NULL REFERENCES accounts(account_id),
  security_id TEXT NOT NULL,
  ticker TEXT,
  name TEXT,
  quantity REAL,
  price REAL,
  value REAL,
  cost_basis REAL,
  PRIMARY KEY (account_id, security_id)
);
CREATE TABLE IF NOT EXISTS account_balances (
  account_id TEXT NOT NULL REFERENCES accounts(account_id),
  date TEXT NOT NULL,
  balance REAL NOT NULL,
  PRIMARY KEY (account_id, date)
);
CREATE TABLE IF NOT EXISTS budgets (
  category TEXT PRIMARY KEY,
  amount REAL NOT NULL               -- monthly limit
);
CREATE TABLE IF NOT EXISTS recurring_ignored (
  key TEXT PRIMARY KEY               -- a detected repeat you said isn't one
);
CREATE TABLE IF NOT EXISTS recurring_manual (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,                -- 'bill' or 'income'
  amount REAL NOT NULL,
  frequency TEXT NOT NULL,           -- one of reports.FREQUENCIES
  next_date TEXT NOT NULL,
  category TEXT
);
CREATE TABLE IF NOT EXISTS amazon_orders (
  order_id TEXT PRIMARY KEY,
  date TEXT NOT NULL,                -- the day it was ordered
  total REAL NOT NULL,
  items TEXT NOT NULL                -- product names, " / " between them
);
CREATE TABLE IF NOT EXISTS payment_plans (
  id INTEGER PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(account_id),
  name TEXT NOT NULL,
  monthly REAL NOT NULL,             -- the slice billed on each statement
  remaining REAL NOT NULL,           -- not yet billed, as of the statement below
  as_of TEXT NOT NULL,               -- that statement's closing date
  close_day INTEGER NOT NULL         -- day of the month the card's statement closes
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
"""


# Columns added after the first release. Older databases get them on start-up.
ADDED_COLUMNS = {
    "transactions": {
        "name_override": "TEXT",            # your own name for the store
        "note": "TEXT",
        "hidden": "INTEGER NOT NULL DEFAULT 0",  # left out of spending, keeps its category
        "tags": "TEXT",                     # comma-separated, e.g. "tax-deductible"
    },
    "accounts": {
        "hidden": "INTEGER NOT NULL DEFAULT 0",  # switched off: left out of every total and list
    },
    "items": {
        "holdings_error": "TEXT",  # Plaid's reason for not sharing a linked brokerage's holdings, if any
    },
}


def add_missing_columns(conn: sqlite3.Connection) -> None:
    for table, columns in ADDED_COLUMNS.items():
        existing = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}
        for name, kind in columns.items():
            if name not in existing:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {kind}")


def connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path, check_same_thread=False, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")  # the page can read while a background sync writes
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(SCHEMA)
    add_missing_columns(conn)
    if not conn.execute("SELECT 1 FROM owners").fetchone():
        conn.execute("INSERT INTO owners (name) VALUES (?)", (DEFAULT_OWNER,))
        conn.commit()
    db_path.chmod(0o600)
    return conn
