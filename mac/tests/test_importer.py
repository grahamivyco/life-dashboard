import tempfile
import unittest
from pathlib import Path
from unittest import mock

from money import db, importer, reports, sync

EXPORT = """Transaction Date,Clearing Date,Description,Merchant,Category,Type,Amount (USD),Purchased By
10/01/2026,10/02/2026,"BLUE BOTTLE 1","Blue Bottle","Restaurants","Purchase","5.00","Me"
10/01/2026,10/02/2026,"BLUE BOTTLE 1","Blue Bottle","Restaurants","Purchase","5.00","Me"
10/02/2026,10/02/2026,"SOME STORE","Shell","Other","Purchase","40.00","Me"
09/30/2026,09/30/2026,"ACH DEPOSIT INTERNET TRANSFER","Ach Deposit","Payment","Payment","-98.05","Me"
"""


ROBINHOOD = """Date,Time,Cardholder,Amount,Points,Balance,Status,Type,Merchant,Description
2026-10-02,"1:00 PM","Me",9.00,27,,Posted,Purchase,Shell,
2026-09-20,"1:00 PM","Me",12.00,36,,Pending,Purchase,Shell,
2026-09-14,"9:00 AM","Me",-3135.42,0,,Posted,Payment,Payment,"PAYMENT - THANK YOU"
2026-09-03,"1:00 PM","Me",40.00,120,,Posted,Purchase,Shell,
"""


class RobinhoodCardImportTest(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.conn = db.connect(Path(self.folder.name) / "test.db")
        self.conn.execute("INSERT INTO items (item_id, institution, kind) VALUES ('rh', 'Robinhood', 'banking')")
        self.conn.execute("""INSERT INTO accounts (account_id, item_id, owner_id, name, type, subtype, current_balance)
                             VALUES ('rh-card', 'rh', 1, 'Robinhood Credit Card', 'credit', 'credit card', 0)""")
        self.conn.execute("""INSERT INTO accounts (account_id, item_id, owner_id, name, type, subtype, current_balance)
                             VALUES ('checking', 'rh', 1, 'Checking', 'depository', 'checking', 0)""")
        # Plaid's copy of the card starts Oct 1 and already has the Shell charge from Oct 2.
        self.conn.execute("""INSERT INTO transactions (transaction_id, account_id, date, description, merchant, amount, plaid_category)
                             VALUES ('plaid-shell', 'rh-card', '2026-10-02', 'Shell', 'Shell', 9, 'TRANSPORTATION/TRANSPORTATION_GAS')""")
        # A round-dollar-looking bill paid from checking under the name "Robinhood".
        self.conn.execute("""INSERT INTO transactions (transaction_id, account_id, date, description, merchant, amount, plaid_category)
                             VALUES ('bill', 'checking', '2026-09-13', 'Robinhood', 'Robinhood', 3135.42,
                                     'TRANSFER_OUT/TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS')""")
        self.path = Path(self.folder.name) / "robinhood.csv"
        self.path.write_text(ROBINHOOD)

    def tearDown(self):
        self.conn.close()
        self.folder.cleanup()

    def test_fills_in_only_what_plaid_is_missing(self):
        self.assertEqual(importer.import_file(self.conn, self.path), ("Robinhood card", 2))
        self.assertEqual(importer.import_file(self.conn, self.path)[1], 0)

    def test_plaid_filling_in_older_weeks_drops_the_imported_copy(self):
        importer.import_file(self.conn, self.path)
        self.conn.execute("""INSERT INTO transactions (transaction_id, account_id, date, description, merchant, amount)
                             VALUES ('plaid-old', 'rh-card', '2026-09-03', 'Shell', 'Shell', 40)""")
        importer.drop_overlap(self.conn)
        on_that_day = self.conn.execute("SELECT COUNT(*) FROM transactions WHERE date = '2026-09-03'").fetchone()[0]
        self.assertEqual(on_that_day, 1)

    def test_needs_plaids_copy_first(self):
        self.conn.execute("DELETE FROM transactions WHERE account_id = 'rh-card'")
        with self.assertRaises(ValueError):
            importer.import_file(self.conn, self.path)

    def test_purchase_posted_on_plaids_first_day_is_not_doubled(self):
        self.path.write_text(ROBINHOOD.replace("2026-10-02,", "2026-09-30,"))  # bought Sep 30, Plaid dates it Oct 2
        importer.import_file(self.conn, self.path)
        nines = self.conn.execute("SELECT COUNT(*) FROM transactions WHERE amount = 9").fetchone()[0]
        self.assertEqual(nines, 1)

    def test_old_bill_pairs_with_the_cards_payment(self):
        importer.import_file(self.conn, self.path)
        found = {t["transaction_id"]: t for t in reports.transactions(self.conn, [])}
        self.assertEqual(found["bill"]["category"], "Credit Card Payment")
        old_gas = next(t for t in found.values() if t["date"] == "2026-09-03")
        self.assertEqual(old_gas["category"], "Auto & Transport")  # borrowed from Plaid's label for Shell


class AppleCardImportTest(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.conn = db.connect(Path(self.folder.name) / "test.db")
        self.conn.execute("INSERT INTO items (item_id, institution, kind) VALUES ('bank', 'Bank', 'banking')")
        self.conn.execute("""INSERT INTO accounts (account_id, item_id, owner_id, name, type, subtype)
                             VALUES ('checking', 'bank', 1, 'Checking', 'depository', 'checking')""")
        self.conn.execute("""INSERT INTO transactions (transaction_id, account_id, date, description, merchant, amount, plaid_category)
                             VALUES ('gas', 'checking', '2026-09-01', 'SHELL', 'Shell', 30, 'TRANSPORTATION/TRANSPORTATION_GAS')""")
        self.path = Path(self.folder.name) / "apple.csv"
        self.path.write_text(EXPORT)

    def tearDown(self):
        self.conn.close()
        self.folder.cleanup()

    def categories(self):
        return {t["description"]: t["category"] for t in reports.transactions(self.conn, [])
                if t["account_id"] == importer.APPLE_ACCOUNT}

    def test_import_keeps_repeats_and_skips_rows_already_in(self):
        self.assertEqual(importer.import_file(self.conn, self.path)[1], 4)
        self.assertEqual(importer.import_file(self.conn, self.path)[1], 0)

    def test_categories_carry_over(self):
        importer.import_file(self.conn, self.path)[1]
        found = self.categories()
        self.assertEqual(found["BLUE BOTTLE 1"], "Dining & Drinks")
        self.assertEqual(found["SOME STORE"], "Auto & Transport")  # "Other" borrows Plaid's label for Shell
        self.assertEqual(found["ACH DEPOSIT INTERNET TRANSFER"], "Credit Card Payment")

    def test_sync_leaves_imported_cards_alone(self):
        importer.import_file(self.conn, self.path)[1]
        with mock.patch.object(sync.plaid_client, "access_token", return_value="token") as token, \
             mock.patch.object(sync.plaid_client, "call", side_effect=sync.plaid_client.PlaidError("X", "offline")):
            sync.sync_all(self.conn)
        self.assertNotIn(mock.call(importer.APPLE_ITEM), token.call_args_list)

    def test_empty_statement_adds_nothing(self):
        self.path.write_text(EXPORT.splitlines()[0] + "\n")
        self.assertEqual(importer.import_file(self.conn, self.path)[1], 0)

    def test_unknown_balance_leaves_saved_history_alone(self):
        from datetime import date, timedelta
        self.conn.execute("UPDATE accounts SET current_balance = 1000 WHERE account_id = 'checking'")
        five_days_ago = (date.today() - timedelta(days=5)).isoformat()
        self.conn.execute("INSERT INTO account_balances (account_id, date, balance) VALUES ('checking', ?, 500)", (five_days_ago,))
        before = {p["date"]: p["value"] for p in reports.net_worth_history(self.conn, days=10)}
        importer.import_file(self.conn, self.path)[1]
        after = {p["date"]: p["value"] for p in reports.net_worth_history(self.conn, days=10)}
        self.assertEqual(before, after)

    def test_balance_counts_once_typed_in(self):
        importer.import_file(self.conn, self.path)[1]
        importer.set_apple_card_balance(self.conn, 250)
        self.assertAlmostEqual(reports.balances(self.conn)["card"], 250)

    def test_rejects_other_files(self):
        self.path.write_text("Date,Amount\n")
        with self.assertRaises(ValueError):
            importer.import_file(self.conn, self.path)


AMAZON = """Order ID,Order Date,Order Status,Product Name,Total Amount
111-1,2026-09-04T18:00:00Z,Closed,Shower Curtain,9.39
111-2,2026-09-04T18:05:00Z,Closed,Knife Strip,50.00
111-2,2026-09-04T18:05:00Z,Closed,Stove Gap Cover,28.42
111-3,2026-09-05T10:00:00Z,Closed,Zip Ties,9.39
111-4,2026-09-05T10:00:00Z,Cancelled,Vitamin D,0
"""


class AmazonOrdersTest(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.conn = db.connect(Path(self.folder.name) / "test.db")
        self.conn.execute("INSERT INTO items (item_id, institution, kind) VALUES ('chase', 'Chase', 'banking')")
        self.conn.execute("""INSERT INTO accounts (account_id, item_id, owner_id, name, type, subtype)
                             VALUES ('visa', 'chase', 1, 'Amazon Visa', 'credit', 'credit card')""")
        charges = [("a", "2026-09-06", "AMAZON MKTPL*539TH0NR2", 78.42), ("b", "2026-09-06", "AMAZON MKTPL*535X85N10", 9.39),
                   ("c", "2026-09-07", "AMAZON MKTPL*538L64EJ2", 9.39), ("d", "2026-09-07", "Amazon.com*5300C0EE0", 12.00),
                   ("e", "2026-09-20", "AMAZON MKTPLACE PMTS", -9.39), ("f", "2026-09-08", "SHELL", 9.39)]
        for txn_id, day, description, amount in charges:
            self.conn.execute("""INSERT INTO transactions (transaction_id, account_id, date, description, merchant, amount)
                                 VALUES (?, 'visa', ?, ?, ?, ?)""", (txn_id, day, description, description.split("*")[0], amount))
        self.path = Path(self.folder.name) / "Order History.csv"
        self.path.write_text(AMAZON)

    def tearDown(self):
        self.conn.close()
        self.folder.cleanup()

    def bought(self, **filters):
        return {t["transaction_id"]: t["bought"] for t in reports.transactions(self.conn, [], **filters)}

    def test_items_of_one_order_add_up_to_its_charge(self):
        self.assertEqual(importer.import_file(self.conn, self.path), ("Amazon", 3))
        self.assertEqual(self.bought()["a"], "Knife Strip / Stove Gap Cover")

    def test_two_orders_of_the_same_total_each_pay_one_charge(self):
        importer.import_file(self.conn, self.path)
        found = self.bought()
        self.assertEqual({found["b"], found["c"]}, {"Shower Curtain", "Zip Ties"})
        self.assertIsNone(found["d"])  # no order for $12
        self.assertIsNone(found["f"])  # not an Amazon charge
        self.assertIn(found["e"], {"Shower Curtain", "Zip Ties"})  # a refund points back at an order

    def test_search_finds_what_was_bought(self):
        importer.import_file(self.conn, self.path)
        self.assertEqual(set(self.bought(search="stove gap")), {"a"})

    def test_reimporting_replaces_instead_of_doubling(self):
        importer.import_file(self.conn, self.path)
        importer.import_file(self.conn, self.path)
        self.assertEqual(self.conn.execute("SELECT COUNT(*) FROM amazon_orders").fetchone()[0], 3)

    def test_reads_amazons_zip(self):
        import zipfile
        archive = Path(self.folder.name) / "Your Orders.zip"
        with zipfile.ZipFile(archive, "w") as handle:
            handle.writestr("Your Amazon Orders/Order History.csv", AMAZON)
            handle.writestr("Your Amazon Orders/Cart History.csv", "ASIN\n")
        self.assertEqual(importer.import_file(self.conn, archive), ("Amazon", 3))


if __name__ == "__main__":
    unittest.main()
