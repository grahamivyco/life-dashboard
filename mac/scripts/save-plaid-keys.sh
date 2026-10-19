#!/bin/zsh
# Saves Plaid keys from the clipboard into the macOS Keychain. Keys are never printed.
set -e

last=""
save() {
  read "?Click copy next to the $2 in Chrome, then press Enter here... "
  val="$(pbpaste | tr -d '[:space:]')"
  if [[ -z "$val" || "$val" == "$last" || "$val" == *security* ]]; then
    echo "That doesn't look like the $2. Copy it again and rerun this script."
    exit 1
  fi
  # Fed on stdin so the key never appears in the process list.
  print -r -- "add-generic-password -U -s money-dashboard -a $1 -w $val" | security -i >/dev/null
  last="$val"
  echo "Saved $2."
}

save plaid_client_id "client_id"
save plaid_secret_sandbox "Sandbox secret"
pbcopy < /dev/null
echo "All done. Clipboard cleared."
