# DealFinder Auctions — How an Auction Runs
**Owner operations brief**  
DealFinder Auctions · Airdrie, AB · Production: https://dealfinder-auctions.vercel.app  
Prepared for staff walkthrough: catalog → live floor → Sunday close → invoice & pickup.

---

## 1. What this business is

DealFinder is a **weekly timed auction** (typically Monday open through **Sunday close**). Bidders register a paddle, agree to that sale’s terms, and either:

- place a **$50 Helcim card hold** (pre-authorization, not a charge), or  
- request **cash bidding** (desk must approve; trusted cash paddles skip the queue later).

They then bid live, leave absentee maxes, or tap **Buy Now**. **Nothing is charged for a win or Buy Now until Sunday**, when one **consolidated invoice** is emailed per buyer. Helcim (card) or cash-on-pickup settles that invoice.

House-owned warehouse stock and consignor lots both sell on the same floor. House stock pays **no consignor commission**. Consignors are paid from hammer minus the agreed house commission.

---

## 2. How a bidder participates (what they see)

### Step 1 — Create an account
1. Open the site and tap **Log in / Sign up**.
2. Enter name, email, password, phone, and address.
3. They receive a **DealFinder branded email**: confirm this address.
4. They click **Confirm your email**, land on **Verify email**, then can use the paddle.
5. Until the email is confirmed they **cannot bid**. The login modal stays on “check your inbox.”

**What they see:** comic-style red/black panels, a confirm-email button in the inbox, then the live floor.

### Step 2 — Complete the bidder card
1. Open **Profile**.
2. Confirm street, city, province, postal code (needed for shipping quotes).
3. Payment method is Helcim card (cash is a desk exception, not a signup option).

### Step 3 — Browse the live floor
1. Open **Live**.
2. They see lots in the current weekly sale: photos, lot number, current bid, countdown.
3. Tap a lot to open the **auction room**.

**What they see:** lot image (studio shot first), title, hammer, timer, bid tape, optional **Buy now $X**.

### Step 4 — Agree to this auction’s terms
On the **first bid or Buy Now** of a sale:
1. A **Terms & Conditions** modal opens (standard weekly, high-bid extension, charity, or custom text the desk saved).
2. It includes the **Buy-Now & consolidated invoicing** clause: reserved now, pay Sunday, $50 Buy-Now cap for standard paddles, Trusted Client can go higher, Buy Now is binding.
3. They tick agree.

**What they see:** scrollable T&C, then they cannot bid until they confirm.

### Step 5 — Authorize the paddle (Helcim or cash)
Still before the bid posts:
1. **Pay with Helcim (test or live):** $50 pre-authorization hold. Copy explains it is a **hold**, reversed after they pay the Sunday invoice.
2. **Request cash on pickup:** email goes to the desk. Status is **pending**. They cannot bid until staff approve **this auction** or **permanent trusted cash**.

**What they see:** Bid payment modal. If cash is pending: “waiting on desk.” If Helcim test mode: a mock confirm screen.

### Step 6 — Bid
- **Place Bid** — live increment.
- **Absentee max** — hidden ceiling; the floor auto-increments against others.
- If someone else outbids them they get an **outbid email** with a link back to the lot.
- Anti-snipe: late bids can extend the clock.

**What they see:** “High bid is now $…” and an updated timer.

### Step 7 — Buy Now (optional)
1. If the lot still has a Buy Now price at or above the current bid, they tap **Buy now $X**.
2. The lot **closes immediately**. They are the winner. **No Helcim charge. No item invoice.**
3. They get a **high-energy reservation email**: “Congratulations! You're the Winning Bidder!” plus: *no payment now; Sunday consolidated invoice.*
4. Standard paddles: **max $50 total Buy Now** per auction. Over that, a modal: *You have reached your standard Buy-Now reservation limit… contact management for Trusted Status.*
5. **Trusted Client** paddles (desk flag) skip the $50 cap, or use a custom $ limit if staff set one.

**What they see:** lot marked YOU WON; choose Ship or Pickup; “View reserved lots” (checkout shows reserved, pay buttons locked until Sunday).

### Step 8 — After they win (bid clock or Buy Now)
1. Choose **Local pickup** or **Shipping**. Totals preview 15% premium, 5% GST, $10 handling + postage if shipped.
2. Checkout lists reserved lots. **Pay with Helcim** and **Request cash** stay off until Sunday’s invoice email.
3. Sunday: one email per buyer — hammer + premium + GST + shipping fees, **Pay with Helcim** and **Request Cash Payment on Pickup**.
4. They pay the invoice (or wait for desk to mark cash paid). The $50 hold is released after card settlement.
5. Pickup: photo ID matching the paddle. Shipping: desk fulfills from the invoice address.

**If they do not pay:** desk can suspend the paddle; T&C warn of forfeiture of the $50 hold.

---

## 3. Admin map (every staff page)

Staff URL: **/admin** (password cookie, not a bidder login).

Sidebar:

| Nav | URL | What it is |
| --- | --- | --- |
| Live Monitor | `/admin` | Floor radar: live lots, high paddles, bid audit |
| Auction inventories | `/admin/inventories` | Every lot, file into a sale, relist unsold (9000s/10000s) |
| Auction desk | `/admin/auctions` | Create/edit weekly sales, T&C, clocks, master Excel |
| Warehouse AI generator | `/admin/intake` | House-owned cataloging (no consignor commission) |
| Consignment pipeline | `/admin/consignments` | Review outsider submissions |
| Customer directory | `/admin/customers` | Paddles, Trusted Client, Buy-Now limits, cash queue |
| Email engine | `/admin/email` | Template copy for Resend |

Redirects (cleared out of the sidebar): **/admin/exports** and **/admin/settlements** go to Auction desk. Relist lives on inventories. Checkout/cash APIs still exist for Helcim.

### 3.1 Live Monitor
- Watch hammers in real time.
- Open bid audits if a paddle looks wrong.
- This is home after staff login.

### 3.2 Auction inventories
- Search, filter unsold, select lots.
- **File into a sale** via the calendar modal.
- **Relist** unsold/no-bid lots into a new range (house practice: 9000s/10000s).
- Delete lots (bids go with them).
- House starting bid / next lot # can be set here too.

### 3.3 Auction desk
- Pick a sale. Create a new weekly auction (name, auction #, start, end, T&C template).
- Edit dates and terms. Delete a sale (lots return to warehouse).
- See lots, registrations, $50 holds, sold vs live.
- Search bidder / lot.
- When the sale is **ended** (end time passed) or **closed** (archived): **Export Master Auction Report (.xlsx)**  
  Four sheets: Auction Summary · Sold Lots & Winning Bids · Unsold No-Bid Lots · Consignor Breakdown  
  Bold headers, frozen row, column widths. House stock shows $0 consignor payout.

### 3.4 Warehouse AI generator
- House already bought the goods. Owner is locked to **House stock**.
- Drop up to 4 warehouse photos → **Auto-Generate Details** (catalog copy + studio listing photo).
- Set lot #, starting bid, buy now. **No house commission slider.**
- Save to inventory or post live, then file into a sale on the calendar.

### 3.5 Consignment pipeline
- Public consignors must **log in** before they add a name (they do not see other consignors).
- Staff see pending cards: edit title, description, bids, owner.
- Approve → pick a sale. Consignor gets an **approval email**.
- Hold or reject.

### 3.6 Customer directory
- **Cash bidding queue:** approve this auction, permanent trusted cash, or reject (email already hit the desk inbox).
- Table: paddle, status, wins, spend, Helcim flag, cash trust.
- **Trusted Client** checkbox → unlimited Buy Now (or custom $ limit in the next column).
- **Buy-Now limit** field for custom caps.
- Suspend / restore bidding. Password reset alert.

### 3.7 Email engine
- Edit subjects/bodies: welcome/verify, outbid, winning reservation, Sunday invoice, cash receipt, consignment approved, cash-bid desk alert, etc.
- Resend delivers from `RESEND_FROM`. Vercel.app cannot be a Resend domain; a real DNS domain is required for inbox reputation.

---

## 4. How staff run one week (start to finish)

1. **Build the sale** on Auction desk: dates through Sunday, T&C template.
2. **Catalog house stock** on Warehouse AI generator; file lots into that sale.
3. **Approve consignments** into the same sale (pipeline).
4. **Inventories:** anything leftover from last week, relist into 9000s/10000s if that is the house rule.
5. **Monday–Saturday:** Live Monitor. Bidders register, agree to T&C, Helcim $50 or cash queue.
6. **Buy Now / early clocks:** lots lock to the winner; reservation email only; Excel already treats them as sold.
7. **Sunday:**  
   - Cron `/api/cron/sunday-preauth` — $50 holds on paddles still high. Denied hold can forfeit bids.  
   - Cron `/api/cron/auction-close` (and the live clock on Sundays) — remaining live lots end; **one invoice email per winning buyer** with Helcim + cash-on-pickup links.  
8. **After close:** Export Master Auction Report. Pay consignors from the Consignor sheet. Relist unsold. Mark Helcim/cash paid as money comes in. Suspend no-pays.

---

## 5. Automations (no extra button)

| When | What runs | Result |
| --- | --- | --- |
| Bidder signs up | Resend welcome + confirm link | Must verify before bid |
| Staff approve consignment | Resend to consignor | Lot is in the sale |
| First bid of a sale | T&C + Helcim/cash gate | Bid blocked until both pass |
| Cash request | Email to `ADMIN_NOTIFY_EMAIL` | Desk queue on Customers |
| Outbid | Resend | Link back to lot |
| Buy Now or lot clock with a high paddle | Lot `ended`, pending invoice row, **reservation email** | No Helcim, no invoice yet |
| Standard Buy Now over $50 this sale | API `BUY_NOW_LIMIT` | Modal on the lot |
| Sunday / sale `ends_at` | Close remaining lots, fees (15% + GST + $10 ship handling), **batch invoice emails** | Helcim checkout unlocks |
| Sunday preauth cron | $50 Helcim holds | Denied → forfeit |
| Staff export after end | Master `.xlsx` from live sold/unsold data | Four tabs |

Background routes: `GET /api/cron/sunday-preauth`, `GET /api/cron/auction-close` (Bearer `CRON_SECRET`). Vercel Cron: Sunday 16:00 UTC preauth; Monday 00:05 UTC close (approx Sunday evening Alberta). Live clock also retries close on Sundays.

---

## 6. Money rules (say these out loud)

- **15% buyer’s premium** on hammer.  
- **5% GST** on taxable subtotal.  
- **Pickup:** hammer + premium + GST.  
- **Ship:** plus **$10 handling** and carrier postage, then GST.  
- **Buy Now / wins during the week:** reserved, not charged.  
- **Sunday:** one invoice per buyer per auction.  
- **House stock:** full hammer stays with the house (no consignor payout).  
- **Consignors:** hammer minus listed commission.  
- **$50 Helcim:** hold only; released after invoice is paid by card.

---

## 7. SQL / desk notes

If Trusted Client or Buy Now limits fail to save, run `supabase/sql-editor-buy-now-trusted.sql` in the Supabase SQL editor (profiles flags, `pending_invoice_items`, `sale_source`, `invoice_batch_sent_at`).

Helcim keys, Resend, `CRON_SECRET`, and `ADMIN_NOTIFY_EMAIL` live in Vercel env — never in Git.

---

*End of brief. Print or save as PDF from the browser (File → Print → Save as PDF) if you need a paper copy.*
