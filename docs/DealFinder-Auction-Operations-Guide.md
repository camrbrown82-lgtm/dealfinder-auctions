# DealFinder Auctions — Full Operations Guide
**Staff walkthrough of every public page, admin desk, email, and automation**  
DealFinder Auctions · 529 Gateway Rd NE, Airdrie, AB T4B 0J6  
Live site: https://www.dealfinderauctions.com  
Staff desk: https://www.dealfinderauctions.com/admin  
Guide page: https://www.dealfinderauctions.com/operations-guide

Print from the browser (File → Print → Save as PDF) if you need a paper copy.

---

## 1. What this business is

DealFinder is a **weekly timed auction** in Airdrie. A sale typically opens Monday and **closes Sunday at 6:00 p.m. Mountain Time**.

Two kinds of goods sell on the same floor:

- **House stock** — warehouse items DealFinder already owns. No consignor commission. The full hammer stays with the house.
- **Consignments** — someone else’s item. House commission follows the agreement: **$50 or below is 50% (max $10 house cut). After $50, house takes 20%.** The buyer’s 15% premium, GST, and shipping are **never** taken out of the consignor’s share.

Bidders register a paddle, agree to that sale’s terms, then either:

- place a **$50 Helcim card hold** (pre-authorization, not a charge), or
- request **cash on pickup** (desk must approve).

They bid live, leave a Max Bid, or tap Buy Now. **Wins are reserved immediately. Nothing is charged until Sunday**, when one **consolidated invoice** is emailed per buyer.

---

## 2. Public website — page by page

### 2.1 Home (`/`)
The storefront. Shows the current sale, featured lots, and ways into Live, Buy Now, consign, and account.

### 2.2 Live floor (`/live`)
Every lot in the current weekly sale. Cards show photo, title, lot number, current bid, and countdown.

- The grid **polls `/api/live-clock` every 4 seconds**.
- A lot page uses **Supabase realtime** after the first fetch (if the websocket drops, refresh the page).
- The on-card timer ticks every 1 second.

Tap a card to open that lot.

### 2.3 Lot page (`/auctions/{lot-number-or-slug}`)
The auction room.

**What you see**
- Listing photo (and extra warehouse shots **only if they belong to that item**)
- Title, grade, lot #, auction #
- Current hammer, high bidder, countdown
- Bid tape
- Buy Now button when the lot still has a Buy Now price

**How to bid (step by step)**
1. Tap **Place Bid** (next increment) or **Max Bid** (hidden ceiling).
2. If not logged in: log in or create an account.
3. If this is the first bid on this sale: accept the **auction terms**.
4. If the paddle is not authorized yet: **$50 Helcim hold** or **request cash on pickup**.
5. The bid posts. Anti-snipe can add **+2:00** if someone bids near the end.

**If you win**
- The room says **YOU BOUGHT THIS LOT**.
- Choose **Ship it** or **Pick up**.
- Payment is **not** taken here. All wins from the sale go on **one Sunday invoice**.
- **Checkout** (`/checkout`) lists only lots **this paddle** actually bought.

**Buy Now on the lot**
- Buy Now is **always a separate sale**, even if the lot is also in the live auction.
- They pay **immediately**. Sunday invoicing is only for auction wins.
- The lot comes off the live floor and off Buy Now the moment they claim it.
- They get an email: choose pickup or shipping, then pay.
- The invoice goes to **Pickup & shipping** (Open wins until they choose, then that desk).
- Standard paddles: **$50 total Buy Now per auction**. Over that, they must ask the desk for Trusted Client status.
- Trusted Client paddles skip the cap (or use the custom $ limit staff set).

### 2.4 Buy Now catalog (`/buy-now`)
Public list of lots that have a Buy Now price. They also stay in the live auction until someone claims them or the hammer falls.

### 2.5 Checkout (`/checkout`)
The buyer’s **bought lots** only — never items they bid on and lost, and never someone else’s lots.

- Choose ship or pickup per invoice.
- **Pay with Helcim** and **Request cash** unlock after the Sunday invoice exists.
- Fees: **15% buyer’s premium**, **5% GST**, and if shipping: **$10 handling + postage**.

### 2.6 Profile (`/profile`)
Name, phone, address (needed for shipping quotes), password. Address is what the desk uses on labels.

### 2.7 Consignor dashboard (`/consignor`)
Logged-in consignors only. Other people’s names never appear on the form.

**Submit an item**
1. Log in.
2. Drop up to 4 warehouse photos (or paste image URLs). Photos do not start cataloging.
3. Add condition, and item details only if you have them. That box can stay empty.
4. Press **Auto-Generate Details** when you are ready. That is the only step that writes the title, description, and studio listing photo.
5. Set starting bid (default $5) and market value. Buy Now is $100 minimum from this point on. The number they enter is what they are paid if it sells. There is no commission. DealFinder sets the buyer price and can counter the offer when approving. Leave Buy Now blank for the live auction and the agreement commission. There is no Buy Now checkbox. Charity is still a checkbox.
6. Accept the consignment agreement.
7. Submit. The item goes to **Waiting on DealFinder**.

**What they see after that**
- **Waiting on DealFinder** — still in the approval queue.
- **Accepted lots** — scheduled or live.
- **Payouts** — sold lots, split into **still owed** vs **paid out**, with hammer and their share.
- **Not accepted** — rejected items.
- **Counter offers** — turned-down Buy Now items where DealFinder named another amount. Accept or decline each one. Accept sends it back for approval at that amount.
- **Export to Excel** — three sheets: Still owed / Paid out / Cleared.
- **Export paid-out and clear them** — downloads the spreadsheet, then takes paid-out rows off the main page so it does not clutter. Cleared rows stay under **Cleared from this page**.

### 2.8 Other public pages
- **Verify email** (`/verify-email`) — required before bidding.
- **Reset password** (`/reset-password`) — from the email link.
- **Locations** (`/locations`, `/locations/{city}`) — local SEO pages.
- **Media** (`/media`) — press / social assets.

---

## 3. Accounts and the paddle gate

### 3.1 Create an account
1. Tap **Log in / Sign up**.
2. Enter name, email, password, phone, address.
3. They get the **Welcome / confirm email**.
4. They click the link, land on **Verify email**, then can use the paddle.
5. Until the email is confirmed they **cannot bid**.

### 3.2 First bid of a sale
In order, every time, for that auction:

1. Complete profile (name + address).
2. Agree to **this sale’s terms** (saved on the Auction desk).
3. Authorize the paddle:
   - **Helcim $50 hold**, or
   - **Cash on pickup** (pending until the desk approves this auction or permanent trusted cash).
4. Then the bid or Buy Now is submitted.

### 3.3 Trusted Client
Staff flag on **Customer directory**. Unlimited Buy Now (or a custom $ cap). Does not skip terms or the $50 hold unless you also grant cash trust.

---

## 4. Admin desk — every staff page

Staff URL: **/admin**. Sign in with a **DealFinder staff email** (`dealfinderauctions@gmail.com`) plus the admin password. Personal bidder/consignor accounts stay off this desk. That house email skips the confirm-link. More than one staff session can be open at once — logging in on one computer does not kick the others. Extra staff addresses go in Vercel `ADMIN_EMAILS` (comma-separated).

### 4.1 Live Monitor (`/admin`)
Home after login. Floor radar: live lots, high paddles, bid tape. Polls about every 4 seconds and also listens to realtime. Use this during the sale.

### 4.2 Auction inventories (`/admin/inventories`)
Every lot in the warehouse and on the floor.

- Search title, consignor, lot #, auction #.
- File selected lots into a sale.
- Relist unsold / no-bid lots (house practice: 9000s / 10000s).
- Delete lots (their bids go with them).
- House starting bid and next lot number live here.

### 4.3 Auction desk (`/admin/auctions`)
Create and run weekly sales.

- Name, auction number, start, end, T&C template (standard, high-bid extension, charity, or custom).
- Edit dates and terms. Delete a sale and lots return to the warehouse.
- See lots, registrations, $50 holds, sold vs live.
- When the sale has ended: **Export Master Auction Report (.xlsx)**  
  Sheets: Auction Summary · Sold Lots & Winning Bids · Unsold No-Bid Lots · Consignor Breakdown.

### 4.4 Warehouse AI generator (`/admin/intake`)
House-owned cataloging. Owner is locked to **House stock**.

1. Drop up to 4 photos.
2. Auto-generate title, description, studio photo.
3. Set lot #, starting bid, Buy Now.
4. Save to inventory or post live, then file into a sale.

### 4.5 Floor stream (`/admin/stream`)
On-the-floor capture. Stopping a recording saves the clip on the media page.

YouTube, Facebook, TikTok, and Instagram hand the clip to the **DealFinder Poster** extension and fill that site's upload form. The post goes out on the social account signed in on that Chrome profile. Press that site's own Post button. One-time setup is section 9.

### 4.6 Buy Now desk (`/admin/buy-now`)
Only lots that already have a Buy Now price. This is **not** a second inventory.

- Edit title, description, price. Save or delete.
- **Fill Marketplace form** on a lot opens Facebook Marketplace through the DealFinder Poster extension and fills title, price, photos, and description from Supabase. You press Publish. This uses the personal account signed in on that Chrome profile.
- **Download spreadsheet** is a local .xlsx of the same Buy Now list.
- The old Meta Commerce Manager catalog feed is no longer the posting method. Remove any scheduled feed you still have in Commerce Manager.

### 4.7 Pickup & shipping (`/admin/shipping`)
One invoice sits on **exactly one** desk:

- **Open wins** — closed lots where the buyer has not chosen ship or pickup yet.
- **Pickup** — buyer chose pickup (leaves Open wins).
- **Shipping** — buyer chose shipping (leaves Open wins).

Mark picked up / shipped, add tracking, parcel size, Canada Post label work.

### 4.8 Consignment pipeline (`/admin/consignments`)
Two layers on one page:

**Waiting for approval**
1. A consignor submits. Desk gets a notification badge and an email.
2. Open the card. Edit title, description, bids, and owner if needed. On a Buy Now request, approving pays them the amount they asked (or a counter they already accepted). Set the price buyers pay. That difference is DealFinder's profit. There is no commission. Both the payout and the buyer price are $100 minimum.
3. **Approve** (pick a sale) → consignor gets an approval email for that item. The lot is filed into the sale and Buy Now.
4. **Hold** or **Reject**. Reject emails the consignor. On a Buy Now item, type a counter before Reject and that amount is in the email. If several items are turned down, each counter is listed. They open the consignments page and accept or decline each one. Accept puts that item back in this queue at the counter price.

**Consignor tracking** (tables under the queue)
- One panel per person.
- Every item they have ever consigned: photos, stage, lot #, hammer, commission, their payout.
- Stages: waiting, held, filed, live, sold (buyer owes), buyer paid — payout owed, payout sent, unsold, rejected.
- **Email missing sold notices** — backfill sold emails for lots that sold before notices existed (each lot only once).
- Open an item → **Mark payout sent** when you actually e-transfer them. That emails the payout receipt and moves the lot to **Paid out** on their dashboard so they can export and clear it.

### 4.9 Customer directory (`/admin/customers`)
- Cash bidding queue: approve this auction, permanent trusted cash, or reject.
- Trusted Client checkbox and optional Buy-Now $ limit.
- Suspend / restore bidding.
- Password reset from here emails the bidder.

### 4.10 Email engine (`/admin/email`)
Edit subjects and bodies for every template listed in section 6. Resend delivers from `RESEND_FROM`.

### 4.11 Notifications (`/admin/notifications`)
Desk inbox for new consignments and cash-approval requests. The nav badge polls about every 30 seconds.

### 4.12 Operations guide (`/operations-guide`)
This document.

### 4.13 Redirects
`/admin/exports` and `/admin/settlements` redirect to the Auction desk. Settlements work still lives on Auction desk + Pickup & shipping + Consignor tracking.

---

## 5. How staff run one week (start to finish)

1. **Build the sale** on Auction desk — dates through Sunday 6 p.m. Mountain, pick a T&C template.
2. **Catalog house stock** on Warehouse AI generator. File those lots into the sale.
3. **Approve consignments** into the same sale. Consignors get the approval email.
4. On **Inventories**, relist leftover unsold into the 9000s / 10000s if that is the house rule.
5. **Monday–Saturday:** watch Live Monitor. Bidders register, accept terms, Helcim $50 or cash queue.
6. **Buy Now:** the lot leaves Live and Buy Now immediately. The buyer gets a **Pay now** email (choose pickup/shipping, then pay). If it was consigned, the consignor gets a **Sale invoice** the same moment with hammer, house commission, and their payout. The buyer invoice is on Pickup & shipping. It is **not** added to Sunday’s auction invoice.
7. **Sunday afternoon:** bid-reminder emails (4:00 p.m. UTC / 5:00 p.m. UTC so both MDT and MST are covered). Preauth cron re-holds $50 on paddles still high.
8. **Sunday close (~6:05 p.m. Calgary):** cron ends remaining live lots, writes one invoice per winning buyer, emails **Pay this invoice** / **Choose pickup or shipping, then pay**. Nothing is assumed to ship.
9. **After close:**
   - Pickup & shipping desk: Open wins until they choose; then Pickup or Shipping.
   - Export Master Auction Report.
   - When the buyer pays, the lot is **buyer paid — payout owed**.
   - When you e-transfer the consignor, **Mark payout sent** on Consignor tracking. They get a receipt and can export/clear the row.
   - Relist unsold. Suspend no-pays.

---

## 6. Email workflows (every message the site sends)

Copy for these lives on **Admin → Email engine**. Delivery is Resend.

### 6.1 Bidder account
| When | Template | Who gets it |
| --- | --- | --- |
| They create an account | `welcome` — Confirm your DealFinder Auctions email | The new bidder |
| They tap forgot password / staff reset | `password_reset` | The bidder |

They cannot bid until the welcome link is confirmed.

### 6.2 Bidding
| When | Template | Who gets it |
| --- | --- | --- |
| Someone else takes the high bid | `outbid` | The paddle that just lost the lead |
| Sunday afternoon before 6 p.m. close | `sunday_bid_reminder` | Registered / active paddles |
| Sunday $50 hold fails | `hold_failed` | That paddle — authorize now or bids forfeit |

### 6.3 Winning and paying
| When | Template | Who gets it |
| --- | --- | --- |
| They win a live auction lot | `winning_reservation` | The winning paddle. **Reserved, not billed.** Auction only. |
| They claim Buy Now | `winning_invoice` subject **Pay now — {title}** | The buyer. Choose pickup or shipping, then pay today. The lot is already off Live and Buy Now. |
| Same Buy Now claim, if consigned | `consignor_payout` subject **Sale invoice — {title}** | The consignor, immediately. Sold how / sold for / house commission / their payout. House stock is skipped. |
| Sunday close (or a late close sweep) | `winning_invoice` | One email per buyer for **auction wins only**. Buy Now lots already billed are left out. Button: **Pay this invoice** or **Choose pickup or shipping, then pay**. |
| Desk marks cash paid | `cash_receipt` | The buyer |
| Desk emails a Canada Post quote | `shipping_quote` | The buyer |

Checkout never shows lots they lost or lots that belong to another paddle.

### 6.4 Cash bidding
| When | Template | Who gets it |
| --- | --- | --- |
| They request cash-on-pickup bidding | `cash_bid_received` | The bidder |
| Same moment | `cash_bid_auth` + `admin_cash_alert` | The desk (`ADMIN_NOTIFY_EMAIL`) |
| Desk approves | `cash_bid_approved` | The bidder — they can bid |
| Desk rejects | `cash_bid_rejected` | The bidder — they can still use Helcim |

### 6.5 Consignors
| When | Template | Who gets it |
| --- | --- | --- |
| They submit an item | `consignment_received` | The consignor |
| Same moment | `admin_consignment_alert` | The desk. Nav badge also increments. |
| Staff approve and file it | `consignment_approved` | The consignor |
| The lot sells (Buy Now or auction close) | `consignor_payout` subject **Sold — {title}** | The consignor. Shows sold for / house commission / their payout. Says payout goes out after the buyer pays. Sent once per lot. |
| Staff tap **Mark payout sent** | `consignor_payout` subject **Payout sent — {title}** | The consignor. Receipt that the money is on the way. |

House stock never emails a consignor. A shared display name is never used to pick an inbox if more than one account has that name.

**Email missing sold notices** on Consignor tracking catches lots that sold before sold notices existed. Running it twice does not send twice.

### 6.6 Resend / DNS (only if mail stops)
- Verify `dealfinderauctions.com` in Resend (do not enable Receiving).
- Porkbun already has apex MX for the Gmail/hosted mailbox. **Do not** put Resend MX/SPF on `@`.
- Add only the `send` / `resend._domainkey` records Resend shows.
- Vercel `RESEND_FROM` should be `DealFinder Auctions <hello@dealfinderauctions.com>`.
- `ADMIN_NOTIFY_EMAIL` is the inbox the desk watches.

---

## 7. Automations (no extra button)

| When (UTC) | Route | What it does |
| --- | --- | --- |
| Sunday 16:00 | `/api/cron/sunday-preauth` | Re-holds $50 on paddles still high. Denied hold can forfeit bids. |
| Sunday 16:00 | `/api/cron/bid-reminder?when=mdt` | “Get your bids in before 6 p.m.” |
| Sunday 17:00 | `/api/cron/bid-reminder?when=mst` | Same reminder for MST weeks |
| Monday 00:05 | `/api/cron/auction-close` | Ends leftover live lots, writes Sunday invoices, emails buyers. About **Sunday 6:05 p.m. Calgary**. |

The same close work also runs opportunistically from Live Monitor, the admin desk, and checkout so a missed cron does not leave sold lots hanging.

Buyer invoices are **cron / close sweep**. Consignor sold notices fire **as soon as the sale is recorded** (Buy Now claim or lot close), so the consignor may hear first.

---

## 8. Money rules (say these out loud)

- **15% buyer’s premium** on hammer.
- **5% GST** on the taxable subtotal.
- **Pickup:** hammer + premium + GST.
- **Ship:** plus **$10 handling** and carrier postage, then GST.
- **Buy Now:** billed immediately, never folded into Sunday’s auction invoice.
- **Auction wins during the week:** reserved, not charged until Sunday.
- **Sunday:** one invoice per buyer for that auction. Shipping is only billed if they chose ship on every lot on that invoice.
- **House stock:** full hammer to the house.
- **Consignors:** hammer minus the agreement split. Premium / GST / shipping stay on the buyer.
- **$50 Helcim:** hold only; released after the invoice is paid by card.
- **Charity consignments:** the consignor share is flagged for the charity, not a personal payout.

---

## 9. Social posting — owner setup (Chrome extension)

The owner posts from his own Facebook, Instagram, TikTok, and YouTube accounts. The extension is not locked to any one person. Whichever account is signed in on the Chrome profile he uses is the account that posts. DealFinder fills the form from Supabase. He presses Publish or Post himself. The extension does not store those social passwords.

Do this once on the computer he posts from.

1. Sign into Chrome with the profile he uses every day.
2. In that same Chrome window, sign into his own Facebook, Instagram, TikTok, and YouTube. Leave those logins in place.
3. Open **Admin → Operations guide** (`/operations-guide`).
4. Press **Download DealFinder Poster**.
5. Unzip the download. Inside it is a folder named `extension`.
6. In the address bar, open `chrome://extensions`.
7. Turn on **Developer mode** at the top right.
8. Press **Load unpacked**.
9. Select that `extension` folder. DealFinder Poster appears in the list.
10. Pin it: puzzle-piece icon in the Chrome toolbar, then the pin next to DealFinder Poster.
11. Sign into the DealFinder staff desk in this same Chrome window.
12. Open **Admin → Buy Now** once and leave it open for a few seconds. That sends the Supabase connection into the extension. He does not paste the service role key.
13. Click the DealFinder Poster icon, then **Connect Supabase and profile**.
14. In **Personal profile**, type a name he will recognize, such as his own name.
15. Confirm the Supabase URL and anon key are already filled in. If they are empty, go back to Buy Now, refresh, then open the options again.
16. Press **Save connection**, then **Test Supabase**. The page should say Supabase answered.
17. Press **Open Facebook**, **Open Instagram**, **Open TikTok**, and **Open YouTube**. Each one should already be his account. If a site shows someone else, sign out and sign into his account, then leave it signed in.
18. If Meta Commerce Manager still has the old catalog feed scheduled, remove that feed. Marketplace posts come from this extension now.

Post a Buy Now item:

1. Open **Admin → Buy Now**.
2. On the lot, press **Fill Marketplace form**.
3. Facebook Marketplace opens with the title, price, photos, and description filled in.
4. If category or location is still empty, pick them on the Facebook form.
5. Press Facebook’s own **Publish** button.

Post a floor clip:

1. Open **Admin → Floor stream**.
2. On the clip, press **YouTube**, **Facebook**, **TikTok**, or **Instagram**.
3. That site’s upload form opens with the video and caption filled in.
4. Press that site’s own **Post** button.

He can also click the DealFinder Poster icon and use the **Buy Now** or **Floor clips** tab. Those lists come straight from Supabase and use the same fill-the-form steps.

---

## 10. Consignor payouts — desk checklist

1. Lot sells → consignor gets **Sold** email with the split.
2. Buyer pays Sunday invoice → tracking shows **Buyer paid — payout owed**.
3. You e-transfer (or send to the charity).
4. On Consignor tracking, open the item → **Mark payout sent**.
5. They get **Payout sent** email.
6. On `/consignor` they tap **Export paid-out and clear them**. The row leaves the main list. The Excel file still has it.

---

## 11. What refreshes on its own

| Screen | How often |
| --- | --- |
| Live grid | 4 seconds |
| Lot timer | 1 second |
| Lot bid/hammer | Realtime websocket after one fetch (refresh if it looks stuck) |
| Live Monitor | 4 seconds + realtime |
| Admin nav / notifications badge | 30 seconds |

---

## 12. Common “why is this happening?”

**A bidder saw someone else’s lots on checkout**  
That was a cache bug (API responses labelled public). It is fixed: `/api/*` is `private, no-store`, and checkout fetches with `cache: "no-store"`. Identity is the **bidder id**, not the display name.

**A gift / wrapped-present photo showed on every lot**  
A leftover stock image used to be appended whenever staff saved a lot. It has been stripped from existing lots and will not be added again. Only photos that belong to that item should appear.

**Consignor did not get a sold email**  
House stock is skipped. No email on file is skipped. Use **Email missing sold notices**. Confirm `ADMIN_NOTIFY_EMAIL` and Resend are working.

**Invoice assumed shipping**  
A mixed invoice (some ship, some pickup) now stays **unset** until every lot on it agrees. The email asks them to choose.

**Marketplace form did not fill**
Follow section 9 on **Admin → Operations guide**. Download DealFinder Poster, load it in the Chrome profile he posts from, then connect his own social accounts and Supabase. The button on each Buy Now lot is **Fill Marketplace form**. He still presses Publish himself.

---

## 13. Secrets and SQL (do not put these in Git)

Vercel env holds Helcim keys, Resend, `CRON_SECRET`, `ADMIN_PASSWORD`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_NOTIFY_EMAIL`.

If Trusted Client or Buy Now limits fail to save, run `supabase/sql-editor-buy-now-trusted.sql` in the Supabase SQL editor.

---

*End of guide. Update this file when a desk, email, or money rule changes, then redeploy so `/operations-guide` matches production.*
