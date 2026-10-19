import tempfile
import unittest
from pathlib import Path
from unittest import mock

from money import db, sync


class SyncLockTest(unittest.TestCase):
    """The background sync must not hold the database's write lock while it waits on Plaid."""

    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.conn = db.connect(Path(self.folder.name) / "test.db")
        self.conn.execute("INSERT INTO items (item_id, institution, kind) VALUES ('item-1', 'Test Bank', 'banking')")
        self.conn.commit()

    def tearDown(self):
        self.conn.close()
        self.folder.cleanup()

    def fake_call(self, path, **payload):
        self.assertFalse(self.conn.in_transaction, f"database was mid-write during {path}")
        if path == "/accounts/get":
            return {"accounts": [{"account_id": "acct-1", "name": "Checking", "type": "depository", "subtype": "checking",
                                  "balances": {"current": 100.0, "available": 100.0}}]}
        return {"added": [], "modified": [], "removed": [], "next_cursor": "c1", "has_more": False}

    def test_plaid_calls_happen_before_any_write(self):
        with mock.patch.object(sync.plaid_client, "access_token", return_value="token"), \
             mock.patch.object(sync.plaid_client, "call", side_effect=self.fake_call):
            results = sync.sync_all(self.conn)
        self.assertEqual(results, [{"institution": "Test Bank", "ok": True}])
        self.assertEqual(self.conn.execute("SELECT cursor FROM items").fetchone()[0], "c1")


class BankWithBrokerageTest(unittest.TestCase):
    """A Robinhood-style link holds a card and a brokerage, so it needs transactions and holdings."""

    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.conn = db.connect(Path(self.folder.name) / "test.db")
        self.conn.execute("INSERT INTO items (item_id, institution, kind) VALUES ('item-1', 'Robinhood', 'banking')")
        self.conn.commit()

    def tearDown(self):
        self.conn.close()
        self.folder.cleanup()

    def sync(self, holdings_error=False):
        def fake_call(path, **payload):
            self.assertFalse(self.conn.in_transaction, f"database was mid-write during {path}")
            if path == "/accounts/get":
                return {"accounts": [{"account_id": "brokerage", "name": "Individual", "type": "investment",
                                      "subtype": "brokerage", "balances": {"current": 500.0}}]}
            if path == "/investments/holdings/get":
                if holdings_error:
                    raise sync.plaid_client.PlaidError("ADDITIONAL_CONSENT_REQUIRED", "not consented")
                return {"accounts": [{"account_id": "brokerage"}],
                        "securities": [{"security_id": "s1", "ticker_symbol": "VTI", "name": "Vanguard Total"}],
                        "holdings": [{"account_id": "brokerage", "security_id": "s1", "quantity": 2,
                                      "institution_price": 250, "institution_value": 500}]}
            return {"added": [], "modified": [], "removed": [], "next_cursor": "c1", "has_more": False}
        with mock.patch.object(sync.plaid_client, "access_token", return_value="token"), \
             mock.patch.object(sync.plaid_client, "call", side_effect=fake_call):
            return sync.sync_all(self.conn)

    def test_holdings_saved_for_a_bank_link(self):
        self.sync()
        self.assertEqual(self.conn.execute("SELECT ticker FROM holdings").fetchall()[0][0], "VTI")

    def test_missing_holdings_permission_does_not_break_sync(self):
        self.assertEqual(self.sync(holdings_error=True), [{"institution": "Robinhood", "ok": True}])
        self.assertEqual(self.conn.execute("SELECT holdings_error FROM items").fetchone()[0], "ADDITIONAL_CONSENT_REQUIRED")
        self.sync()
        self.assertIsNone(self.conn.execute("SELECT holdings_error FROM items").fetchone()[0])


if __name__ == "__main__":
    unittest.main()
