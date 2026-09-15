# DealFinder Auctions

Pop-art live auction house: consignor AI intake, admin inventory, realtime lot pages.

## Brand palette

- Bright Red `#FF0000`
- Cream `#FFF7D1`
- Pure Black `#000000`
- Bright White `#FFFFFF`

## Architecture

- Next.js (App Router) + TypeScript
- Tailwind CSS (pop-art / comic)
- Supabase (PostgreSQL + Realtime)
- OpenAI GPT-4o vision
- Helcim (HelcimPay.js + Payment API) for card checkout and the $50 bid pre-authorization

## Payments

Cash and Interac e-Transfer are retired. Every payment prompt uses Helcim.

- **Bid:** Helcim places a **$50 CAD pre-authorization** as soon as a paddle is dropped. This is a hold, not a charge — it proves the card is valid and protects the house if a winner walks. Copy on the bid ticket explains this.
- **Checkout:** the hammer is charged through Helcim. When that sale goes through, we reverse the $50 hold so it is released back to the card.
- Without `HELCIM_API_TOKEN` the site still runs: the Helcim modal offers a local test approval so you can walk the flow before the sandbox token arrives.

Copy `.env.example` to `.env.local` and fill the Helcim block. On Vercel, add the same keys before redeploy. In the Helcim dashboard API Access Configuration, whitelist `localhost`, the Vercel domain, and any custom domain (skipped on developer test accounts).

## Setup

1. Fill `.env.local` from `.env.example` (`OPENAI_API_KEY`, Supabase, Helcim, optional `SUPABASE_SERVICE_ROLE_KEY` / Resend).
2. In the Supabase SQL editor, run historical migrations as needed, then **run the Helcim SQL** in `supabase/sql-editor-helcim.sql` (Query 1, then Query 2).
3. Enable Realtime for `lots`, `bids`, and `consignments` if the publication block was skipped.
4. Set `ADMIN_PASSWORD` (demo default: `hammer`).
5. `npm install` then `npm run dev` → http://localhost:43173

Without Supabase keys the UI runs in demo mode (in-memory mock lots).

### Helcim SQL editor queries

Paste `supabase/sql-editor-helcim.sql` into the Supabase SQL editor.

**Query 1** adds `helcim_card` to the old payment enum. Run it first and wait for success (Postgres must commit the new enum value before it can be used).

**Query 2** converts `profiles.payment_method` to text, migrates every paddle off Interac / pay-on-arrival onto Helcim, and adds:

- `profiles.helcim_card_token`, `helcim_customer_code`, `preauth_*` columns
- `lots.paid_at`, `lots.helcim_purchase_transaction_id`
- `helcim_sessions` and `helcim_transactions` ledgers (service-role only)

## Prompt log

- 2026-09-03 — Scaffolded the App Router tree (layout, live grid, lot page, consignor intake, admin, GPT-4o route).
- 2026-09-03 — Roadmap: locked the four-color palette, added the Postgres schema (lots / bids / consignments, bid trigger, RLS, storage, seed data), queued AI intake into `consignments`, subscribed lot pages to Realtime bid updates, and wired admin approve/hold/pause to the database.
- 2026-09-03 — Prompt 3: GPT-4o intake returns title, description, suggested_starting_bid, and estimated_market_value from photo URLs; consignor dashboard adds drag-drop + camera, auto-generate, reserve/start/commission split, and a pending/live/sold status table.
- 2026-09-03 — Prompt 4: auction lots get a red/cream comic room, bids-table realtime, +2:00 anti-snipe in the last two minutes, and live vs absentee max auto-increment bidding.
- 2026-09-03 — Prompt 5: password-gated admin desk with AI queue edits, auction event scheduler, inventory search/removal/bulk seed, and consignor payout report.
- 2026-09-15 — Helcim card checkout everywhere payments were prompted; $50 bid pre-auth with disclaimer; cash and e-Transfer removed; hold released after hammer checkout.
