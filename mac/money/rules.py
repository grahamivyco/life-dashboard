"""Sorting rules, kept in a plain text file you can read and edit.

One rule per line, first match wins:

    Costco > 300 -> Household
    Costco -> Groceries
    Venmo -> Transfer

The text before "->" is matched (ignoring case) against the store name and
description. An optional "> N" or "< N" checks the dollar amount.
"""

import re
from dataclasses import dataclass
from pathlib import Path

RULE_PATTERN = re.compile(
    r"^(?P<text>.+?)\s*(?:(?P<op>[<>])\s*\$?(?P<amount>\d+(?:\.\d+)?))?\s*->\s*(?P<category>.+?)\s*$"
)

# Categories that move money around rather than spend it.
CARD_PAYMENT = "Credit Card Payment"
INVESTING = "Investing"
# A card bill paid before that card's own history starts. The purchases are real spending we
# just can't see one by one, so the bill stands in for them.
UNSEEN_CARD_SPENDING = "Card purchases (no detail)"
MOVE_CATEGORIES = {"Transfer", CARD_PAYMENT, INVESTING}
NOT_SPENDING = MOVE_CATEGORIES | {"Income", "Ignored"}


def clean_category(name: str) -> str:
    """Trim a category and spell the special ones one way, so '-> transfer' still isn't spending."""
    name = name.strip()
    for special in NOT_SPENDING:
        if name.lower() == special.lower():
            return special
    return name

# Plaid's top-level categories, renamed to the names Rocket Money uses.
PLAID_PRIMARY_NAMES = {
    "INCOME": "Income",
    "TRANSFER_IN": "Transfer",
    "TRANSFER_OUT": "Transfer",
    "LOAN_PAYMENTS": "Loan Payments",
    "BANK_FEES": "Fees",
    "ENTERTAINMENT": "Entertainment & Rec.",
    "FOOD_AND_DRINK": "Dining & Drinks",
    "GENERAL_MERCHANDISE": "Shopping",
    "HOME_IMPROVEMENT": "Home & Garden",
    "MEDICAL": "Health & Wellness",
    "PERSONAL_CARE": "Personal Care",
    "GENERAL_SERVICES": "Services",
    "GOVERNMENT_AND_NON_PROFIT": "Taxes & Giving",
    "TRANSPORTATION": "Auto & Transport",
    "TRAVEL": "Travel & Vacation",
    "RENT_AND_UTILITIES": "Bills & Utilities",
}

# Paying off a card or moving money into a brokerage isn't new spending, but each gets its own name.
PLAID_DETAILED_NAMES = {
    "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT": CARD_PAYMENT,
    "TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS": INVESTING,
    "TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS": INVESTING,
    "FOOD_AND_DRINK_GROCERIES": "Groceries",
    "PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS": "Health & Wellness",
}

# Hidden from the spending ring when "Include bills" is off.
BILL_CATEGORIES = {"Rent", "Bills & Utilities", "Loan Payments"}


@dataclass
class Rule:
    line: int
    text: str
    op: str | None
    amount: float | None
    category: str

    def matches(self, haystack: str, amount: float) -> bool:
        if self.text.lower() not in haystack:
            return False
        if self.op == ">":
            return abs(amount) > self.amount
        if self.op == "<":
            return abs(amount) < self.amount
        return True


def parse(source: str) -> tuple[list[Rule], list[str]]:
    rules, errors = [], []
    for number, raw in enumerate(source.splitlines(), start=1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        match = RULE_PATTERN.match(line)
        if not match:
            errors.append(f"Line {number}: needs the form 'store name -> Category'")
            continue
        amount = match["amount"]
        rules.append(Rule(
            line=number,
            text=match["text"],
            op=match["op"],
            amount=float(amount) if amount else None,
            category=clean_category(match["category"]),
        ))
    return rules, errors


def load(path: Path) -> list[Rule]:
    rules, _ = parse(path.read_text())
    return rules


def plaid_category_name(plaid_category: str | None) -> str:
    if not plaid_category:
        return "Uncategorized"
    primary, _, detailed = plaid_category.partition("/")
    if detailed in PLAID_DETAILED_NAMES:
        return PLAID_DETAILED_NAMES[detailed]
    return PLAID_PRIMARY_NAMES.get(primary, "Uncategorized")


def categorize(txn: dict, rules: list[Rule]) -> tuple[str, str]:
    """Return (category, where it came from). Your own pick beats rules, rules beat Plaid."""
    if txn.get("category_override"):
        return txn["category_override"], "you"
    haystack = f"{txn.get('merchant') or ''} {txn['description']}".lower()
    for rule in rules:
        if rule.matches(haystack, txn["amount"]):
            return rule.category, f"rule on line {rule.line}"
    return plaid_category_name(txn.get("plaid_category")), "Plaid"


def add_rule(path: Path, text: str, category: str) -> None:
    """Add a rule above the existing ones, so a new choice beats older, broader rules."""
    text = re.sub(r"[<>\r\n]|->", " ", text).strip().lstrip("#").strip()
    category = clean_category(category.replace("->", " "))
    if not text or not category:
        raise ValueError("A rule needs both a store name and a category")
    lines = path.read_text().splitlines()
    insert_at = 0
    while insert_at < len(lines) and (not lines[insert_at].strip() or lines[insert_at].lstrip().startswith("#")):
        insert_at += 1
    lines.insert(insert_at, f"{text} -> {category}")
    path.write_text("\n".join(lines) + "\n")
