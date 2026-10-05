-- Replace the four consignor commission tiers with the shorter schedule.

update public.app_rules
set
  body = $rule$Consignors do not choose a commission. Apply this to the price the lot actually sells for.
For lots sold at $50 or below: A commission rate of 50% will apply, to a maximum commission of $10.
For lots sold after $50: A commission rate of 20% will apply.
This commission is not the buyer's 15% premium.$rule$,
  updated_at = now()
where slug = 'consignor-commission';
