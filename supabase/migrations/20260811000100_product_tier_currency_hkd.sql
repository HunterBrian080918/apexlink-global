alter table public.product_price_tiers
add column if not exists currency text not null default 'USD';

alter table public.product_price_tiers
drop constraint if exists product_price_tiers_currency_check;

alter table public.product_price_tiers
add constraint product_price_tiers_currency_check
check (currency in ('USD', 'HKD'));

update public.product_price_tiers
set currency = 'USD'
where currency is null or btrim(currency) = '';

create index if not exists product_price_tiers_product_currency_sort_idx
on public.product_price_tiers (product_id, currency, sort_order);
