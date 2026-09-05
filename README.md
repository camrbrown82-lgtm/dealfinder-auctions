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

## Prompt execution checklist

- [x] Prompt 1: Project initialization & Tailwind setup
- [x] Prompt 2: Supabase database schema migration (`supabase/migrations/20260903_init.sql`)
- [x] Prompt 3: AI item intake & consignor portal (`/consignor`)
- [x] Prompt 4: Realtime bidding & timed countdown (`/auctions/[id]`)
- [x] Prompt 5: Admin control panel & inventory (`/admin`)

## Setup

1. Fill `.env.local` (`OPENAI_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, optional `SUPABASE_SERVICE_ROLE_KEY`).
2. In the Supabase SQL editor, run `supabase/migrations/20260903_init.sql`, then `supabase/migrations/20260903_consignor_pricing.sql`, then `supabase/migrations/20260903_anti_snipe_absentee.sql`, then `supabase/migrations/20260903_admin_events.sql`.
3. Enable Realtime for `lots`, `bids`, and `consignments` if the publication block was skipped.
4. Set `ADMIN_PASSWORD` (demo default: `hammer`).
5. `npm install` then `npm run dev` → http://localhost:3000

Without Supabase keys the UI runs in demo mode (in-memory mock lots).

## Prompt log

- 2026-09-03 — Scaffolded the App Router tree (layout, live grid, lot page, consignor intake, admin, GPT-4o route).
- 2026-09-03 — Roadmap: locked the four-color palette, added the Postgres schema (lots / bids / consignments, bid trigger, RLS, storage, seed data), queued AI intake into `consignments`, subscribed lot pages to Realtime bid updates, and wired admin approve/hold/pause to the database.
- 2026-09-03 — Prompt 3: GPT-4o intake returns title, description, suggested_starting_bid, and estimated_market_value from photo URLs; consignor dashboard adds drag-drop + camera, auto-generate, reserve/start/commission split, and a pending/live/sold status table.
- 2026-09-03 — Prompt 4: auction lots get a red/cream comic room, bids-table realtime, +2:00 anti-snipe in the last two minutes, and live vs absentee max auto-increment bidding.
- 2026-09-03 — Prompt 5: password-gated admin desk with AI queue edits, auction event scheduler, inventory search/removal/bulk seed, and consignor payout report.
