begin;

alter table public.orders
  add column if not exists total_amount numeric(12, 2),
  add column if not exists shipping_amount numeric(12, 2),
  add column if not exists tax_amount numeric(12, 2),
  add column if not exists discount_amount numeric(12, 2),
  add column if not exists deposit_amount numeric(12, 2),
  add column if not exists balance_amount numeric(12, 2);

update public.orders
set
  shipping_amount = coalesce(shipping_amount, 0),
  tax_amount = coalesce(tax_amount, 0),
  discount_amount = coalesce(discount_amount, 0),
  total_amount = coalesce(total_amount, greatest(0, coalesce(subtotal, 0) - coalesce(discount_amount, 0)));

update public.orders
set deposit_amount = case
  when deposit_amount is not null then deposit_amount
  when purchase_mode = 'wholesale'
    and regexp_replace(coalesce(deposit_percentage, ''), '[^0-9.]', '', 'g') ~ '^[0-9]+(\.[0-9]+)?$' then
    round(
      total_amount *
      least(
        100,
        greatest(0, regexp_replace(deposit_percentage, '[^0-9.]', '', 'g')::numeric)
      ) / 100,
      2
    )
  else 0
end;

update public.orders
set balance_amount = coalesce(balance_amount, greatest(0, total_amount - deposit_amount));

alter table public.orders
  alter column total_amount set default 0,
  alter column shipping_amount set default 0,
  alter column tax_amount set default 0,
  alter column discount_amount set default 0,
  alter column deposit_amount set default 0,
  alter column balance_amount set default 0;

alter table public.orders
  alter column total_amount set not null,
  alter column shipping_amount set not null,
  alter column tax_amount set not null,
  alter column discount_amount set not null,
  alter column deposit_amount set not null,
  alter column balance_amount set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_payment_amounts_nonnegative_check'
  ) then
    alter table public.orders
      add constraint orders_payment_amounts_nonnegative_check
      check (
        total_amount >= 0
        and shipping_amount >= 0
        and tax_amount >= 0
        and discount_amount >= 0
        and deposit_amount >= 0
        and balance_amount >= 0
      ) not valid;
  end if;
end $$;

alter table public.orders
  validate constraint orders_payment_amounts_nonnegative_check;

create index if not exists orders_payment_status_created_at_idx
  on public.orders (payment_status, created_at desc);

commit;
