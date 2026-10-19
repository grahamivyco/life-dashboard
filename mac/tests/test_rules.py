import tempfile
import unittest
from pathlib import Path

from money import rules


class ParseTest(unittest.TestCase):
    def test_reads_rules_and_skips_comments(self):
        parsed, errors = rules.parse("# note\n\nCostco > 300 -> Household\nCostco -> Groceries\n")
        self.assertEqual(errors, [])
        self.assertEqual([(r.text, r.op, r.amount, r.category) for r in parsed],
                         [("Costco", ">", 300.0, "Household"), ("Costco", None, None, "Groceries")])

    def test_reports_bad_lines(self):
        _, errors = rules.parse("Costco Groceries\n")
        self.assertEqual(len(errors), 1)
        self.assertIn("Line 1", errors[0])


class CategorizeTest(unittest.TestCase):
    RULES = rules.parse("Costco > 300 -> Household\nCostco -> Groceries\n")[0]

    def txn(self, **fields):
        return {"description": "COSTCO WHSE #1", "merchant": "Costco", "amount": 50.0,
                "plaid_category": None, "category_override": None, **fields}

    def test_first_matching_rule_wins(self):
        self.assertEqual(rules.categorize(self.txn(amount=450.0), self.RULES)[0], "Household")
        self.assertEqual(rules.categorize(self.txn(amount=45.0), self.RULES)[0], "Groceries")

    def test_your_pick_beats_rules(self):
        self.assertEqual(rules.categorize(self.txn(category_override="Gifts"), self.RULES), ("Gifts", "you"))

    def test_falls_back_to_plaid(self):
        txn = self.txn(description="UBER", merchant="Uber", plaid_category="TRANSPORTATION/TRANSPORTATION_TAXIS")
        self.assertEqual(rules.categorize(txn, self.RULES), ("Auto & Transport", "Plaid"))

    def test_card_payment_gets_its_own_name(self):
        txn = self.txn(description="AUTOPAY", merchant=None,
                       plaid_category="LOAN_PAYMENTS/LOAN_PAYMENTS_CREDIT_CARD_PAYMENT")
        self.assertEqual(rules.categorize(txn, [])[0], "Credit Card Payment")

    def test_brokerage_deposit_is_investing(self):
        txn = self.txn(description="ROBINHOOD", merchant="Robinhood",
                       plaid_category="TRANSFER_OUT/TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS")
        self.assertEqual(rules.categorize(txn, [])[0], "Investing")


class AddRuleTest(unittest.TestCase):
    def test_new_rule_goes_above_old_rules(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "rules.txt"
            path.write_text("# header\n\nCostco -> Groceries\n")
            rules.add_rule(path, "Costco Gas", "Car")
            parsed = rules.load(path)
            self.assertEqual([r.category for r in parsed], ["Car", "Groceries"])
            self.assertTrue(path.read_text().startswith("# header\n"))

    def test_strips_characters_that_would_break_the_file(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "rules.txt"
            path.write_text("")
            rules.add_rule(path, "A->B > 5", "Fun")
            parsed, errors = rules.parse(path.read_text())
            self.assertEqual(errors, [])
            self.assertEqual(parsed[0].op, None)

    def test_leading_hash_does_not_turn_rule_into_comment(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "rules.txt"
            path.write_text("")
            rules.add_rule(path, "#1 Pizza", "Food")
            self.assertEqual([r.text for r in rules.load(path)], ["1 Pizza"])


class SpecialCategoryTest(unittest.TestCase):
    def test_lowercase_transfer_is_still_not_spending(self):
        parsed, _ = rules.parse("venmo -> transfer\n")
        self.assertIn(parsed[0].category, rules.NOT_SPENDING)


if __name__ == "__main__":
    unittest.main()


class DepositTests(unittest.TestCase):
    def test_check_deposit_is_income(self):
        txn = {"description": "Check Deposit From VIVIEN SMITH", "merchant": None, "amount": -200.0,
               "plaid_category": "TRANSFER_IN/TRANSFER_IN_ACCOUNT_TRANSFER"}
        self.assertEqual(rules.categorize(txn, [])[0], "Income")

    def test_deposit_category_is_income(self):
        self.assertEqual(rules.plaid_category_name("TRANSFER_IN/TRANSFER_IN_DEPOSIT"), "Income")

    def test_own_rule_still_wins(self):
        txn = {"description": "Check Deposit From ME", "merchant": None, "amount": -200.0, "plaid_category": None}
        self.assertEqual(rules.categorize(txn, rules.parse("From ME -> Transfer")[0])[0], "Transfer")
