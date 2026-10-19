"""Start the dashboard: python3 -m money  (add --demo to use made-up sample data)."""

import argparse
import csv
import json
import logging
import os
import shutil
import threading
import time
import webbrowser
from pathlib import Path

from . import bridge, plaid_client, db, demo, importer, rules, sync, ynab
from .server import App, serve

EXAMPLE_RULES = Path(__file__).parent.parent / "rules.example.txt"


def main() -> None:
    parser = argparse.ArgumentParser(description="Personal money dashboard")
    parser.add_argument("--demo", action="store_true", help="use made-up sample data instead of your accounts")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--no-browser", action="store_true", help="don't open a browser tab")
    parser.add_argument("--import", dest="import_file", type=Path, metavar="CSV",
                        help="add an Apple Card, Robinhood card or Amazon order export, then stop")
    parser.add_argument("--apple-card-balance", type=float, metavar="DOLLARS",
                        help="set what you owe on Apple Card today, then stop")
    parser.add_argument("--dashboard-key", metavar="KEY",
                        help="save the key from the Life Dashboard's Finances page, then stop")
    parser.add_argument("--export-payload", type=Path, metavar="JSON",
                        help="write what the dashboard would get to a file, then stop (use with --demo)")
    parser.add_argument("--ynab-check", action="store_true", help="show what YNAB has for Apple Card, then stop")
    args = parser.parse_args()
    os.umask(0o077)  # every file the app makes is readable by you only

    if args.ynab_check:
        try:
            ynab.check()
        except Exception as error:
            raise SystemExit(f"Couldn't read YNAB: {error}")
        return
    if args.dashboard_key:
        bridge.save_key(args.dashboard_key)
        print("Saved. This Mac now sends your numbers to the Life Dashboard.")
        return
    prefix = "demo-" if args.demo else ""
    db_path = db.DATA_DIR / f"{prefix}money.db"
    rules_path = db.DATA_DIR / f"{prefix}rules.txt"

    conn = db.connect(db_path)
    if args.import_file or args.apple_card_balance is not None:
        try:
            if args.import_file:
                source, added = importer.import_file(conn, args.import_file)
                print(f"Added {added} {source} {'orders' if source == 'Amazon' else 'transactions'}.")
            if args.apple_card_balance is not None:
                importer.set_apple_card_balance(conn, args.apple_card_balance)
                print(f"Apple Card balance set to ${args.apple_card_balance:,.2f}.")
        except (OSError, ValueError, KeyError, AttributeError, csv.Error) as error:
            raise SystemExit(f"Couldn't do that: {error}")
        return
    if not rules_path.exists():
        shutil.copy(EXAMPLE_RULES, rules_path)
    else:
        rules.drop_starter_rules(rules_path)
    rules_path.chmod(0o600)  # older copies were made readable by everyone on this Mac
    if args.demo:
        demo.fill(conn)

    app = App(conn, rules_path, demo=args.demo, port=args.port)
    if args.export_payload:
        args.export_payload.write_text(json.dumps(bridge.build_payload(app), default=str))
        return
    server = serve(app)
    url = f"http://127.0.0.1:{args.port}/"
    print(f"Money dashboard running at {url}{' (demo data)' if args.demo else ''}")
    print(f"Your sorting rules: {rules_path}")
    print("Press Ctrl+C to stop.")
    if not args.demo:
        threading.Thread(target=keep_fresh, args=(db_path,), daemon=True).start()
        # Its own connection and app, so the web page's edits never wait on this window.
        link = bridge.Bridge(App(db.connect(db_path), rules_path, demo=False, port=args.port))
        threading.Thread(target=link.run_forever, daemon=True).start()
        if not bridge.dashboard_key():
            print("Not linked to the Life Dashboard yet. Get a key on its Finances page.")
    if not args.no_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


SYNC_EVERY_SECONDS = 4 * 60 * 60


def keep_fresh(db_path: Path) -> None:
    """Sync once at start-up and every few hours, so the numbers are current when you look.

    Uses its own connection, so the page stays usable while Plaid is slow to answer.
    """
    conn = db.connect(db_path)
    while True:
        try:
            sync.sync_all(conn)
        except Exception:
            logging.exception("Background sync failed")
        try:
            ynab.sync(conn)  # Apple Card, which Plaid can't reach
        except plaid_client.PlaidError:
            pass  # no YNAB token saved: Apple Card comes from exports instead
        except Exception:
            logging.exception("YNAB sync failed")
        time.sleep(SYNC_EVERY_SECONDS)


if __name__ == "__main__":
    main()
