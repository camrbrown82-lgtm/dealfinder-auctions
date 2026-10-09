-- Keep one tape row when the same paddle and amount were stored twice.
delete from public.bids
where id in (
  select id
  from (
    select
      id,
      row_number() over (
        partition by lot_id, bidder_name, amount
        order by created_at, id
      ) as n
    from public.bids
  ) ranked
  where n > 1
);
