# FORMALCOLM: the Money dashboard

## What this is

Your own Rocket Money, running on your Mac and nowhere else. It looks and works like Rocket Money: a red-to-pink header, three swipeable cards (net worth, spending pace, and predicted cash in 30 days), a pie chart of where your money went, a calendar of upcoming bills, budgets, and a bottom tab bar on a phone. The main difference from Rocket Money is sorting: every rule is one line of plain text you can read, and when you fix a category the app asks "always do this?" and writes the rule for you.

## How it works, in one picture

Think of it like a mail room.

- **Plaid is the mail carrier.** It has the keys to your banks (you gave them during Plaid's sign-in screen) and delivers copies of your statements. It can only read. It cannot move money.
- **The Keychain is the locked key box.** Plaid's keys, and the per-bank "access tokens" Plaid hands back, sit in the macOS Keychain. They never touch a file, the terminal, or a chat with Claude.
- **The SQLite database is the filing cabinet.** `~/.money-dashboard/money.db`, readable only by your Mac user. It lives outside every project folder, so it can't end up in git by accident.
- **The rules file is the sorting desk's cheat sheet.** `~/.money-dashboard/rules.txt`. Categories are never stored on the transaction itself (unless you hand-picked one). They're worked out fresh every time a page loads, so editing a rule instantly re-sorts all of history.
- **The web page is the front window.** A tiny web server on `127.0.0.1` that only your own Mac can reach.

## The parts

| File | Job |
|---|---|
| `money/__main__.py` | Starts everything. `--demo` swaps in fake data. |
| `money/db.py` | Creates the database tables. |
| `money/plaid_client.py` | Talks to Plaid. Reads keys from the Keychain. |
| `money/sync.py` | Pulls new accounts, transactions and holdings into the database. |
| `money/rules.py` | Reads the rules file and decides each transaction's category. |
| `money/reports.py` | Totals, category spending, net worth, subscription finder. |
| `money/server.py` | The local web server and its API. |
| `money/static/` | The page you look at (plain HTML, CSS, JavaScript). |
| `money/demo.py` | About 13 months of made-up transactions for testing. |

## Choices we made, and why

- **Plaid's free Trial plan.** Free, no approval, covers banks, cards and brokerages. The catch: 10 connections ever. Deleting one doesn't give the slot back, so link each bank once and carefully.
- **No Python packages.** Only what ships with Python. Nothing to install, nothing to break when a library updates, nothing extra that touches your financial data.
- **Categories worked out on the fly, not saved.** This is the direct fix for "Rocket Money's sorting feels weird." In apps that stamp a category on each transaction, changing your mind means hunting down old ones. Here, change one line and everything follows.
- **New rules go to the top.** The first matching rule wins, so a rule you just made beats older, broader ones. "Costco Gas -> Car" beats "Costco -> Groceries" without you reordering anything.
- **Three kinds of money moves, none of them spending.** When you pay your credit card from checking, the spending already happened on the card, so counting the payment too would double it. Money sent to a brokerage isn't spent either. So moves get one of three names: `Credit Card Payment`, `Investing`, or `Transfer` (between your own accounts). The Spending page totals each one. You can switch any account off on the Accounts tab and it drops out of every total.
- **The card proves which Robinhood withdrawal is which.** Robinhood takes money out of checking under the same name, "Robinhood", whether it's paying the Robinhood card or funding the brokerage. Plaid guesses "investing" for both. The fix is like matching a receipt to a bank statement: if the same dollar amount lands as a payment on a linked card within 5 days, that withdrawal was a card payment. Each card payment can only vouch for one withdrawal, and only withdrawals that were already money moves can be relabeled, so a $500 rent check never turns into a card payment by coincidence. Your own pick always wins.
- **One "Link account" button, nothing else to pick.** Plaid hides any bank that can't do every product you ask for up front. So the button asks for transactions, which almost every bank, card, brokerage and 401(k) supports, and asks for holdings as optional. Banks still show up, and brokerages (Robinhood) bring their stocks along. An earlier version made you pick "bank" or "investing" first, which was one question too many.
- **Reconnect instead of re-link.** Robinhood was first linked without permission to share holdings. Linking it again would burn one of the 10 Trial slots. Plaid's "update mode" reopens the same link and asks for the extra permission, for free. The Accounts tab shows an "Allow" row when a link needs this.
- **Old card bills stand in for purchases we can't see.** Plaid only gave 6 weeks of Robinhood card history, but two years of the checking withdrawals that paid it. Counting those bills as "card payments" (not spending) made past quarters look like you earned a lot and spent almost nothing. So a card bill paid before that card's history starts is filed as "Card purchases (no detail)" and counts as spending. The total is right; the store-by-store detail just isn't there. Once a card's history begins, its real purchases take over and its bills go back to being card payments, so nothing is counted twice.
- **Card history comes in by file when Plaid can't give it.** Two cases. Apple Card shares only with approved iPhone apps, so Plaid can't reach it at all; the Wallet app exports a CSV (Apple Card > Card Balance > a statement > Export Transactions). Robinhood's card is linked, but Plaid only hands over its last few weeks; the Robinhood app exports everything since the card opened. Run `python3 -m money --import <file.csv>` and it works out which card the file is from. Apple rows land in an "Apple Card" account. Robinhood rows fill in the linked card only for dates before Plaid's copy starts, so nothing shows twice. Re-importing an overlapping file is safe: each row's id is built from its date, description, amount and how many times that exact row repeats. Neither file has good categories, so the importer borrows the label your linked cards give the same store. Apple's export has no balance, so the card shows "Balance unknown" and stays out of net worth until you set it: `python3 -m money --apple-card-balance 123.45`.
- **Why the Robinhood file matters so much.** Checking calls every Robinhood withdrawal "Robinhood", whether it pays the card or funds the brokerage. Guessing by amount (cents = card bill, round = deposit) was wrong about $11,500 of round-dollar card payments. With the card's full history, each withdrawal pairs with the card's own "Payment" record, and anything left over is investing. All 60 withdrawals since the card opened paired with no guessing. To keep it that way, re-export the Robinhood card file if the dashboard is ever offline for weeks; normal syncing keeps the pairs complete.
- **Amazon orders say what each Amazon charge bought.** The card only says "AMAZON MKTPL*5E0S045M0". Amazon's "Request your data" zip has every order, so `python3 -m money --import "Your Orders.zip"` saves each order's total and items. Matching happens fresh on every page load, like categories: a charge pairs with an order of the exact same total placed up to 30 days earlier (Amazon charges when it ships), and each order pays for only one charge. A refund of the same amount points back at its order. The items show under "Amazon" in the list and in the detail panel, and search finds them ("bike cover" finds the $53.04 charge). Two catches: orders placed from a *different* Amazon login (the shared account with Sophie) aren't in your zip, so that account's orders were read from its order pages in Chrome and imported the same way; and an order that ships in two boxes is charged twice, so neither charge equals the order total and it stays plain "Amazon". In Oct 2026 this explained 62 of 77 Amazon charges.
- **0% payment plans stay out of Net Cash until they're billed.** Amazon's "Equal Pay" puts a $553 toilet seat on the card, but Chase bills only $46 of it per statement. The card balance Plaid reports includes the whole $553, so Net Cash made you look $600 poorer than you were and the forecast dipped below zero for no reason. Now each plan is saved once (card, monthly slice, what's left, the statement it came from, and the day the card's statement closes), and Net Cash adds back the part not billed yet. The forecast takes one slice off on each statement's closing day, which is when Chase actually adds it to your bill. "Card Balance" still shows the full amount, and Net Cash says how much it's leaving out. Add a plan with `POST /api/payment-plans` (no screen for it yet); the numbers are on the statement's "Qualified Promotional Financing" table. Oct 2026: two Amazon plans, $617 not yet billed.
- **The forecast's daily average skips rent and one-offs.** The forecast spreads your everyday spending evenly across the month. Before, rent landed in that average because it moves through Venmo, Bilt and Sophie and never looks like one steady bill, and so did the moving truck. That pushed the average to $240 a day, and the forecast dipped toward -$2,000. Now a bill you add by hand in a bill category (Rent, Bills & Utilities, Loan Payments) takes that category out of the average and lands on its own day instead. Tag a purchase "one-off" (a U-Haul, a car-accident payment plan that's finished) and the average skips it too. Trips stay in on purpose, since they happen most months. Oct 2026: $240 a day became $152, with rent added as a $1,495 bill on the 1st.
- **People built in from day one.** Every account has an owner. Today it's just you. Add "Partner" or "Shared" in the Accounts tab and a filter appears at the top. Adding this later would have meant re-sorting every old account.

## Always on

The dashboard runs in the background, like Dropbox. A macOS launch agent (a small file at `~/Library/LaunchAgents/com.malcolm.money-dashboard.plist`) starts it when you log in and restarts it within seconds if it ever crashes. There's no Terminal window. Open it from a bookmark: http://127.0.0.1:8765. It still syncs your banks on its own every few hours.

- **Restart after a code change:** `launchctl kickstart -k gui/$(id -u)/com.malcolm.money-dashboard`
- **Its log:** `~/.money-dashboard/server.log`
- **Turn it off for good:** `launchctl bootout gui/$(id -u)/com.malcolm.money-dashboard`, then delete the .plist file.
- **"Open Money.command" still works.** If the dashboard is already running it just opens the page, so you never get two copies fighting over the same address.

## The screens

- **Dashboard.** Three cards: Net Worth, Spent this month (against last month's pace), and Predicted cash in 30 days. Below: accounts grouped like Rocket Money (Checking, Card Balance, Net Cash, Savings, Investments), the next few bills, and recent transactions.
- **Net Worth.** Opens from the dashboard card. A chart with 1M / 3M / 6M / 1Y, and your accounts split into Assets and Debts.
- **Recurring.** A two-week calendar with dots on bill days and a "$" on payday, a Payday View that says what's safe to spend before your next check, and a list with a ⋮ menu to say "not recurring" or delete one you added. The + button adds a bill by hand.
- **Spending.** Week / Month / Quarter / Year bars, a monthly budget with category rings, a pie chart by category, store or tag, and a list of things that still need a category.
- **Transactions.** Search all of history, filter by category, open any transaction to rename it, add a note or tags, hide it from spending, or change its category (and make a rule). "Select" lets you change many at once.
- **Investments, Accounts, Rules.** Under "More" on a phone.

## How "predicted cash" works

Net Cash is checking minus what you owe on cards, the same as Rocket Money. The forecast starts there and walks forward one day at a time for 30 days:

- Paychecks land on the day they're expected.
- Bills and regular transfers out of checking (like Robinhood or savings) come out on their due dates. A bill that's due today or late, and hasn't posted yet, comes out tomorrow.
- Everything else you spend is spread evenly, using your average day over the last 90 days, leaving out the repeating bills so they aren't counted twice.

Card payments are left out because they move money from checking to the card, and Net Cash already subtracts the card.

## Safety guards on the local server

A website you have open in another tab could, in theory, try to talk to a server on your own Mac. Three guards stop that:

1. It only listens on `127.0.0.1`, so other computers can't reach it at all.
2. It rejects any request whose address isn't `127.0.0.1` or `localhost` (blocks a trick called DNS rebinding).
3. Every data request needs a secret token that changes each time you start the app. Only the page the app itself served knows it.
4. Other websites can't load the dashboard inside a hidden frame (the `X-Frame-Options: DENY` header). Without this, a page could trick you into clicking buttons you can't see.
5. Plaid's script only loads when you press "Link account". The rest of the time, no outside code runs on the page that shows your numbers.
6. Every file the app creates can be read only by your Mac account.

## Lessons learned

- **The Plaid "Sandbox" secret wasn't one.** The key labeled for testing was rejected by Plaid's test system and accepted by the real one. We tested both before building, renamed it, and switched to our own fake data for testing. Lesson: check a key against the real endpoint before trusting its label.
- **Clipboard beats paste prompts for secrets.** Asking you to paste a key into a hidden password prompt while also copying a command from chat fought over one clipboard. A small script that waits, then reads the clipboard, fixed it in one go.
- **What Anthropic sees.** The app itself never sends data to Claude. Anything Claude reads in a chat does go to Anthropic (not used for training, since that setting is off on your account). So Claude builds and tests with fake data and doesn't open your real database.

- **The newest photos are the newest items.** Rocket Money screenshots were in Apple Photos all along. Claude first guessed at old ones; you said they were the most recent. Photos' library is locked, but AppleScript can count the items and export the last few by number.
- **Headless Chrome can't go narrower than about 500px.** Phone screenshots at 390px first used a frame trick. Once the server started refusing to be framed (guard 4), that broke, which proved the guard worked. The fix was to drive Chrome directly and tell it "pretend to be a 390px phone."
- **Separate critics catch different things.** Each round, one agent compared screenshots against Rocket Money and gave a score, and another clicked through the app like a user. The design score went 5.5 → 7 → 8 → 8.5 → 8.6 → 8.8 → 8.9. The bug checker found things a screenshot never shows: a renamed bill counted twice in the forecast, a late bill skipped for a whole month, a "Save" button that quietly dropped the category.
- **`array.map(fn)` passes the position too.** The dashboard did `upcoming.map(recurringRow)`, and `recurringRow`'s second input means "show a menu". The position number (0, 1, 2…) was read as yes or no, so every row but the first had a ⋮. Wrap it: `map((r) => recurringRow(r))`.
- **Don't hold the pen while waiting on the phone.** The background sync wrote your account balances, then waited up to a minute for Plaid's transactions before saving. SQLite locks the whole file for the length of a write, so any edit you made in the page froze and then failed. Now every Plaid call happens first, and the writes happen in one quick burst at the end. A test with a fake Plaid fails if the database is mid-write when Plaid is called.
- **One person's Amazon export isn't the household's Amazon spending.** The first zip matched only 13 of 77 Amazon charges. The gap wasn't a bad file: most orders came from the shared login billed to the same card. Check the match rate before building on a data source.
- **A paired order can still be refunded.** The first version crossed an order off once a charge used it, so the later refund for that order found nothing. A test with two same-price orders and a refund caught it.
- **Arrow and color are two different facts.** "$160 under last month" showed a green UP arrow. The arrow should say which way the number moved; the color says whether that's good for you.

## Not built yet

- Re-connecting a bank whose login expired (Plaid's "update mode"). For now the Accounts tab shows the error.
- Investment buys and sells history (holdings only for now).
- Alerts (big purchase, low balance, bill due), savings goals, split transactions, CSV export, renaming or merging categories, and budget history by month.
- Hiding, renaming, or hand-adding accounts.
