"""Local web server. Listens only on this Mac (127.0.0.1) and checks a per-run token on every API call."""

import json
import logging
import re
import secrets
import sqlite3
import threading
from datetime import date
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from . import plaid_client, reports, rules, sync

STATIC_DIR = Path(__file__).parent / "static"
CONTENT_TYPES = {".html": "text/html", ".js": "text/javascript", ".css": "text/css"}


class App:
    def __init__(self, conn: sqlite3.Connection, rules_path: Path, demo: bool, port: int):
        self.conn = conn
        self.rules_path = rules_path
        self.demo = demo
        self.port = port
        self.token = secrets.token_urlsafe(24)
        self.lock = threading.Lock()  # one request touches the database at a time

    def rules(self) -> list[rules.Rule]:
        return rules.load(self.rules_path)


ROUTES = []


def route(method: str, pattern: str):
    def register(handler):
        ROUTES.append((method, re.compile(f"^{pattern}$"), handler))
        return handler
    return register


def owner_param(query: dict) -> int | None:
    value = query.get("owner", [""])[0]
    return int(value) if value.isdigit() else None


def month_param(query: dict) -> str:
    value = query.get("month", [""])[0]
    return value if re.fullmatch(r"\d{4}-\d{2}", value) else date.today().strftime("%Y-%m")


@route("GET", "/api/dashboard")
def get_dashboard(app: App, query, body):
    owner, rule_list = owner_param(query), app.rules()
    return {
        "balances": reports.balances(app.conn, owner),
        "net_worth_history": reports.net_worth_history(app.conn, owner),
        "pace": reports.month_spending_pace(app.conn, rule_list, owner),
        "forecast": reports.forecast(app.conn, rule_list, owner),
        "recurring": reports.recurring(app.conn, rule_list, owner),
        "budget": reports.budget_status(app.conn, rule_list, owner),
        "recent": reports.transactions(app.conn, rule_list, owner)[:6],
        "accounts": reports.accounts(app.conn, owner),
        "needs_attention": [a["institution"] for a in reports.accounts(app.conn, owner) if a["last_error"]],
    }


@route("GET", "/api/spending")
def get_spending(app: App, query, body):
    offset = query.get("offset", ["0"])[0]
    return reports.spending(
        app.conn, app.rules(), query.get("period", ["month"])[0],
        int(offset) if offset.lstrip("-").isdigit() else 0,
        owner_param(query), query.get("bills", ["1"])[0] == "1",
    )


@route("GET", "/api/budget")
def get_budget(app: App, query, body):
    return reports.budget_status(app.conn, app.rules(), owner_param(query))


@route("PUT", "/api/budget")
def put_budget(app: App, query, body):
    amount = body.get("amount")
    if amount in (None, ""):
        app.conn.execute("DELETE FROM settings WHERE key = 'monthly_budget'")
    else:
        amount = float(amount)
        if not 0 < amount < 10_000_000:
            raise ValueError("Budget must be a positive number")
        app.conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('monthly_budget', ?)", (str(amount),))
    app.conn.commit()
    return {"ok": True}


@route("PUT", "/api/budget/category")
def put_category_budget(app: App, query, body):
    category = rules.clean_category(str(body.get("category") or ""))
    if not category:
        raise ValueError("Pick a category")
    amount = body.get("amount")
    if amount in (None, ""):
        app.conn.execute("DELETE FROM budgets WHERE category = ?", (category,))
    else:
        amount = float(amount)
        if not 0 < amount < 10_000_000:
            raise ValueError("Budget must be a positive number")
        app.conn.execute("INSERT OR REPLACE INTO budgets (category, amount) VALUES (?, ?)", (category, amount))
    app.conn.commit()
    return {"ok": True}


@route("GET", "/api/forecast")
def get_forecast(app: App, query, body):
    return reports.forecast(app.conn, app.rules(), owner_param(query))


def day_param(query: dict, name: str) -> date | None:
    value = query.get(name, [""])[0]
    return date.fromisoformat(value) if re.fullmatch(r"\d{4}-\d{2}-\d{2}", value) else None


@route("GET", "/api/transactions")
def get_transactions(app: App, query, body):
    search = query.get("q", [""])[0].strip()[:100] or None
    tag = query.get("tag", [""])[0].strip()[:30] or None
    merchant = query.get("merchant", [""])[0].strip()[:200] or None
    since, until = day_param(query, "since"), day_param(query, "until")
    has_month = bool(query.get("month", [""])[0])
    if search and not (since or has_month):  # a typed search looks through all history
        return reports.transactions(app.conn, app.rules(), owner_param(query), search=search)[:500]
    month = month_param(query) if has_month and not since else None  # a date range wins over a month
    return reports.transactions(app.conn, app.rules(), owner_param(query), month,
                                since=since, until=until, search=search, tag=tag, merchant=merchant)


# What you can change on a transaction from its detail panel.
EDITABLE = {"name_override", "note", "hidden", "tags"}


def clean_edit(patch: dict) -> dict:
    edit = {}
    for field, value in patch.items():
        if field not in EDITABLE:
            raise ValueError(f"Can't change {field}")
        if field == "hidden":
            edit[field] = 1 if value else 0
        elif field == "tags":
            tags = [re.sub(r"[^a-z0-9 -]", "", str(t).lower()).strip()[:30] for t in value or []]
            edit[field] = ",".join(sorted({t for t in tags if t})) or None
        else:
            edit[field] = (str(value).strip()[:200] or None) if value is not None else None
    return edit


def apply_edit(app: App, txn_ids: list[str], edit: dict) -> None:
    if not edit:
        return
    assignments = ", ".join(f"{field} = ?" for field in edit)
    for txn_id in txn_ids:
        app.conn.execute(f"UPDATE transactions SET {assignments} WHERE transaction_id = ?", (*edit.values(), txn_id))


@route("PATCH", r"/api/transactions/(?P<txn_id>[\w-]+)")
def edit_transaction(app: App, query, body, txn_id):
    if not app.conn.execute("SELECT 1 FROM transactions WHERE transaction_id = ?", (txn_id,)).fetchone():
        raise ValueError("No such transaction")
    apply_edit(app, [txn_id], clean_edit(body))
    app.conn.commit()
    return {"ok": True}


@route("POST", "/api/transactions/bulk")
def bulk_edit(app: App, query, body):
    if not isinstance(body.get("ids"), list):
        raise ValueError("ids must be a list")
    ids = [str(i) for i in body["ids"]][:1000]
    if body.get("category") is not None:
        if not isinstance(body["category"], str):
            raise ValueError("category must be text")
        category = rules.clean_category(body["category"]) or None
        app.conn.executemany("UPDATE transactions SET category_override = ? WHERE transaction_id = ?",
                             [(category, txn_id) for txn_id in ids])
    edit = body.get("edit") or {}
    if not isinstance(edit, dict):
        raise ValueError("edit must be an object")
    apply_edit(app, ids, clean_edit(edit))
    app.conn.commit()
    return {"ok": True, "count": len(ids)}


@route("POST", r"/api/transactions/(?P<txn_id>[\w-]+)/category")
def set_category(app: App, query, body, txn_id):
    category = rules.clean_category(body.get("category") or "") or None
    if body.get("make_rule") and category:
        rules.add_rule(app.rules_path, body.get("match_text") or "", category)
        txn = app.conn.execute("SELECT * FROM transactions WHERE transaction_id = ?", (txn_id,)).fetchone()
        # The rule covers it, so later rule edits still apply. Money moves keep your pick, because
        # matching a card payment can relabel them after the rules run.
        covered = rules.categorize({**dict(txn), "category_override": None}, app.rules())[0] == category if txn else False
        if covered and category not in rules.MOVE_CATEGORIES:
            category = None
    app.conn.execute("UPDATE transactions SET category_override = ? WHERE transaction_id = ?", (category, txn_id))
    app.conn.commit()
    return {"ok": True}


@route("GET", "/api/categories")
def get_categories(app: App, query, body):
    names = set(rules.PLAID_PRIMARY_NAMES.values()) | set(rules.PLAID_DETAILED_NAMES.values()) | rules.NOT_SPENDING
    names |= {r.category for r in app.rules()}
    names |= {row[0] for row in app.conn.execute("SELECT DISTINCT category_override FROM transactions WHERE category_override IS NOT NULL")}
    return sorted(names)


@route("GET", "/api/rules")
def get_rules(app: App, query, body):
    text = app.rules_path.read_text()
    parsed, errors = rules.parse(text)
    lines = text.splitlines()
    listed = [{"line": r.line, "raw": lines[r.line - 1], "text": r.text, "op": r.op, "amount": r.amount,
               "category": r.category} for r in parsed]
    return {"text": text, "errors": errors, "rules": listed}


@route("POST", "/api/rules/add")
def add_rule(app: App, query, body):
    rules.add_rule(app.rules_path, str(body.get("text") or ""), str(body.get("category") or ""))
    return {"ok": True}


@route("POST", "/api/rules/delete")
def delete_rule(app: App, query, body):
    """Remove one rule by line number, checking the line still says what the page showed."""
    lines = app.rules_path.read_text().splitlines()
    index = int(body["line"]) - 1
    if not 0 <= index < len(lines) or lines[index].strip() != str(body.get("expected", "")).strip():
        raise ValueError("The rules file changed. Reload and try again.")
    del lines[index]
    app.rules_path.write_text("\n".join(lines) + "\n")
    return {"ok": True}


@route("PUT", "/api/rules")
def put_rules(app: App, query, body):
    if not isinstance(body.get("text"), str):
        raise ValueError("Rules text is missing")
    errors = rules.parse(body["text"])[1]
    if errors:
        return {"ok": False, "errors": errors}
    app.rules_path.write_text(body["text"])
    return {"ok": True, "errors": []}


@route("GET", "/api/recurring")
def get_recurring(app: App, query, body):
    return reports.recurring(app.conn, app.rules(), owner_param(query), include_ignored=query.get("all") == ["1"])


@route("POST", "/api/recurring/ignore")
def ignore_recurring(app: App, query, body):
    """Mark a detected repeat as 'not recurring', or undo that."""
    key = str(body.get("key") or "")[:200]
    if not key:
        raise ValueError("Missing key")
    if body.get("ignored", True):
        app.conn.execute("INSERT OR IGNORE INTO recurring_ignored (key) VALUES (?)", (key,))
    else:
        app.conn.execute("DELETE FROM recurring_ignored WHERE key = ?", (key,))
    app.conn.commit()
    return {"ok": True}


@route("POST", "/api/recurring/manual")
def add_manual_recurring(app: App, query, body):
    incomplete = "Fill in a name, amount, how often, and the next date"
    name = str(body.get("name") or "").strip()[:100]
    kind = body.get("kind")
    frequency = body.get("frequency")
    category = rules.clean_category(str(body.get("category") or "")) or None
    try:
        amount = float(body.get("amount"))
        next_date = date.fromisoformat(str(body.get("next_date")))
    except (TypeError, ValueError):
        raise ValueError(incomplete)
    near = abs((next_date - date.today()).days) <= 400  # a far-off date would roll forward for ages on every page
    if not name or kind not in ("bill", "income") or frequency not in reports.FREQUENCY_DAYS or not 0 < amount < 10_000_000 or not near:
        raise ValueError(incomplete)
    app.conn.execute(
        "INSERT INTO recurring_manual (name, kind, amount, frequency, next_date, category) VALUES (?, ?, ?, ?, ?, ?)",
        (name, kind, amount, frequency, next_date.isoformat(), category),
    )
    app.conn.commit()
    return {"ok": True}


@route("POST", r"/api/recurring/manual/(?P<item_id>\d+)/delete")
def delete_manual_recurring(app: App, query, body, item_id):
    app.conn.execute("DELETE FROM recurring_manual WHERE id = ?", (int(item_id),))
    app.conn.commit()
    return {"ok": True}


@route("GET", "/api/payment-plans")
def get_payment_plans(app: App, query, body):
    return reports.payment_plans(app.conn, owner_param(query))


@route("POST", "/api/payment-plans")
def add_payment_plan(app: App, query, body):
    incomplete = "Fill in the card, a name, the monthly amount, what's left, the statement date and closing day"
    name = str(body.get("name") or "").strip()[:100]
    account_id = str(body.get("account_id") or "")
    try:
        monthly = float(body.get("monthly"))
        remaining = float(body.get("remaining"))
        as_of = date.fromisoformat(str(body.get("as_of")))
        close_day = int(body.get("close_day"))
    except (TypeError, ValueError):
        raise ValueError(incomplete)
    # A card with no known balance adds nothing to what you owe, so adding its plan back would inflate Net Cash.
    card = app.conn.execute("SELECT 1 FROM accounts WHERE account_id = ? AND type = 'credit' AND current_balance IS NOT NULL",
                            (account_id,)).fetchone()
    if not name or not card or not 0 < monthly <= remaining < 10_000_000 or not 1 <= close_day <= 31:
        raise ValueError(incomplete)
    app.conn.execute(
        "INSERT INTO payment_plans (account_id, name, monthly, remaining, as_of, close_day) VALUES (?, ?, ?, ?, ?, ?)",
        (account_id, name, monthly, remaining, as_of.isoformat(), close_day),
    )
    app.conn.commit()
    return {"ok": True}


@route("POST", r"/api/payment-plans/(?P<plan_id>\d+)/delete")
def delete_payment_plan(app: App, query, body, plan_id):
    app.conn.execute("DELETE FROM payment_plans WHERE id = ?", (int(plan_id),))
    app.conn.commit()
    return {"ok": True}


NET_WORTH_DAYS = {"1m": 30, "3m": 90, "6m": 180, "1y": 365}


@route("GET", "/api/net-worth")
def get_net_worth(app: App, query, body):
    owner = owner_param(query)
    days = NET_WORTH_DAYS.get(query.get("range", ["3m"])[0], 90)
    return {
        "history": reports.net_worth_history(app.conn, owner, days=days),
        "balances": reports.balances(app.conn, owner),
        "accounts": reports.accounts(app.conn, owner),
    }


@route("GET", "/api/holdings")
def get_holdings(app: App, query, body):
    return reports.holdings(app.conn, owner_param(query))


# Plaid's answers that mean "this link never got permission to share holdings". Reconnecting fixes them.
NEEDS_PERMISSION = ("ADDITIONAL_CONSENT_REQUIRED", "INVALID_PRODUCT")


@route("GET", "/api/accounts")
def get_accounts(app: App, query, body):
    owners = [dict(row) for row in app.conn.execute("SELECT * FROM owners ORDER BY id")]
    synced = app.conn.execute("SELECT MAX(last_synced) FROM items").fetchone()[0]
    needs_holdings = [dict(row) for row in app.conn.execute(
        "SELECT item_id, institution FROM items WHERE holdings_error IN (?, ?) ORDER BY institution",
        NEEDS_PERMISSION)]
    return {"accounts": reports.accounts(app.conn, include_hidden=True), "owners": owners, "demo": app.demo,
            "last_synced": synced, "needs_holdings": needs_holdings}


@route("POST", "/api/owners")
def add_owner(app: App, query, body):
    name = (body.get("name") or "").strip()
    if not name:
        return {"ok": False, "error": "Name is empty"}
    app.conn.execute("INSERT OR IGNORE INTO owners (name) VALUES (?)", (name,))
    app.conn.commit()
    return {"ok": True}


@route("POST", r"/api/accounts/(?P<account_id>[\w-]+)/owner")
def set_owner(app: App, query, body, account_id):
    app.conn.execute("UPDATE accounts SET owner_id = ? WHERE account_id = ?", (int(body["owner_id"]), account_id))
    app.conn.commit()
    return {"ok": True}


@route("POST", r"/api/accounts/(?P<account_id>[\w-]+)/hidden")
def set_account_hidden(app: App, query, body, account_id):
    if not isinstance(body.get("hidden"), bool):
        raise ValueError("hidden must be true or false")
    app.conn.execute("UPDATE accounts SET hidden = ? WHERE account_id = ?", (int(body["hidden"]), account_id))
    app.conn.commit()
    return {"ok": True}


@route("POST", "/api/link-token")
def link_token(app: App, query, body):
    if app.demo:
        return {"ok": False, "error": "Linking is off in demo mode"}
    if body.get("kind") not in ("banking", "investments"):
        raise ValueError("Unknown account kind")
    item_id = body.get("item_id")
    if item_id is not None and not isinstance(item_id, str):
        raise ValueError("item_id must be text")
    if item_id is not None and not app.conn.execute("SELECT 1 FROM items WHERE item_id = ?", (item_id,)).fetchone():
        raise ValueError("Unknown bank")
    return {"ok": True, "link_token": plaid_client.create_link_token(body["kind"], item_id)}


@route("POST", "/api/link-done")
def link_done(app: App, query, body):
    if body.get("kind") not in ("banking", "investments") or not body.get("public_token"):
        raise ValueError("Link did not finish")
    item_id = plaid_client.exchange_public_token(body["public_token"])
    sync.add_item(app.conn, item_id, body.get("institution") or "Unknown bank", body["kind"])
    results = sync.sync_all(app.conn)
    return {"ok": True, "results": results}


@route("POST", "/api/relink-done")
def relink_done(app: App, query, body):
    if app.demo:
        return {"ok": True, "results": []}
    return {"ok": True, "results": sync.sync_all(app.conn)}


@route("POST", "/api/sync")
def sync_now(app: App, query, body):
    if app.demo:
        return {"ok": True, "results": []}
    return {"ok": True, "results": sync.sync_all(app.conn)}


def make_handler(app: App):
    allowed_hosts = {f"127.0.0.1:{app.port}", f"localhost:{app.port}"}

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format, *args):
            pass  # keep store names and amounts out of the terminal

        def send(self, status: int, payload: bytes, content_type: str):
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Frame-Options", "DENY")
            self.send_header("Content-Security-Policy", "frame-ancestors 'none'")
            self.end_headers()
            self.wfile.write(payload)

        def send_json(self, data, status: int = HTTPStatus.OK):
            self.send(status, json.dumps(data).encode(), "application/json")

        def handle_request(self, method: str):
            # Blocks other websites from reaching this server through a trick DNS name.
            if self.headers.get("Host") not in allowed_hosts:
                return self.send(HTTPStatus.FORBIDDEN, b"Forbidden", "text/plain")
            url = urlparse(self.path)
            if not url.path.startswith("/api/"):
                return self.serve_static(url.path)
            # Blocks other websites open in your browser from calling the API.
            if not secrets.compare_digest(self.headers.get("X-Token", "").encode(), app.token.encode()):
                return self.send_json({"error": "Bad token"}, HTTPStatus.FORBIDDEN)
            length = int(self.headers.get("Content-Length") or 0)
            try:
                body = json.loads(self.rfile.read(length)) if length else {}
            except json.JSONDecodeError:
                return self.send_json({"ok": False, "error": "Bad request"}, HTTPStatus.BAD_REQUEST)
            if not isinstance(body, dict):
                return self.send_json({"ok": False, "error": "Bad request"}, HTTPStatus.BAD_REQUEST)
            for route_method, pattern, handler in ROUTES:
                match = pattern.match(url.path)
                if match and route_method == method:
                    try:
                        with app.lock:
                            result = handler(app, parse_qs(url.query), body, **match.groupdict())
                        return self.send_json(result)
                    except plaid_client.PlaidError as error:
                        return self.send_json({"ok": False, "error": str(error)}, HTTPStatus.BAD_GATEWAY)
                    except (ValueError, KeyError, TypeError, sqlite3.IntegrityError) as error:
                        app.conn.rollback()
                        return self.send_json({"ok": False, "error": f"Bad request: {error}"}, HTTPStatus.BAD_REQUEST)
                    except Exception:
                        app.conn.rollback()
                        logging.exception("Request failed")
                        return self.send_json({"ok": False, "error": "Something broke. Check the terminal."}, HTTPStatus.INTERNAL_SERVER_ERROR)
            self.send_json({"error": "Not found"}, HTTPStatus.NOT_FOUND)

        def serve_static(self, path: str):
            name = "index.html" if path == "/" else path.lstrip("/")
            file = (STATIC_DIR / name).resolve()
            if file.parent != STATIC_DIR.resolve() or not file.is_file():
                return self.send(HTTPStatus.NOT_FOUND, b"Not found", "text/plain")
            content = file.read_bytes()
            if file.name == "index.html":
                content = content.replace(b"__TOKEN__", app.token.encode())
            self.send(HTTPStatus.OK, content, CONTENT_TYPES.get(file.suffix, "application/octet-stream"))

        def do_GET(self):
            self.handle_request("GET")

        def do_POST(self):
            self.handle_request("POST")

        def do_PUT(self):
            self.handle_request("PUT")

        def do_PATCH(self):
            self.handle_request("PATCH")

    return Handler


def serve(app: App) -> ThreadingHTTPServer:
    return ThreadingHTTPServer(("127.0.0.1", app.port), make_handler(app))
