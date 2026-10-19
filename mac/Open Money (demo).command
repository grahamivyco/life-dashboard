#!/bin/zsh
# Double-click to open the dashboard with made-up sample data.
cd "$(dirname "$0")"
python3 -m money --demo --port 8766
