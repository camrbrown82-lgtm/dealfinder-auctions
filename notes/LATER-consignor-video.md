# Later: consignor video submissions

Parked on October 2, 2026. Do not build or deploy this until it is thought through for DealFinder.

## What was asked

On the consignor portal, let someone film the items they want to consign and submit that video without running Auto-Generate.

## Why it is parked

A first pass was sketched and then taken back out of the app. It is not on the live site. Shipping it now would let a raw phone video skip cataloging while the rest of the desk still expects a titled lot, a buy now price, photos, and the consignment agreement.

## Decide before building it again

- Who writes the title, description, grade, and prices if the consignor does not use Auto-Generate.
- Whether a video alone is enough to enter the approval queue, or staff must still catalog it before it can be filed into a sale.
- Whether the clip stays private until approval. A public storage link would show unsold personal goods before the desk accepts them.
- How large a clip can be, and who pays for storage. Phone videos are much bigger than the current photo uploads.
- How this sits next to the charity checkbox and Buy Now. Each submit is one item and sends its own confirmation email.
- How Floor stream stays separate. That desk films new arrivals for the media page. This idea is a consignor sending goods in.

## What was removed

The sketch added a video picker on `/consignor`, a signed upload, a `video_url` column, and a player on the approval card. Those files were deleted so a later production deploy of this folder cannot turn the feature on by accident. Do not run a consignment-videos SQL file. None is in `supabase/migrations` anymore.
