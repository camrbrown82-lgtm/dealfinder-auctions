-- Upcoming weeks accept bids. Only those with a bid appear on the live monitor.

update public.app_rules
set
  body = $rule$A regular auction is the standard weekly sale, Monday through Sunday. The current week and later weeks both accept bids. Up to two earlier weeks are view only. A bid on a later week is tracked on the live monitor, after this week's lots. A bid in the last 2 minutes extends that lot's clock by 2 minutes. The next bid step is $1 under $51, $2 from $51 to $99, and $5 at $100 and above. Max Bid is the most the bidder will pay; the app bids only as far as the next step requires.$rule$,
  updated_at = now()
where slug = 'auction-regular';
