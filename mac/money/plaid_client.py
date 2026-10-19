"""Tiny Plaid API client. Keys and bank access tokens live in the macOS Keychain, never in files."""

import json
import subprocess
import urllib.error
import urllib.request

KEYCHAIN_SERVICE = "money-dashboard"
BASE_URL = "https://production.plaid.com"


class PlaidError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(f"{code}: {message}")
        self.code = code


def keychain_get(name: str) -> str:
    result = subprocess.run(
        ["security", "find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", name, "-w"],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        raise PlaidError("KEY_MISSING", f"'{name}' is not in the Keychain")
    return result.stdout.strip()


def keychain_set(name: str, value: str) -> None:
    # Sent on stdin rather than as an argument, so it never shows up in the process list.
    if not all(c.isalnum() or c in "-_:" for c in name + value):
        raise PlaidError("BAD_TOKEN", "Unexpected characters in a Keychain value")
    command = f"add-generic-password -U -s {KEYCHAIN_SERVICE} -a {name} -w {value}\n"
    subprocess.run(["security", "-i"], input=command, capture_output=True, text=True, check=True)


def access_token(item_id: str) -> str:
    return keychain_get(f"item:{item_id}")


def call(path: str, **payload) -> dict:
    body = {
        "client_id": keychain_get("plaid_client_id"),
        "secret": keychain_get("plaid_secret_production"),
        **payload,
    }
    request = urllib.request.Request(
        BASE_URL + path,
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        try:
            detail = json.load(error)
        except json.JSONDecodeError:
            raise PlaidError("HTTP_ERROR", f"Plaid answered with status {error.code}")
        raise PlaidError(detail.get("error_code", "UNKNOWN"), detail.get("display_message") or detail.get("error_message", ""))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
        raise PlaidError("NETWORK", f"Couldn't reach Plaid ({error})")


def create_link_token(kind: str, item_id: str | None = None) -> str:
    payload = {
        "user": {"client_user_id": "local-user"},
        "client_name": "Money Dashboard",
        "country_codes": ["US"],
        "language": "en",
    }
    if item_id:
        # Reconnect a bank you already linked and ask it to share holdings too. This reuses the
        # link, so it doesn't use up one of the Trial plan's 10.
        payload["access_token"] = access_token(item_id)
        payload["additional_consented_products"] = ["investments"]
        return call("/link/token/create", **payload)["link_token"]
    payload["products"] = {"banking": ["transactions"], "investments": ["investments"]}[kind]
    if kind == "banking":
        payload["transactions"] = {"days_requested": 730}
        # One button links everything. Plaid hides any place that can't do every product in
        # `products`, so holdings ride along as optional: banks still show, and brokerages and
        # 401(k)s (which Plaid says virtually always do transactions too) bring their holdings.
        payload["optional_products"] = ["investments"]
    return call("/link/token/create", **payload)["link_token"]


def exchange_public_token(public_token: str) -> str:
    """Swap Link's one-time token for a lasting one, store it in the Keychain, return the item id."""
    result = call("/item/public_token/exchange", public_token=public_token)
    keychain_set(f"item:{result['item_id']}", result["access_token"])
    return result["item_id"]
