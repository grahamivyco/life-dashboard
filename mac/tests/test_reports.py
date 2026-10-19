import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

from money import db, demo, reports, rules, server, sync


class ReportsTest(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.conn = db.connect(Path(self.folder.name) / "test.db")
        demo.fill(self.conn)
        self.rules = rules.parse("Costco > 300 -> Household\nCostco -> Groceries\n")[0]

    def tearDown(self):
        self.conn.close()
        self.folder.cleanup()

    def test_net_worth_subtracts_card_debt(self):
        b = reports.balances(self.conn)
        self.assertAlmostEqual(b["net_worth"], 4210.55 + 18250.00 + 26480.40 - 1342.18)
        self.assertAlmostEqual(b["net_cash"], 4210.55 - 1342.18)
        self.assertAlmostEqual(b["savings"], 18250.00)

    def test_transfers_and_income_are_not_spending(self):
        result = reports.spending(self.conn, self.rules, "month", offset=-1)
        names = {c["name"] for c in result["categories"]}
        self.assertNotIn("Transfer", names)
        self.assertNotIn("Income", names)
        self.assertGreater(result["spent"], 0)
        self.assertGreater(result["income"], 0)
        self.assertAlmostEqual(sum(c["share"] for c in result["categories"]), 1.0)

    def test_include_bills_off_drops_rent(self):
        with_bills = {c["name"] for c in reports.spending(self.conn, self.rules, "month", -1)["categories"]}
        without = {c["name"] for c in reports.spending(self.conn, self.rules, "month", -1, include_bills=False)["categories"]}
        self.assertIn("Bills & Utilities", with_bills)
        self.assertNotIn("Bills & Utilities", without)

    def test_only_card_refunds_count_as_refunds(self):
        before = reports.spending(self.conn, self.rules, "month")["refunds"]
        today = date.today().isoformat()
        for txn_id, account in (("store-refund", "demo-card"), ("rent-share", "demo-checking")):
            self.conn.execute("""INSERT INTO transactions (transaction_id, account_id, date, description, amount, plaid_category)
                                 VALUES (?, ?, ?, 'Money back', -20, 'GENERAL_MERCHANDISE/GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE')""",
                              (txn_id, account, today))
        after = reports.spending(self.conn, self.rules, "month")["refunds"]
        self.assertEqual(after["count"], before["count"] + 1)
        self.assertAlmostEqual(after["total"], before["total"] + 20)

    def test_periods_line_up(self):
        day = date(2026, 10, 16)  # a Friday
        self.assertEqual(reports.period_start("week", day), date(2026, 10, 11))
        self.assertEqual(reports.period_start("quarter", day), date(2026, 10, 1))
        self.assertEqual(reports.shift_period("month", date(2026, 1, 1), -1), date(2025, 12, 1))
        self.assertEqual(reports.shift_period("quarter", date(2026, 1, 1), -1), date(2025, 10, 1))

    def test_net_worth_history_ends_at_today(self):
        history = reports.net_worth_history(self.conn, days=30)
        self.assertEqual(len(history), 31)
        self.assertAlmostEqual(history[-1]["value"], reports.balances(self.conn)["net_worth"], places=2)

    def test_net_worth_history_undoes_spending(self):
        today = date.today()
        self.conn.execute("DELETE FROM transactions")
        self.conn.execute("""INSERT INTO transactions (transaction_id, account_id, date, description, amount)
                             VALUES ('x', 'demo-card', ?, 'TEST', 100)""", (today.isoformat(),))
        history = reports.net_worth_history(self.conn, days=2, today=today)
        self.assertAlmostEqual(history[0]["value"] - history[-1]["value"], 100)

    def test_paycheck_is_recurring_income(self):
        found = {r["name"]: r for r in reports.recurring(self.conn, self.rules)}
        self.assertEqual(found["PAYROLL ACME INC"]["kind"], "income")
        self.assertEqual(found["PAYROLL ACME INC"]["frequency"], "every 2 weeks")

    def test_forecast_lands_paychecks_and_bills(self):
        result = reports.forecast(self.conn, self.rules, days=30)
        self.assertEqual(len(result["points"]), 31)
        kinds = {e["kind"] for e in result["events"]}
        self.assertEqual(kinds, {"income", "bill", "transfer"})  # Robinhood moves out of checking
        self.assertIsNotNone(result["next_payday"])
        self.assertGreater(result["daily_spend"], 0)
        # Each day moves by exactly its events minus the daily spend.
        for before, after in zip(result["points"], result["points"][1:]):
            change = sum(e["change"] for e in result["events"] if e["date"] == after["date"])
            self.assertAlmostEqual(after["value"] - before["value"], change - result["daily_spend"], places=1)

    def test_finds_subscriptions(self):
        found = {r["name"]: r for r in reports.recurring(self.conn, self.rules)}
        self.assertEqual(found["Netflix"]["frequency"], "monthly")
        self.assertAlmostEqual(found["Netflix"]["amount"], 15.49)
        self.assertNotIn("Uber", found)  # random amounts are not a subscription

    def test_cancelled_subscription_drops_off(self):
        found = reports.recurring(self.conn, self.rules, today=date.today() + timedelta(days=200))
        self.assertEqual(found, [])

    def test_owner_filter(self):
        self.conn.execute("INSERT INTO owners (name) VALUES ('Partner')")
        partner = self.conn.execute("SELECT id FROM owners WHERE name = 'Partner'").fetchone()["id"]
        self.assertEqual(reports.transactions(self.conn, self.rules, owner_id=partner), [])
        self.assertEqual(reports.balances(self.conn, owner_id=partner)["net_worth"], 0)


if __name__ == "__main__":
    unittest.main()


class EditsTest(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.conn = db.connect(Path(self.folder.name) / "test.db")
        demo.fill(self.conn)

    def tearDown(self):
        self.conn.close()
        self.folder.cleanup()

    def add(self, txn_id, amount, category=None, account="demo-card", day=None):
        self.conn.execute(
            """INSERT INTO transactions (transaction_id, account_id, date, description, amount, plaid_category)
               VALUES (?, ?, ?, 'TEST STORE', ?, ?)""",
            (txn_id, account, (day or date.today()).isoformat(), amount, category))

    def test_hidden_keeps_category_but_is_not_spending(self):
        self.add("h", 500, "GENERAL_MERCHANDISE/GENERAL_MERCHANDISE_OTHER")
        before = reports.spending(self.conn, [], "month")["spent"]
        self.conn.execute("UPDATE transactions SET hidden = 1 WHERE transaction_id = 'h'")
        after = reports.spending(self.conn, [], "month")
        self.assertAlmostEqual(before - after["spent"], 500)
        txn = next(t for t in reports.transactions(self.conn, []) if t["transaction_id"] == "h")
        self.assertEqual(txn["category"], "Shopping")
        self.assertGreaterEqual(after["ignored"], 500)

    def test_edits_survive_pending_to_posted(self):
        self.add("pending-1", 20)
        self.conn.execute("""UPDATE transactions SET category_override = 'Coffee', note = 'with Sam', tags = 'reimbursable'
                             WHERE transaction_id = 'pending-1'""")
        self.add("posted-1", 20)
        sync.carry_edits(self.conn, "pending-1", "posted-1")
        row = self.conn.execute("SELECT * FROM transactions WHERE transaction_id = 'posted-1'").fetchone()
        self.assertEqual((row["category_override"], row["note"], row["tags"]), ("Coffee", "with Sam", "reimbursable"))

    def test_search_covers_all_history(self):
        found = reports.transactions(self.conn, [], search="netflix")
        self.assertGreater(len({t["date"][:7] for t in found}), 3)

    def test_moving_money_to_brokerage_is_not_a_net_worth_drop(self):
        self.conn.execute("DELETE FROM transactions")
        self.add("move", 1000, "TRANSFER_OUT/TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS", account="demo-checking")
        history = reports.net_worth_history(self.conn, days=2)
        self.assertAlmostEqual(history[0]["value"], history[-1]["value"])

    def test_saved_balances_override_rebuilt_history(self):
        day = (date.today() - timedelta(days=5)).isoformat()
        for account_id, balance in [("demo-checking", 100), ("demo-savings", 200), ("demo-card", 50), ("demo-brokerage", 1000)]:
            self.conn.execute("INSERT INTO account_balances VALUES (?, ?, ?)", (account_id, day, balance))
        history = {p["date"]: p["value"] for p in reports.net_worth_history(self.conn, days=10)}
        self.assertAlmostEqual(history[day], 100 + 200 - 50 + 1000)

    def test_tags_feed_tax_and_reimbursement_totals(self):
        self.add("t1", 80)
        self.conn.execute("UPDATE transactions SET tags = 'tax-deductible' WHERE transaction_id = 't1'")
        result = reports.spending(self.conn, [], "month")
        self.assertAlmostEqual(result["tax_deductible"], 80)
        self.assertIn({"name": "tax-deductible", "spent": 80}, result["tags"])


class ServerEditTest(unittest.TestCase):
    def test_clean_edit_only_allows_known_fields(self):
        with self.assertRaises(ValueError):
            server.clean_edit({"amount": 5})
        edit = server.clean_edit({"hidden": "yes", "tags": ["Tax-Deductible", "x<y", ""], "note": "  "})
        self.assertEqual(edit, {"hidden": 1, "tags": "tax-deductible,xy", "note": None})


class BudgetTest(unittest.TestCase):
    def test_category_budget_tracks_spending(self):
        folder = tempfile.TemporaryDirectory()
        conn = db.connect(Path(folder.name) / "test.db")
        demo.fill(conn)
        conn.execute("INSERT INTO budgets VALUES ('Dining & Drinks', 50)")
        status = reports.budget_status(conn, [])
        dining = status["categories"][0]
        month = reports.spending(conn, [], "month")
        spent = next((c["spent"] for c in month["categories"] if c["name"] == "Dining & Drinks"), 0.0)
        self.assertEqual(dining["name"], "Dining & Drinks")
        self.assertAlmostEqual(dining["spent"], spent)
        self.assertAlmostEqual(dining["left"], 50 - spent)
        conn.close()
        folder.cleanup()


class RecurringEditTest(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.conn = db.connect(Path(self.folder.name) / "test.db")
        demo.fill(self.conn)

    def tearDown(self):
        self.conn.close()
        self.folder.cleanup()

    def test_ignored_repeat_drops_off_and_forecast(self):
        netflix = next(r for r in reports.recurring(self.conn, []) if r["name"] == "Netflix")
        self.conn.execute("INSERT INTO recurring_ignored VALUES (?)", (netflix["key"],))
        names = {r["name"] for r in reports.recurring(self.conn, [])}
        self.assertNotIn("Netflix", names)
        self.assertNotIn("Netflix", {e["name"] for e in reports.forecast(self.conn, [])["events"]})
        shown = {r["name"]: r for r in reports.recurring(self.conn, [], include_ignored=True)}
        self.assertTrue(shown["Netflix"]["ignored"])

    def test_hand_added_bill_rolls_forward_and_hits_forecast(self):
        past = (date.today() - timedelta(days=40)).isoformat()
        self.conn.execute("""INSERT INTO recurring_manual (name, kind, amount, frequency, next_date)
                             VALUES ('Car insurance', 'bill', 120, 'monthly', ?)""", (past,))
        item = next(r for r in reports.recurring(self.conn, []) if r["name"] == "Car insurance")
        self.assertGreaterEqual(item["next_date"], date.today().isoformat())
        self.assertIn("Car insurance", {e["name"] for e in reports.forecast(self.conn, [])["events"]})

    def test_renamed_bill_is_not_counted_twice(self):
        before = reports.forecast(self.conn, [])
        self.conn.execute("UPDATE transactions SET name_override = 'Rent' WHERE merchant = 'Maple Apartments'")
        after = reports.forecast(self.conn, [])
        self.assertAlmostEqual(before["daily_spend"], after["daily_spend"])
        self.assertAlmostEqual(before["end"], after["end"])

    def test_bill_due_today_stays_in_forecast(self):
        rent = next(r for r in reports.recurring(self.conn, []) if r["name"] == "Maple Apartments")
        due = date.fromisoformat(rent["next_date"])
        result = reports.forecast(self.conn, [], today=due)
        rent_dates = [e["date"] for e in result["events"] if e["name"] == "Maple Apartments"]
        self.assertEqual(rent_dates[0], (due + timedelta(days=1)).isoformat())

    def test_payment_plan_stays_out_of_net_cash_until_billed(self):
        # Like the Amazon card: $506.67 left at $46.07 a statement, statements close on the 14th.
        self.conn.execute("INSERT INTO payment_plans (account_id, name, monthly, remaining, as_of, close_day) "
                          "VALUES ('demo-card', 'Equal Pay', 46.07, 506.67, '2026-10-14', 14)")
        today = date(2026, 10, 19)
        b = reports.balances(self.conn, today=today)
        self.assertAlmostEqual(b["on_plans"], 506.67)
        self.assertAlmostEqual(b["net_cash"], 4210.55 - 1342.18 + 506.67)
        self.assertAlmostEqual(b["owed"], 1342.18)  # still owed in full
        # One slice lands on each statement close inside the forecast.
        result = reports.forecast(self.conn, [], today=today, days=60)
        slices = [(e["date"], e["change"]) for e in result["events"] if e["name"] == "Equal Pay"]
        self.assertEqual(slices, [("2026-11-14", -46.07), ("2026-12-14", -46.07)])
        # A month later one slice has been billed, and the plan never goes below zero.
        self.assertAlmostEqual(reports.balances(self.conn, today=date(2026, 11, 20))["on_plans"], 506.67 - 46.07)
        self.assertEqual(reports.balances(self.conn, today=date(2028, 1, 1))["on_plans"], 0)

    def test_daily_spend_skips_one_offs_and_hand_added_bill_categories(self):
        today = date.today()
        before = reports.forecast(self.conn, [], today=today)["daily_spend"]
        self.conn.execute("INSERT INTO accounts (account_id, item_id, owner_id, name, type, current_balance) "
                          "SELECT 'extra-card', item_id, owner_id, 'Extra', 'credit', 0 FROM accounts LIMIT 1")
        day = (today - timedelta(days=10)).isoformat()
        self.conn.execute("INSERT INTO transactions (transaction_id, account_id, date, description, amount, category_override, tags) "
                          "VALUES ('truck', 'extra-card', ?, 'U-HAUL', 900, 'Services', 'one-off')", (day,))
        self.conn.execute("INSERT INTO transactions (transaction_id, account_id, date, description, amount, category_override) "
                          "VALUES ('venmo-rent', 'extra-card', ?, 'VENMO', 1800, 'Rent')", (day,))
        # Rent counts in the average until a hand-added rent bill takes it over.
        self.assertAlmostEqual(reports.forecast(self.conn, [], today=today)["daily_spend"], before + 1800 / 90)
        self.conn.execute("INSERT INTO recurring_manual (name, kind, amount, frequency, next_date, category) "
                          "VALUES ('My rent', 'bill', 1800, 'monthly', ?, 'Rent')", ((today + timedelta(days=5)).isoformat(),))
        rent_free = reports.forecast(self.conn, [], today=today)
        self.assertAlmostEqual(rent_free["daily_spend"], before)  # back to the start: the one-off truck never counted
        # A bill added from the form has no category; it must not wipe out a whole category.
        self.conn.execute("INSERT INTO transactions (transaction_id, account_id, date, description, amount, category_override) "
                          "VALUES ('power', 'extra-card', ?, 'CITY LIGHT', 90, 'Bills & Utilities')", (day,))
        self.conn.execute("INSERT INTO recurring_manual (name, kind, amount, frequency, next_date) "
                          "VALUES ('Gym', 'bill', 50, 'monthly', ?)", ((today + timedelta(days=5)).isoformat(),))
        self.assertAlmostEqual(reports.forecast(self.conn, [], today=today)["daily_spend"], before + 90 / 90)
        self.assertIn("My rent", {e["name"] for e in rent_free["events"]})

    def test_statement_closings_use_last_day_of_short_months(self):
        closings = reports.statement_closings(date(2027, 1, 31), date(2027, 3, 31), 31)
        self.assertEqual(closings, [date(2027, 2, 28), date(2027, 3, 31)])

    def test_tag_filter_matches_whole_tags_only(self):
        ids = [r["transaction_id"] for r in self.conn.execute("SELECT transaction_id FROM transactions LIMIT 2")]
        self.conn.execute("UPDATE transactions SET tags = 'tax-deductible' WHERE transaction_id = ?", (ids[0],))
        self.conn.execute("UPDATE transactions SET tags = 'tax-deductible-ish' WHERE transaction_id = ?", (ids[1],))
        found = reports.transactions(self.conn, [], tag="tax-deductible")
        self.assertEqual([t["transaction_id"] for t in found], [ids[0]])

    def test_card_payments_are_not_forecast_transfers(self):
        moves = [r for r in reports.recurring(self.conn, []) if r["kind"] == "transfer"]
        self.assertEqual([r["name"] for r in moves], ["Robinhood"])

    def add_robinhood_withdrawal(self, amount, card_paid_days_later=None):
        """Robinhood takes money for both its card and its brokerage, under the same name."""
        today = date.today()
        self.conn.execute("""INSERT INTO transactions (transaction_id, account_id, date, description, merchant, amount, plaid_category)
                             VALUES ('rh', 'demo-checking', ?, 'Robinhood', 'Robinhood', ?,
                                     'TRANSFER_OUT/TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS')""",
                          (today.isoformat(), amount))
        if card_paid_days_later is not None:
            self.add_robinhood_card(history_starts_in_days=-60)
            self.conn.execute("""INSERT INTO transactions (transaction_id, account_id, date, description, amount, plaid_category)
                                 VALUES ('paid', 'rh-card', ?, 'Payment', ?, 'LOAN_PAYMENTS/LOAN_PAYMENTS_CREDIT_CARD_PAYMENT')""",
                              ((today + timedelta(days=card_paid_days_later)).isoformat(), -amount))

    def category_of(self, txn_id, rule_list=()):
        return next(t["category"] for t in reports.transactions(self.conn, list(rule_list)) if t["transaction_id"] == txn_id)

    def test_withdrawal_matching_a_card_payment_is_a_card_payment(self):
        self.add_robinhood_withdrawal(1848.11, card_paid_days_later=2)
        robinhood_rule = rules.parse("Robinhood -> Investing\n")[0]
        self.assertEqual(self.category_of("rh", robinhood_rule), "Credit Card Payment")

    def test_withdrawal_with_no_card_payment_is_investing(self):
        self.add_robinhood_withdrawal(500, card_paid_days_later=20)
        self.assertEqual(self.category_of("rh"), "Investing")

    def test_one_card_payment_matches_one_withdrawal(self):
        self.add_robinhood_withdrawal(500, card_paid_days_later=1)
        self.conn.execute("""INSERT INTO transactions (transaction_id, account_id, date, description, merchant, amount, plaid_category)
                             VALUES ('rh2', 'demo-checking', ?, 'Robinhood', 'Robinhood', 500,
                                     'TRANSFER_OUT/TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS')""",
                          ((date.today() + timedelta(days=1)).isoformat(),))
        self.assertEqual({self.category_of("rh"), self.category_of("rh2")}, {"Credit Card Payment", "Investing"})

    def test_other_withdrawal_of_the_same_amount_cannot_take_the_match(self):
        self.conn.execute("""INSERT INTO transactions (transaction_id, account_id, date, description, amount, plaid_category)
                             VALUES ('cashout', 'demo-checking', ?, 'Standard transfer', 500,
                                     'TRANSFER_OUT/TRANSFER_OUT_ACCOUNT_TRANSFER')""", ((date.today() - timedelta(days=1)).isoformat(),))
        self.add_robinhood_withdrawal(500, card_paid_days_later=1)
        self.assertEqual(self.category_of("rh"), "Credit Card Payment")
        self.assertEqual(self.category_of("cashout"), "Transfer")

    def test_purchase_with_a_card_payments_amount_stays_spending(self):
        self.add_robinhood_withdrawal(500, card_paid_days_later=1)
        self.conn.execute("UPDATE transactions SET plaid_category = 'RENT_AND_UTILITIES/RENT_AND_UTILITIES_RENT' WHERE transaction_id = 'rh'")
        self.assertEqual(self.category_of("rh"), "Bills & Utilities")

    def add_robinhood_card(self, history_starts_in_days):
        """A linked Robinhood card whose own history only begins some days from today."""
        self.conn.execute("INSERT INTO items (item_id, institution, kind) VALUES ('rh-item', 'Robinhood', 'banking')")
        self.conn.execute("""INSERT INTO accounts (account_id, item_id, owner_id, name, type, subtype, current_balance)
                             VALUES ('rh-card', 'rh-item', 1, 'Robinhood Card', 'credit', 'credit card', 0)""")
        self.conn.execute("""INSERT INTO transactions (transaction_id, account_id, date, description, amount)
                             VALUES ('first', 'rh-card', ?, 'Coffee', 5)""",
                          ((date.today() + timedelta(days=history_starts_in_days)).isoformat(),))

    def test_card_bill_before_card_history_counts_as_spending(self):
        self.add_robinhood_card(history_starts_in_days=30)
        self.add_robinhood_withdrawal(3135.42)
        txn = next(t for t in reports.transactions(self.conn, []) if t["transaction_id"] == "rh")
        self.assertEqual(txn["category"], "Card purchases (no detail)")
        self.assertTrue(txn["spending"])

    def test_cents_withdrawal_once_card_history_exists_needs_a_match(self):
        self.add_robinhood_card(history_starts_in_days=-30)
        self.add_robinhood_withdrawal(1234.56)
        self.assertEqual(self.category_of("rh"), "Investing")

    def test_round_deposit_to_a_card_company_stays_investing(self):
        self.add_robinhood_card(history_starts_in_days=30)
        self.add_robinhood_withdrawal(1500)
        self.assertEqual(self.category_of("rh"), "Investing")

    def test_cents_withdrawal_to_a_company_with_no_card_stays_investing(self):
        self.add_robinhood_withdrawal(3135.42)
        self.assertEqual(self.category_of("rh"), "Investing")

    def test_payment_on_the_card_is_not_income(self):
        self.conn.execute("""INSERT INTO transactions (transaction_id, account_id, date, description, amount, plaid_category)
                             VALUES ('thanks', 'demo-card', ?, 'AUTOMATIC PAYMENT - THANK', -200, 'INCOME/INCOME_CONTRACTOR')""",
                          (date.today().isoformat(),))
        self.assertEqual(self.category_of("thanks"), "Credit Card Payment")
        self.assertEqual(self.category_of("thanks", rules.parse("AUTOMATIC PAYMENT -> Income\n")[0]), "Income")

    def test_card_name_inside_another_word_does_not_count(self):
        self.conn.execute("INSERT INTO items (item_id, institution, kind) VALUES ('chase-item', 'Chase', 'banking')")
        self.conn.execute("""INSERT INTO accounts (account_id, item_id, owner_id, name, type, subtype, current_balance)
                             VALUES ('chase-card', 'chase-item', 1, 'Chase Card', 'credit', 'credit card', 0)""")
        self.conn.execute("""INSERT INTO transactions (transaction_id, account_id, date, description, amount)
                             VALUES ('later', 'chase-card', ?, 'Coffee', 5)""", ((date.today() + timedelta(days=30)).isoformat(),))
        self.conn.execute("""INSERT INTO transactions (transaction_id, account_id, date, description, amount, plaid_category)
                             VALUES ('move', 'demo-checking', ?, 'Purchase of savings bond', 250.55,
                                     'TRANSFER_OUT/TRANSFER_OUT_ACCOUNT_TRANSFER')""", (date.today().isoformat(),))
        self.assertEqual(self.category_of("move"), "Transfer")

    def test_card_bill_stand_in_is_not_a_recurring_bill(self):
        self.add_robinhood_card(history_starts_in_days=30)
        for months_ago in range(4):
            self.conn.execute("""INSERT INTO transactions (transaction_id, account_id, date, description, merchant, amount, plaid_category)
                                 VALUES (?, 'demo-checking', ?, 'Robinhood', 'Robinhood', 3100.25,
                                         'TRANSFER_OUT/TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS')""",
                              (f"bill{months_ago}", (date.today() - timedelta(days=30 * months_ago)).isoformat()))
        self.assertNotIn("Robinhood", [r["name"] for r in reports.recurring(self.conn, []) if r["kind"] == "bill"])

    def test_your_own_pick_beats_the_card_match(self):
        self.add_robinhood_withdrawal(500, card_paid_days_later=1)
        self.conn.execute("UPDATE transactions SET category_override = 'Investing' WHERE transaction_id = 'rh'")
        self.assertEqual(self.category_of("rh"), "Investing")

    def test_hand_added_bill_not_also_everyday_spending(self):
        before = reports.forecast(self.conn, [])["daily_spend"]
        self.conn.execute("""INSERT INTO recurring_manual (name, kind, amount, frequency, next_date)
                             VALUES ('Costco', 'bill', 200, 'monthly', ?)""", (date.today().isoformat(),))
        self.assertLess(reports.forecast(self.conn, [])["daily_spend"], before)

    def test_merchant_filter_is_exact(self):
        names = {t["name"] for t in reports.transactions(self.conn, [], merchant="Shell")}
        self.assertEqual(names, {"Shell"})

    def test_tagged_paycheck_is_not_tag_spending(self):
        pay = self.conn.execute("SELECT transaction_id FROM transactions WHERE amount < 0 LIMIT 1").fetchone()[0]
        self.conn.execute("UPDATE transactions SET tags = 'work' WHERE transaction_id = ?", (pay,))
        self.assertEqual(reports.tag_totals(reports.transactions(self.conn, [])), [])

    def test_monthly_bill_keeps_its_day_in_forecast(self):
        today = date(2026, 10, 16)
        self.conn.execute("""INSERT INTO recurring_manual (name, kind, amount, frequency, next_date)
                             VALUES ('Gym', 'bill', 50, 'monthly', '2026-10-17')""")
        days = [e["date"] for e in reports.forecast(self.conn, [], days=70, today=today)["events"] if e["name"] == "Gym"]
        self.assertEqual(days, ["2026-10-17", "2026-11-17", "2026-12-17"])

    def test_switched_off_account_leaves_every_total(self):
        before = reports.balances(self.conn)
        card = self.conn.execute("SELECT account_id, current_balance FROM accounts WHERE type = 'credit'").fetchone()
        self.conn.execute("UPDATE accounts SET hidden = 1 WHERE account_id = ?", (card["account_id"],))
        after = reports.balances(self.conn)
        self.assertEqual(after["card"], 0)
        self.assertAlmostEqual(after["net_worth"], before["net_worth"] + card["current_balance"])
        self.assertFalse(any(t["account_id"] == card["account_id"] for t in reports.transactions(self.conn, [])))
        self.assertNotIn(card["account_id"], {a["account_id"] for a in reports.accounts(self.conn)})
        self.assertIn(card["account_id"], {a["account_id"] for a in reports.accounts(self.conn, include_hidden=True)})

    def test_power_bill_that_varies_still_counts(self):
        for i, amount in enumerate([60, 140, 90, 180]):
            day = date.today() - timedelta(days=30 * (4 - i))
            self.conn.execute("""INSERT INTO transactions (transaction_id, account_id, date, description, merchant, amount, plaid_category)
                                 VALUES (?, 'demo-checking', ?, 'CITY POWER', 'City Power', ?,
                                         'RENT_AND_UTILITIES/RENT_AND_UTILITIES_GAS_AND_ELECTRICITY')""",
                              (f"power-{i}", day.isoformat(), amount))
        found = {r["name"]: r for r in reports.recurring(self.conn, [])}
        self.assertTrue(found["City Power"]["varies"])

    def test_add_months_keeps_the_day(self):
        self.assertEqual(reports.add_months(date(2026, 1, 31), 1), date(2026, 2, 28))
        self.assertEqual(reports.add_months(date(2026, 11, 15), 2), date(2027, 1, 15))
