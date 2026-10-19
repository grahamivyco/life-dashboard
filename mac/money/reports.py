"""Everything the dashboard shows: totals, spending by category, transactions, recurring charges."""

import re
import sqlite3
from collections import defaultdict
from datetime import date, timedelta
from statistics import median

from .rules import (BILL_CATEGORIES, CARD_PAYMENT, INVESTING, MOVE_CATEGORIES, NOT_SPENDING, UNSEEN_CARD_SPENDING,
                    Rule, categorize)

ONE_OFF_TAG = "one-off"  # a purchase that won't repeat, like a moving truck; left out of the forecast's daily average
OWED_TYPES = {"credit", "loan"}
SAVINGS_SUBTYPES = {"savings", "money market", "cd", "hsa"}


def owner_filter(owner_id: int | None) -> tuple[str, tuple]:
    """The accounts a report covers: never ones you switched off, and only one person's if picked."""
    if owner_id is None:
        return " AND a.hidden = 0", ()
    return " AND a.hidden = 0 AND a.owner_id = ?", (owner_id,)


def transactions(conn: sqlite3.Connection, rules: list[Rule], owner_id: int | None = None,
                 month: str | None = None, since: date | None = None, until: date | None = None,
                 search: str | None = None, tag: str | None = None, merchant: str | None = None) -> list[dict]:
    """Transactions newest first. `since` is included, `until` is not."""
    where, params = owner_filter(owner_id)
    bought = amazon_purchases(conn)
    if search:
        found_in_order = [txn_id for txn_id, items in bought.items() if search.lower() in items.lower()]
        where += f""" AND (t.description LIKE ? OR t.merchant LIKE ? OR t.name_override LIKE ?
                           OR t.note LIKE ? OR t.tags LIKE ?
                           OR t.transaction_id IN ({", ".join("?" * len(found_in_order)) or "NULL"}))"""
        params += (f"%{search}%",) * 5 + tuple(found_in_order)
    if tag:
        where += " AND ',' || t.tags || ',' LIKE ?"
        params += (f"%,{tag},%",)
    if month:
        where += " AND t.date LIKE ?"
        params += (f"{month}-%",)
    if since:
        where += " AND t.date >= ?"
        params += (since.isoformat(),)
    if until:
        where += " AND t.date < ?"
        params += (until.isoformat(),)
    rows = conn.execute(
        f"""SELECT t.*, a.name AS account_name, a.mask AS account_mask, a.type AS account_type
            FROM transactions t JOIN accounts a USING (account_id)
            WHERE 1 = 1 {where}
            ORDER BY t.date DESC, t.transaction_id""",
        params,
    ).fetchall()
    paid_to_cards = card_payment_withdrawals(conn)
    result = []
    for row in rows:
        txn = dict(row)
        txn["name"] = txn["name_override"] or txn["merchant"] or txn["description"]
        if merchant is not None and txn["name"] != merchant:
            continue
        txn["category"], txn["category_source"] = categorize(txn, rules)
        paid_card = txn["category"] in MOVE_CATEGORIES and txn["category_source"] != "you"
        how = paid_to_cards.get(txn["transaction_id"]) if paid_card else None
        if how == "before history":
            txn["category"], txn["category_source"] = UNSEEN_CARD_SPENDING, "a card bill from before the card's history"
        elif how or payment_received(txn, txn["category_source"]):
            txn["category"], txn["category_source"] = CARD_PAYMENT, "matches a payment on your card"
        txn["bought"] = bought.get(txn["transaction_id"])
        txn["tags"] = [tag for tag in (txn["tags"] or "").split(",") if tag]
        txn["spending"] = not txn["hidden"] and txn["category"] not in NOT_SPENDING
        result.append(txn)
    return result


def card_payment_withdrawals(conn: sqlite3.Connection) -> dict[str, str]:
    """Bank withdrawals that land as a payment on a linked card within 5 days, paired one to one.

    Robinhood names both its card payments and its brokerage deposits "Robinhood", so the payment
    showing up on the card is the proof of which is which. Before the card's history starts there's
    nothing to match, so there a withdrawal to the card's company with cents counts: a statement
    balance has cents and a brokerage deposit almost never does. Returns each one's id and how it
    was found: "matched" or "before history".
    """
    def company(institution: str) -> str:
        return institution.split(" - ")[0].lower()

    # Card payments by the card's company and amount. A withdrawal only pairs with one when it
    # names that company, so a Venmo cash-out of the same amount can't steal a Robinhood payment.
    unpaired: dict[tuple[str, float], list[date]] = defaultdict(list)
    for row in conn.execute("""SELECT i.institution, t.amount, t.date FROM transactions t
                               JOIN accounts a USING (account_id) JOIN items i USING (item_id)
                               WHERE a.type = 'credit' AND t.amount < 0
                               AND t.plaid_category LIKE '%CREDIT_CARD_PAYMENT' ORDER BY t.date"""):
        unpaired[(company(row["institution"]), round(-row["amount"], 2))].append(date.fromisoformat(row["date"]))
    history_starts: dict[str, str] = {}
    for row in conn.execute("""SELECT i.institution, MIN(t.date) FROM items i JOIN accounts a USING (item_id)
                               JOIN transactions t USING (account_id) WHERE a.type = 'credit' GROUP BY i.institution"""):
        name = company(row[0])
        history_starts[name] = min(history_starts.get(name, row[1]), row[1])
    matched: dict[str, str] = {}
    for row in conn.execute("""SELECT t.transaction_id, t.amount, t.date, t.merchant, t.description
                               FROM transactions t JOIN accounts a USING (account_id)
                               WHERE a.type IN ('depository', 'investment') AND t.amount > 0
                               AND (t.plaid_category LIKE 'TRANSFER_OUT%' OR t.plaid_category LIKE 'LOAN_PAYMENTS%')
                               ORDER BY t.date, t.transaction_id"""):
        text = f"{row['merchant'] or ''} {row['description']}".lower()
        when = date.fromisoformat(row["date"])
        for name, history_start in history_starts.items():
            if not re.search(rf"\b{re.escape(name)}\b", text):  # "chase" isn't in "purchase"
                continue
            payments = unpaired.get((name, round(row["amount"], 2)), [])
            paid = next((day for day in payments if abs((when - day).days) <= 5), None)
            if paid:
                payments.remove(paid)
                matched[row["transaction_id"]] = "matched"
                break
            if row["date"] < history_start and round(row["amount"]) != row["amount"]:
                matched[row["transaction_id"]] = "before history"
                break
    return matched


def amazon_purchases(conn: sqlite3.Connection) -> dict[str, str]:
    """What each Amazon charge bought, from imported Amazon orders. Returns {transaction id: items}.

    The card only says "AMAZON MKTPL*5E0S045M0". Amazon charges an order when it ships, so a charge
    pairs with an order of the same total placed up to 30 days before (or 3 after, since card
    dates can run early). Each order pays for one charge. A refund of the same amount points back
    at the order it returned. An order that ships in two boxes is charged twice, so neither charge
    equals its total and both stay unexplained. That's expected, not a bug.
    """
    by_total: dict[float, list[tuple[date, str]]] = defaultdict(list)
    for row in conn.execute("SELECT date, total, items FROM amazon_orders WHERE total > 0 ORDER BY date"):
        by_total[round(row["total"], 2)].append((date.fromisoformat(row["date"]), row["items"]))
    if not by_total:
        return {}
    unpaid = {total: list(orders) for total, orders in by_total.items()}
    bought: dict[str, str] = {}
    # Card charges only, so a Venmo note that mentions Amazon can't take an order's place.
    for row in conn.execute("""SELECT t.transaction_id, t.date, t.amount FROM transactions t JOIN accounts a USING (account_id)
                               WHERE a.type = 'credit' AND (t.description LIKE 'amazon%' OR t.description LIKE 'amzn%')
                               ORDER BY t.date, t.transaction_id"""):
        charged = date.fromisoformat(row["date"])
        total = round(abs(row["amount"]), 2)
        if row["amount"] > 0:
            fits = [order for order in unpaid.get(total, []) if -3 <= (charged - order[0]).days <= 30]
        else:  # an order that was paid for can still be refunded
            fits = [order for order in by_total.get(total, []) if 0 <= (charged - order[0]).days <= 120]
        if not fits:
            continue
        order = min(fits, key=lambda order: abs((charged - order[0]).days))
        bought[row["transaction_id"]] = order[1] or "Amazon order"
        if row["amount"] > 0:
            unpaid[total].remove(order)
    return bought


def payment_received(txn: dict, source: str) -> bool:
    """A card's own record of being paid. Plaid files these as income, transfers or loans."""
    return (source == "Plaid" and txn["account_type"] == "credit" and txn["amount"] < 0
            and re.search(r"\bpayment\b", txn["description"], re.IGNORECASE) is not None
            and txn["category"] in {"Income", "Transfer", "Uncategorized"})


def account_group(row) -> str:
    """The Rocket Money bucket an account sits in on the dashboard."""
    if row["type"] in OWED_TYPES:
        return "card" if row["type"] == "credit" else "loan"
    if row["type"] == "investment":
        return "investments"
    return "savings" if row["subtype"] in SAVINGS_SUBTYPES else "checking"



def statement_closings(after: date, until: date, close_day: int) -> list[date]:
    """Statement closing dates in (after, until]. A short month closes on its last day."""
    closings = []
    month = date(after.year, after.month, 1)
    while month <= until:
        last_day = (add_months(month, 1) - timedelta(days=1)).day
        closing = month.replace(day=min(close_day, last_day))
        if after < closing <= until:
            closings.append(closing)
        month = add_months(month, 1)
    return closings


def payment_plans(conn: sqlite3.Connection, owner_id: int | None = None, today: date | None = None) -> list[dict]:
    """0% plans on a card (like Amazon's Equal Pay). Each statement bills one monthly slice;
    the rest isn't due yet, so Net Cash leaves it out."""
    today = today or date.today()
    where, params = owner_filter(owner_id)
    plans = []
    for row in conn.execute(f"SELECT p.* FROM payment_plans p JOIN accounts a USING (account_id) WHERE 1 = 1 {where}", params):
        billed = len(statement_closings(date.fromisoformat(row["as_of"]), today, row["close_day"]))
        unbilled = max(row["remaining"] - billed * row["monthly"], 0.0)
        plans.append({**dict(row), "unbilled": round(unbilled, 2)})
    return plans


def balances(conn: sqlite3.Connection, owner_id: int | None = None, today: date | None = None) -> dict:
    where, params = owner_filter(owner_id)
    groups = {"checking": 0.0, "card": 0.0, "savings": 0.0, "investments": 0.0, "loan": 0.0}
    for row in conn.execute(f"SELECT type, subtype, current_balance FROM accounts a WHERE 1 = 1 {where}", params):
        groups[account_group(row)] += row["current_balance"] or 0.0
    on_plans = sum(p["unbilled"] for p in payment_plans(conn, owner_id, today))
    return {
        **groups,
        "cash": groups["checking"] + groups["savings"],
        "owed": groups["card"] + groups["loan"],
        "on_plans": on_plans,
        # What's left in checking once the card bill is paid, like Rocket Money's "Net Cash".
        # Plan balances that aren't billed yet stay out; each slice lands when its statement closes.
        "net_cash": groups["checking"] - groups["card"] + on_plans,
        "net_worth": groups["checking"] + groups["savings"] + groups["investments"] - groups["card"] - groups["loan"],
    }


def merchant_key(txn: dict) -> str:
    name = (txn.get("merchant") or txn["description"]).lower()
    return re.sub(r"[^a-z ]", "", name).strip()


# How far apart charges land, in days, for each kind of repeat.
FREQUENCIES = [
    ("weekly", 6, 8, 52 / 12),
    ("every 2 weeks", 13, 16, 26 / 12),
    ("monthly", 26, 35, 1.0),
    ("yearly", 350, 380, 1 / 12),
]


def recurring(conn: sqlite3.Connection, rules: list[Rule], owner_id: int | None = None,
              today: date | None = None, include_ignored: bool = False) -> list[dict]:
    """Bills, subscriptions and paychecks: the ones found in your history plus any you added.

    A repeat is the same name on a steady beat with a similar amount. Bills & Utilities may
    vary more (power bills move with the seasons), so they're shown as the typical amount.
    """
    today = today or date.today()
    cutoff = (today - timedelta(days=400)).isoformat()
    checking = {row["account_id"] for row in conn.execute("SELECT account_id, type, subtype FROM accounts")
                if account_group(row) == "checking"}
    groups: dict[str, list[dict]] = defaultdict(list)
    for txn in transactions(conn, rules, owner_id):
        is_bill = txn["amount"] > 0 and txn["spending"] and txn["category"] != UNSEEN_CARD_SPENDING
        is_pay = txn["amount"] < 0 and txn["category"] == "Income"
        # Only moves into savings or investments lower Net Cash. Card payments and moves between
        # your own checking accounts don't, so other kinds of transfer are left out.
        into_savings = (txn["category"] == "Transfer"
                        and (txn["plaid_category"] or "").endswith("TRANSFER_OUT_SAVINGS"))
        is_move = (txn["amount"] > 0 and txn["account_id"] in checking
                   and (txn["category"] == INVESTING or into_savings))
        if txn["date"] < cutoff or not (is_bill or is_pay or is_move):
            continue
        suffix = ""
        if is_pay:
            suffix = " pay"
        elif is_move:
            suffix = " transfer"
        groups[merchant_key(txn) + suffix].append(txn)
    ignored = {row["key"] for row in conn.execute("SELECT key FROM recurring_ignored")}

    found = []
    for key, charges in groups.items():
        if key in ignored and not include_ignored:
            continue
        charges.sort(key=lambda t: t["date"])
        dates = [date.fromisoformat(t["date"]) for t in charges]
        gaps = [(b - a).days for a, b in zip(dates, dates[1:])]
        if not gaps:
            continue
        gap = median(gaps)
        amounts = [abs(t["amount"]) for t in charges]
        typical = median(amounts)
        varies = any(abs(a - typical) > typical * 0.25 for a in amounts[-3:])
        if varies and charges[-1]["category"] not in BILL_CATEGORIES:
            continue
        if charges[-1]["amount"] < 0:
            kind = "income"
        elif key.endswith(" transfer"):
            kind = "transfer"
        else:
            kind = "bill"
        for name, low, high, per_month in FREQUENCIES:
            enough = 2 if name == "yearly" else 3
            steady = sum(low <= g <= high for g in gaps) >= 0.7 * len(gaps)  # not a random store visit
            if low <= gap <= high and steady and len(charges) >= enough:
                if (today - dates[-1]).days > high + 10:
                    break  # stopped charging; probably cancelled
                amount = median(amounts[-3:]) if varies else amounts[-1]
                found.append({
                    "key": key,
                    "name": charges[-1]["name"],
                    "category": charges[-1]["category"],
                    "kind": kind,
                    "frequency": name,
                    "gap_days": round(gap),
                    "amount": amount,
                    "varies": varies,
                    "per_month": amount * per_month,
                    "last_date": dates[-1].isoformat(),
                    "next_date": max(dates[-1] + timedelta(days=round(gap)), today).isoformat(),
                    "manual": False,
                    "ignored": key in ignored,
                })
                break
    found += manual_recurring(conn, today)
    return sorted(found, key=lambda r: -r["per_month"])


# Typical days between charges, for repeats you add by hand.
FREQUENCY_DAYS = {"weekly": 7, "every 2 weeks": 14, "monthly": 30, "yearly": 365}


def manual_recurring(conn: sqlite3.Connection, today: date) -> list[dict]:
    items = []
    for row in conn.execute("SELECT * FROM recurring_manual"):
        per_month = next(f[3] for f in FREQUENCIES if f[0] == row["frequency"])
        due = date.fromisoformat(row["next_date"])
        # Roll a past date forward so it always shows the next one.
        while due < today:
            due = add_months(due, 1) if row["frequency"] == "monthly" else due + timedelta(days=FREQUENCY_DAYS[row["frequency"]])
        items.append({
            "key": f"manual-{row['id']}",
            "id": row["id"],
            "name": row["name"],
            "category": row["category"] or ("Income" if row["kind"] == "income" else "Bills & Utilities"),
            "kind": row["kind"],
            "frequency": row["frequency"],
            "gap_days": FREQUENCY_DAYS[row["frequency"]],
            "amount": row["amount"],
            "varies": False,
            "per_month": row["amount"] * per_month,
            "last_date": None,
            "next_date": due.isoformat(),
            "manual": True,
            "ignored": False,
        })
    return items


def holdings(conn: sqlite3.Connection, owner_id: int | None = None) -> list[dict]:
    where, params = owner_filter(owner_id)
    rows = conn.execute(
        f"""SELECT h.*, a.name AS account_name FROM holdings h JOIN accounts a USING (account_id)
            WHERE 1 = 1 {where} ORDER BY h.value DESC""",
        params,
    )
    return [dict(row) for row in rows]


def accounts(conn: sqlite3.Connection, owner_id: int | None = None, include_hidden: bool = False) -> list[dict]:
    where, params = owner_filter(owner_id)
    if include_hidden:  # the Accounts tab lists switched-off accounts so you can turn them back on
        where, params = where.replace(" AND a.hidden = 0", ""), params
    rows = conn.execute(
        f"""SELECT a.*, i.institution, i.last_synced, i.last_error, o.name AS owner_name
            FROM accounts a JOIN items i USING (item_id) JOIN owners o ON o.id = a.owner_id
            WHERE 1 = 1 {where} ORDER BY i.institution, a.name""",
        params,
    )
    return [{**dict(row), "group": account_group(row)} for row in rows]


# ---------- Spending tab: week, month, quarter or year ----------

PERIODS = {"week", "month", "quarter", "year"}


def add_months(day: date, months: int) -> date:
    """Same day of the month, `months` later (clamped to the month's last day)."""
    years, month_index = divmod(day.month - 1 + months, 12)
    year, month = day.year + years, month_index + 1
    last_day = ((date(year + month // 12, month % 12 + 1, 1)) - timedelta(days=1)).day
    return date(year, month, min(day.day, last_day))


def period_start(period: str, day: date) -> date:
    if period == "week":
        return day - timedelta(days=(day.weekday() + 1) % 7)  # weeks start on Sunday
    if period == "month":
        return day.replace(day=1)
    if period == "quarter":
        return date(day.year, 3 * ((day.month - 1) // 3) + 1, 1)
    return date(day.year, 1, 1)


def shift_period(period: str, start: date, count: int) -> date:
    if period == "week":
        return start + timedelta(days=7 * count)
    return add_months(start, count * {"month": 1, "quarter": 3, "year": 12}[period])


def period_label(period: str, start: date) -> str:
    if period == "week":
        return start.strftime("%b %-d")
    if period == "month":
        return start.strftime("%b")
    if period == "quarter":
        return f"Q{(start.month - 1) // 3 + 1} {start.strftime('%y')}"
    return str(start.year)


def money_in_out(txns: list[dict]) -> tuple[float, float]:
    income = -sum(t["amount"] for t in txns if t["category"] == "Income" and not t["hidden"])
    spent = sum(t["amount"] for t in txns if t["spending"])
    return income, spent


def spending(conn: sqlite3.Connection, rules: list[Rule], period: str, offset: int = 0,
             owner_id: int | None = None, include_bills: bool = True, today: date | None = None) -> dict:
    """Everything on the Spending tab for one period. offset -1 is the period before this one."""
    if period not in PERIODS:
        raise ValueError("Unknown period")
    today = today or date.today()
    start = shift_period(period, period_start(period, today), offset)
    end = shift_period(period, start, 1)

    history = []
    for back in range(5, -1, -1):
        bar_start = shift_period(period, start, -back)
        bar_txns = transactions(conn, rules, owner_id, since=bar_start, until=shift_period(period, bar_start, 1))
        income, spent = money_in_out(bar_txns)
        history.append({"label": period_label(period, bar_start), "offset": offset - back,
                        "income": income, "spent": spent})

    txns = transactions(conn, rules, owner_id, since=start, until=end)
    income, spent = money_in_out(txns)
    ring = [t for t in txns if t["spending"]
            and (include_bills or t["category"] not in BILL_CATEGORIES)]
    by_category: dict[str, float] = defaultdict(float)
    for txn in ring:
        by_category[txn["category"]] += txn["amount"]
    ring_total = sum(by_category.values())
    by_merchant: dict[str, float] = defaultdict(float)
    for txn in ring:
        by_merchant[txn["name"]] += txn["amount"]
    # Store refunds come back onto the card you paid with. Money in to checking or Venmo is
    # usually a person paying their share (like rent), which isn't a refund.
    refunds = [t for t in ring if t["amount"] < 0 and t["account_type"] == "credit"]
    return {
        "period": period,
        "offset": offset,
        "start": start.isoformat(),
        "end": end.isoformat(),
        "title": period_title(period, start, end),
        "history": history,
        "income": income,
        "spent": spent,
        "net": income - spent,
        "ring_total": ring_total,
        "categories": [
            {"name": name, "spent": amount, "share": amount / ring_total if ring_total > 0 else 0}
            for name, amount in sorted(by_category.items(), key=lambda item: -item[1]) if amount > 0
        ],
        "merchants": [
            {"name": name, "spent": amount, "share": amount / ring_total if ring_total > 0 else 0}
            for name, amount in sorted(by_merchant.items(), key=lambda item: -item[1])[:15] if amount > 0
        ],
        "refunds": {"count": len(refunds), "total": -sum(t["amount"] for t in refunds)},
        "needs_sorting": [t for t in txns if t["category"] == "Uncategorized"],
        "tags": tag_totals(txns),
        "tax_deductible": sum(t["amount"] for t in txns if "tax-deductible" in t["tags"]),
        "reimbursable": sum(t["amount"] for t in txns if "reimbursable" in t["tags"]),
        "ignored": sum(t["amount"] for t in txns if t["category"] == "Ignored" or t["hidden"]),
        "moves": {
            name: sum(t["amount"] for t in txns if t["category"] == name and t["amount"] > 0 and not t["hidden"])
            for name in (CARD_PAYMENT, INVESTING, "Transfer")
        },
    }


def tag_totals(txns: list[dict]) -> list[dict]:
    totals: dict[str, float] = defaultdict(float)
    for txn in txns:
        if not txn["spending"]:
            continue  # a tagged paycheck isn't spending
        for tag in txn["tags"]:
            totals[tag] += txn["amount"]
    return [{"name": name, "spent": amount} for name, amount in sorted(totals.items(), key=lambda item: -item[1])]


def period_title(period: str, start: date, end: date) -> str:
    if period == "week":
        return f"{start.strftime('%b %-d')} to {(end - timedelta(days=1)).strftime('%b %-d')}"
    if period == "month":
        return start.strftime("%B %Y")
    if period == "quarter":
        return f"Q{(start.month - 1) // 3 + 1} {start.year}"
    return str(start.year)


def budget_status(conn: sqlite3.Connection, rules: list[Rule], owner_id: int | None = None,
                  today: date | None = None) -> dict:
    """This month's overall budget plus any per-category limits."""
    today = today or date.today()
    row = conn.execute("SELECT value FROM settings WHERE key = 'monthly_budget'").fetchone()
    budget = float(row["value"]) if row else None
    start = today.replace(day=1)
    txns = transactions(conn, rules, owner_id, since=start, until=add_months(start, 1))
    _, spent = money_in_out(txns)
    by_category: dict[str, float] = defaultdict(float)
    for txn in txns:
        if txn["spending"]:
            by_category[txn["category"]] += txn["amount"]
    days_in_month = (add_months(start, 1) - start).days
    return {
        "month": start.strftime("%B"),
        "budget": budget,
        "spent": spent,
        "left": None if budget is None else budget - spent,
        # How far through the month we are, so a bar can show "on pace" or "ahead".
        "month_progress": today.day / days_in_month,
        "categories": [
            {"name": r["category"], "budget": r["amount"], "spent": by_category.get(r["category"], 0.0),
             "left": r["amount"] - by_category.get(r["category"], 0.0)}
            for r in conn.execute("SELECT category, amount FROM budgets ORDER BY amount DESC")
        ],
    }


# ---------- Dashboard charts ----------

def net_worth_history(conn: sqlite3.Connection, owner_id: int | None = None, days: int = 180,
                      today: date | None = None) -> list[dict]:
    """Net worth for each of the last `days` days.

    Days with a saved balance for every account (one is saved on each sync) use the real
    total. Other days are rebuilt by undoing transactions from the next known day: spending
    lowers checking or raises a card balance, and both lower net worth by the same amount, so
    net worth the day before = that day's + that day's (positive = money out) amounts.
    Moves into investment accounts are skipped, because the brokerage side isn't tracked as a
    transaction and would look like a drop.
    """
    today = today or date.today()
    where, params = owner_filter(owner_id)
    first_day = (today - timedelta(days=days)).isoformat()
    daily: dict[str, float] = defaultdict(float)
    for row in conn.execute(
        f"""SELECT t.date, SUM(t.amount) AS total FROM transactions t JOIN accounts a USING (account_id)
            WHERE a.type != 'investment' AND a.current_balance IS NOT NULL AND t.date > ? {where}
              AND COALESCE(t.plaid_category, '') NOT LIKE '%INVESTMENT_AND_RETIREMENT_FUNDS'
            GROUP BY t.date""",
        (first_day, *params),
    ):
        daily[row["date"]] = row["total"]

    # An account whose balance we don't know (an imported card) is left out of the whole chart.
    account_count = conn.execute(f"SELECT COUNT(*) FROM accounts a WHERE a.current_balance IS NOT NULL {where}",
                                 params).fetchone()[0]
    snapshots = {}
    for row in conn.execute(
        f"""SELECT b.date, COUNT(*) AS accounts,
                   SUM(CASE WHEN a.type IN ('credit', 'loan') THEN -b.balance ELSE b.balance END) AS total
            FROM account_balances b JOIN accounts a USING (account_id)
            WHERE b.date >= ? {where} GROUP BY b.date""",
        (first_day, *params),
    ):
        if row["accounts"] == account_count:
            snapshots[row["date"]] = row["total"]

    value = balances(conn, owner_id)["net_worth"]
    points = []
    for back in range(days + 1):
        day = (today - timedelta(days=back)).isoformat()
        if back and day in snapshots:
            value = snapshots[day]
        points.append({"date": day, "value": round(value, 2)})
        value += daily.get(day, 0.0)
    return points[::-1]


def cumulative_spending(txns: list[dict], start: date, days: int) -> list[float]:
    by_day = [0.0] * days
    for txn in txns:
        if txn["spending"]:
            index = (date.fromisoformat(txn["date"]) - start).days
            if 0 <= index < days:
                by_day[index] += txn["amount"]
    running, result = 0.0, []
    for amount in by_day:
        running += amount
        result.append(round(running, 2))
    return result


def month_spending_pace(conn: sqlite3.Connection, rules: list[Rule], owner_id: int | None = None,
                        today: date | None = None) -> dict:
    """Running total of spending this month next to last month, day by day."""
    today = today or date.today()
    start = today.replace(day=1)
    last_start = add_months(start, -1)
    this_txns = transactions(conn, rules, owner_id, since=start, until=today + timedelta(days=1))
    last_txns = transactions(conn, rules, owner_id, since=last_start, until=start)
    this_month = cumulative_spending(this_txns, start, today.day)
    last_month = cumulative_spending(last_txns, last_start, (start - last_start).days)
    same_day = last_month[min(today.day, len(last_month)) - 1] if last_month else 0.0
    return {
        "this_month": this_month,
        "last_month": last_month,
        "spent": this_month[-1] if this_month else 0.0,
        "last_month_same_day": same_day,
        "days_in_month": (add_months(start, 1) - start).days,
    }


def forecast(conn: sqlite3.Connection, rules: list[Rule], owner_id: int | None = None, days: int = 30,
             today: date | None = None) -> dict:
    """Predict Net Cash (checking minus card balances) for the next `days` days.

    Known paychecks and bills land on their expected dates. Everything else you spend is spread
    evenly, using your average day of non-repeating spending over the last 90 days. That average
    skips anything tagged "one-off", and any bill category (like Rent) you added a bill for by hand,
    since that bill already lands on its own day.
    """
    today = today or date.today()
    found = recurring(conn, rules, owner_id, today=today)
    repeating = {merchant_key({"merchant": r["name"]}) if r["manual"] else r["key"] for r in found}
    # Only a category you picked yourself. The add-a-bill form leaves it blank, and a blank one shows as
    # "Bills & Utilities", which would drop every utility bill from the average for one $50 gym fee.
    picked = {row[0] for row in conn.execute("SELECT category FROM recurring_manual WHERE category IS NOT NULL")}
    covered = picked & BILL_CATEGORIES
    recent = transactions(conn, rules, owner_id, since=today - timedelta(days=90), until=today + timedelta(days=1))
    everyday = sum(t["amount"] for t in recent if t["spending"] and merchant_key(t) not in repeating
                   and t["category"] not in covered and ONE_OFF_TAG not in t["tags"])
    daily_spend = max(everyday, 0.0) / 90

    events = []
    horizon = today + timedelta(days=days)
    for item in found:
        # Due today or late means it hasn't posted yet, so it still comes out of the balance.
        due = max(date.fromisoformat(item["next_date"]), today + timedelta(days=1))
        change = item["amount"] if item["kind"] == "income" else -item["amount"]
        while due <= horizon:
            events.append({"date": due.isoformat(), "name": item["name"], "change": change, "kind": item["kind"]})
            # Monthly bills keep their day of the month instead of drifting by a fixed 30 days.
            due = add_months(due, 1) if item["frequency"] == "monthly" else due + timedelta(days=item["gap_days"])
    for plan in payment_plans(conn, owner_id, today):
        left = plan["unbilled"]
        for closing in statement_closings(today, horizon, plan["close_day"]):
            if left <= 0:
                break
            slice_ = min(plan["monthly"], left)
            events.append({"date": closing.isoformat(), "name": plan["name"], "change": -slice_, "kind": "bill"})
            left -= slice_
    events.sort(key=lambda e: e["date"])

    balance = balances(conn, owner_id, today)["net_cash"]
    points = [{"date": today.isoformat(), "value": round(balance, 2)}]
    for step in range(1, days + 1):
        day = (today + timedelta(days=step)).isoformat()
        balance += sum(e["change"] for e in events if e["date"] == day) - daily_spend
        points.append({"date": day, "value": round(balance, 2)})

    paydays = [e["date"] for e in events if e["kind"] == "income"]
    next_payday = paydays[0] if paydays else None
    bills_before_payday = sum(-e["change"] for e in events
                              if e["kind"] != "income" and (next_payday is None or e["date"] < next_payday))
    lowest = min(points, key=lambda p: p["value"])
    return {
        "points": points,
        "events": events,
        "daily_spend": daily_spend,
        "start": points[0]["value"],
        "end": points[-1]["value"],
        "lowest": lowest,
        "next_payday": next_payday,
        "safe_to_spend": points[0]["value"] - bills_before_payday,
    }
