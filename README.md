# DealFinder Auctions

Pop-art timed auctions for DealFinder in Airdrie, Alberta. Bidders paddle live lots, consignors submit inventory, and the desk runs the floor from an admin portal.

This Cursor project is a working copy of the live site at [dealfinder-auctions.vercel.app](https://dealfinder-auctions.vercel.app). The GitHub repo is private, so this workspace could not clone it. **You do not need a second copy of the Vercel project.** Vercel deploys the same Next.js app that lives in GitHub. What this environment needs from Vercel / Supabase are the **environment variables**, not another codebase.

## Run locally

```bash
npm install
cp .env.example .env.local   # optional — the floor runs without Supabase
npm run dev
```

Open [http://127.0.0.1:43173](http://127.0.0.1:43173).

- Staff desk password defaults to `hammer` (`ADMIN_PASSWORD`)
- Bidder accounts are created from **Log in → Sign Up**
- Invoices settle by Interac e-Transfer or pay on arrival — no card vault

## What you can do

- **Live floor** — search lots, change density, open a lot, live bid or absentee max, +2:00 anti-snipe
- **Consign** — drop photos, AI intake (demo generator unless you add `OPENAI_API_KEY`), commission split, approval queue
- **Admin** — live monitor, inventory, auction scheduler, customer paddles, email templates, payouts
- **Profile / checkout** — bidder card, Interac or desk settlement

## Supabase

Tables for this product already exist in your Supabase project (`zuqclcibzhguwbmelger`). This app runs on a local JSON store so the preview works immediately. To point it at Supabase, add these to `.env.local` (copy from Vercel → Settings → Environment Variables, or from the Supabase project API settings):

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_PASSWORD=
NEXT_PUBLIC_INTERAC_EMAIL=
NEXT_PUBLIC_PICKUP_INSTRUCTIONS=
```

`supabase/schema.sql` is the table layout this app expects (`profiles`, `auction_events`, `lots`, `bids`, `email_templates`). If your existing tables use different names, send a screenshot of the Table Editor and we can map them.

Storage bucket used on the live site: `consignment-images`.

## GitHub

Repo: `https://github.com/camrbrown82-lgtm/dealfinder-auctions` (private). If you make it public, or paste a zip / grant access, this workspace can track the original source instead of this reconstruction.
