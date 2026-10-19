"""Link to the Life Dashboard: publish the reports to Supabase, and carry out edits made on the web page.

The Mac has no Supabase login. It holds a dashboard key (made on the Finances page, kept in the
Keychain) and calls three database functions that only touch that key's owner's money rows.
"""

import hashlib
import json
import logging
import sqlite3
import time
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path

from . import importer, plaid_client, reports, server

SUPABASE_URL = "https://wruevdyyhuizyydibzar.supabase.co"
SUPABASE_KEY = "sb_publishable_-IEt38so3aZZdnPJwl-LPQ_z_jVivE2"  # publishable, safe to ship
KEY_NAME = "dashboard_key"

# What the web page may ask the Mac to do. Linking a bank stays in the Mac app.
ALLOWED_WRITES = {
    ("PATCH", "/api/transactions/"), ("POST", "/api/transactions/"), ("PUT", "/api/budget"),
    ("POST", "/api/rules/"), ("PUT", "/api/rules"), ("POST", "/api/recurring/"),
    ("POST", "/api/accounts/"), ("POST", "/api/sync"), ("POST", "/api/payment-plans"),
}

# Drop an Apple Card, Robinhood card or Amazon export here (from the iPhone's Files app too) and it imports.
ICLOUD = Path.home() / "Library/Mobile Documents/com~apple~CloudDocs"
INBOX = (ICLOUD if ICLOUD.is_dir() else Path.home()) / "Money Inbox"

SPENDING_PAGES = {"week": 8, "month": 13, "quarter": 5, "year": 3}  # how far back each period can go
TRANSACTION_LIMIT = 6000


def dashboard_key() -> str | None:
    try:
        return plaid_client.keychain_get(KEY_NAME)
    except plaid_client.PlaidError:
        return None


def save_key(key: str) -> None:
    plaid_client.keychain_set(KEY_NAME, key.strip())


def rpc(name: str, key: str, **args):
    request = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/rpc/{name}",
        data=json.dumps({"p_key": key, **args}).encode(),
        headers={"Content-Type": "application/json", "apikey": SUPABASE_KEY,
                 "Authorization": f"Bearer {SUPABASE_KEY}"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        body = response.read()
    return json.loads(body) if body else None


def build_payload(app: server.App) -> dict:
    """Every report the web page shows, worked out here so the page never needs the database."""
    conn, rule_list = app.conn, app.rules()
    call = lambda path, query=None, body=None: route(app, "GET", path, query or {}, body or {})
    spending = {
        f"{period}:{offset}": reports.spending(conn, rule_list, period, -offset, None, True)
        for period, pages in SPENDING_PAGES.items() for offset in range(pages)
    }
    since = date.today().replace(day=1, year=date.today().year - 2)
    txns = [compact(t) for t in reports.transactions(conn, rule_list, None, since=since)[:TRANSACTION_LIMIT]]
    for key, page in spending.items():
        if not key.endswith(":0"):
            page.pop("needs_sorting", None)  # only the current period lists what needs a category
    return {
        "version": 1,
        "demo": app.demo,
        "dashboard": call("/api/dashboard"),
        "net_worth": {
            "history": reports.net_worth_history(conn, None, days=365),
            "balances": reports.balances(conn, None),
        },
        "spending": spending,
        "budget": call("/api/budget"),
        "recurring": call("/api/recurring", {"all": ["1"]}),
        "transactions": txns,
        "categories": call("/api/categories"),
        "rules": call("/api/rules"),
        "holdings": call("/api/holdings"),
        "accounts": call("/api/accounts"),
        "payment_plans": call("/api/payment-plans"),
    }


# The page looks these up from the account instead.
DROP = {"account_name", "account_mask", "account_type", "plaid_category"}


def compact(txn: dict) -> dict:
    """A transaction without empty fields, so two years of them stay a small download."""
    return {k: v for k, v in txn.items() if k not in DROP and v not in (None, [], "", 0) or k in ("amount",)}


def route(app: server.App, method: str, path: str, query: dict, body: dict):
    for route_method, pattern, handler in server.ROUTES:
        match = pattern.match(path)
        if match and route_method == method:
            with app.lock:
                return handler(app, query, body, **match.groupdict())
    raise ValueError(f"No such page: {method} {path}")


def allowed(method: str, path: str) -> bool:
    return any(method == m and (path == p or (p.endswith("/") and path.startswith(p))) for m, p in ALLOWED_WRITES)


def run_action(app: server.App, action: dict) -> tuple[bool, dict]:
    method, path, body = action["method"], action["path"], action.get("body") or {}
    if not allowed(method, path) or not isinstance(body, dict):
        return False, {"error": "The Mac app doesn't do that from the web"}
    try:
        result = route(app, method, path, {}, body)
        return (result.get("ok", True) if isinstance(result, dict) else True), result
    except plaid_client.PlaidError as error:
        return False, {"error": str(error)}
    except (ValueError, KeyError, TypeError, sqlite3.IntegrityError) as error:
        app.conn.rollback()
        return False, {"error": str(error)}


class Bridge:
    def __init__(self, app: server.App):
        self.app = app
        self.last_hash = None

    def publish(self, force: bool = False) -> bool:
        key = dashboard_key()
        if not key:
            return False
        payload = build_payload(self.app)
        text = json.dumps(payload, sort_keys=True, default=str)
        digest = hashlib.sha256(text.encode()).hexdigest()
        if digest == self.last_hash and not force:
            return False
        rpc("money_publish", key, p_payload=json.loads(text))
        self.last_hash = digest
        return True

    def handle_actions(self) -> int:
        key = dashboard_key()
        if not key:
            return 0
        actions = rpc("money_take_actions", key) or []
        for action in actions:
            ok, result = run_action(self.app, action)
            rpc("money_finish_action", key, p_id=action["id"], p_ok=ok, p_result=json.loads(json.dumps(result, default=str)))
        if actions:
            self.publish(force=True)
        return len(actions)

    def import_inbox(self) -> int:
        """Import any export waiting in the Money Inbox folder, then file it under Imported."""
        INBOX.mkdir(exist_ok=True)
        done = INBOX / "Imported"
        count = 0
        for file in sorted(INBOX.iterdir()):
            if file.suffix.lower() not in (".csv", ".zip") or file.name.startswith("."):
                continue
            try:
                with self.app.lock:
                    source, added = importer.import_file(self.app.conn, file)
                logging.info("Imported %s %s rows from %s", added, source, file.name)
                done.mkdir(exist_ok=True)
                file.rename(done / file.name)
                count += 1
            except Exception as error:  # a half-synced iCloud file fails now and imports next time
                logging.warning("Couldn't import %s yet: %s", file.name, error)
        return count

    def run_forever(self, every: int = 15, publish_every: int = 120) -> None:
        last_publish = 0.0
        while True:
            try:
                self.handle_actions()
                if self.import_inbox():
                    self.publish()
                if time.time() - last_publish > publish_every:
                    self.publish()  # only sends when something changed, e.g. an edit in the Mac app
                    last_publish = time.time()
            except (urllib.error.URLError, TimeoutError) as error:
                logging.warning("Dashboard link offline: %s", error)
            except Exception:
                logging.exception("Dashboard link failed")
            time.sleep(every)
