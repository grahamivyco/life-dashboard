"""Made-up sample data, so the dashboard can be built and tested without touching real accounts."""

import random
import sqlite3
from datetime import date, timedelta

ACCOUNTS = [
    # account_id, item_id, name, mask, type, subtype, balance
    ("demo-checking", "demo-bank", "Everyday Checking", "1111", "depository", "checking", 4210.55),
    ("demo-savings", "demo-bank", "High Yield Savings", "2222", "depository", "savings", 18250.00),
    ("demo-card", "demo-bank", "Rewards Card", "3333", "credit", "credit card", 1342.18),
    ("demo-brokerage", "demo-broker", "Individual Brokerage", "4444", "investment", "brokerage", 26480.40),
]

HOLDINGS = [
    ("demo-brokerage", "sec-voo", "VOO", "Vanguard S&P 500 ETF", 30, 540.10, 14000.00),
    ("demo-brokerage", "sec-qqq", "QQQ", "Invesco QQQ Trust", 15, 498.20, 6100.00),
    ("demo-brokerage", "sec-nvda", "NVDA", "NVIDIA Corp", 20, 128.55, 1900.00),
]

# description, merchant, plaid category, account, amount, every N days
REPEATS = [
    ("PAYROLL ACME INC", None, "INCOME/INCOME_WAGES", "demo-checking", -3150.00, 14),
    ("RENT - MAPLE APTS", "Maple Apartments", "RENT_AND_UTILITIES/RENT_AND_UTILITIES_RENT", "demo-checking", 2100.00, 30),
    ("NETFLIX.COM", "Netflix", "ENTERTAINMENT/ENTERTAINMENT_TV_AND_MOVIES", "demo-card", 15.49, 30),
    ("SPOTIFY USA", "Spotify", "ENTERTAINMENT/ENTERTAINMENT_MUSIC_AND_AUDIO", "demo-card", 11.99, 30),
    ("EQUINOX #221", "Equinox", "PERSONAL_CARE/PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS", "demo-card", 45.00, 30),
    ("PG&E WEB ONLINE", "PG&E", "RENT_AND_UTILITIES/RENT_AND_UTILITIES_GAS_AND_ELECTRICITY", "demo-checking", 96.00, 30),
    ("CHASE CARD AUTOPAY", None, "LOAN_PAYMENTS/LOAN_PAYMENTS_CREDIT_CARD_PAYMENT", "demo-checking", 1200.00, 30),
    ("VERIZON WIRELESS", "Verizon", "RENT_AND_UTILITIES/RENT_AND_UTILITIES_TELEPHONE", "demo-checking", 85.00, 30),
    ("APPLE.COM/BILL", "iCloud", "GENERAL_SERVICES/GENERAL_SERVICES_OTHER_GENERAL_SERVICES", "demo-card", 2.99, 30),
    ("ROBINHOOD DES:FUNDS", "Robinhood", "TRANSFER_OUT/TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS", "demo-checking", 250.00, 14),
]

# description, merchant, plaid category, low, high, chance per day
RANDOM = [
    ("TRADER JOE'S #123", "Trader Joe's", "FOOD_AND_DRINK/FOOD_AND_DRINK_GROCERIES", 35, 110, 0.15),
    ("COSTCO WHSE #0423", "Costco", "GENERAL_MERCHANDISE/GENERAL_MERCHANDISE_SUPERSTORES", 80, 420, 0.04),
    ("UBER *TRIP", "Uber", "TRANSPORTATION/TRANSPORTATION_TAXIS_AND_RIDE_SHARES", 12, 38, 0.12),
    ("SWEETGREEN SOMA", "Sweetgreen", "FOOD_AND_DRINK/FOOD_AND_DRINK_RESTAURANT", 14, 19, 0.2),
    ("AMAZON MKTPL*2K4", "Amazon", "GENERAL_MERCHANDISE/GENERAL_MERCHANDISE_ONLINE_MARKETPLACES", 9, 140, 0.1),
    ("SQ *BLUE BOTTLE", None, None, 5, 9, 0.25),
    ("VENMO PAYMENT 1023", "Venmo", "TRANSFER_OUT/TRANSFER_OUT_ACCOUNT_TRANSFER", 20, 80, 0.05),
    ("SHELL OIL 5744", "Shell", "TRANSPORTATION/TRANSPORTATION_GAS", 38, 64, 0.06),
    ("TARGET 00012", "Target", "GENERAL_MERCHANDISE/GENERAL_MERCHANDISE_SUPERSTORES", 15, 95, 0.05),
    ("CVS/PHARMACY #921", "CVS", "MEDICAL/MEDICAL_PHARMACIES_AND_SUPPLEMENTS", 8, 45, 0.03),
    ("AMC THEATRES", "AMC", "ENTERTAINMENT/ENTERTAINMENT_TV_AND_MOVIES", 18, 40, 0.02),
    ("DELTA AIR LINES", "Delta", "TRAVEL/TRAVEL_FLIGHTS", 180, 420, 0.006),
]


def fill(conn: sqlite3.Connection, days: int = 400, seed: int = 7) -> None:
    if conn.execute("SELECT 1 FROM items").fetchone():
        return
    rng = random.Random(seed)
    owner = conn.execute("SELECT id FROM owners ORDER BY id LIMIT 1").fetchone()["id"]
    conn.execute("INSERT INTO items (item_id, institution, kind) VALUES ('demo-bank', 'Demo Bank', 'banking')")
    conn.execute("INSERT INTO items (item_id, institution, kind) VALUES ('demo-broker', 'Demo Brokerage', 'investments')")
    for account_id, item_id, name, mask, kind, subtype, balance in ACCOUNTS:
        conn.execute(
            """INSERT INTO accounts (account_id, item_id, owner_id, name, mask, type, subtype, current_balance)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (account_id, item_id, owner, name, mask, kind, subtype, balance),
        )
    for account_id, security_id, ticker, name, quantity, price, cost_basis in HOLDINGS:
        conn.execute(
            """INSERT INTO holdings (account_id, security_id, ticker, name, quantity, price, value, cost_basis)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (account_id, security_id, ticker, name, quantity, price, quantity * price, cost_basis),
        )

    start = date.today() - timedelta(days=days)
    rows = []
    for index, (description, merchant, category, account, amount, every) in enumerate(REPEATS):
        day = start + timedelta(days=index)
        while day <= date.today():
            rows.append((day, description, merchant, category, account, amount))
            day += timedelta(days=every)
    for offset in range(days + 1):
        day = start + timedelta(days=offset)
        for description, merchant, category, low, high, chance in RANDOM:
            if rng.random() < chance:
                rows.append((day, description, merchant, category, "demo-card", round(rng.uniform(low, high), 2)))

    # A refund and a card reward, so negative spending shows up somewhere.
    rows.append((date.today() - timedelta(days=6), "AMAZON MKTPL REFUND", "Amazon",
                 "GENERAL_MERCHANDISE/GENERAL_MERCHANDISE_ONLINE_MARKETPLACES", "demo-card", -17.42))
    rows.append((date.today() - timedelta(days=9), "SPLITWISE DINNER", None, None, "demo-card", 36.05))

    recent = (date.today() - timedelta(days=1)).isoformat()
    for number, (day, description, merchant, category, account, amount) in enumerate(rows):
        conn.execute(
            """INSERT INTO transactions (transaction_id, account_id, date, description, merchant, amount,
                                         plaid_category, pending)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (f"demo-{number}", account, day.isoformat(), description, merchant, amount, category,
             int(day.isoformat() >= recent)),
        )
    conn.commit()
