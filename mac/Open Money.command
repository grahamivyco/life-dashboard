#!/bin/zsh
# Double-click to open the money dashboard. It normally runs in the background on its own
# (see FORMALCOLM.md, "Always on"), so this just opens the page. If it isn't running, this
# starts it in this window; close the window to stop it.
cd "$(dirname "$0")"
if curl -s -o /dev/null http://127.0.0.1:8765/; then
  open http://127.0.0.1:8765/
  exit 0
fi
python3 -m money "$@"
