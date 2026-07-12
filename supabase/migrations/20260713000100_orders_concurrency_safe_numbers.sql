begin;

create table if not exists public.daily_order_sequences (
  date_key text primary key check (date_key ~ '^[0-9]{6}$'),
  current_number integer not null default 0 check (current_number >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists daily_order_sequences_updated_at_idx
  on public.daily_order_sequences (updated_at desc);

drop trigger if exists set_daily_order_sequences_updated_at on public.daily_order_sequences;
create trigger set_daily_order_sequences_updated_at
before update on public.daily_order_sequences
for each row execute function public.set_updated_at();

create or replace function public.create_order_with_number(p_order jsonb, p_date_key text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_date_key text := nullif(trim(coalesce(p_date_key, '')), '');
  next_sequence integer;
  order_record public.orders;
  inserted_order public.orders;
begin
  if normalized_date_key is null then
    normalized_date_key := to_char(current_date, 'YYMMDD');
  end if;

  if normalized_date_key !~ '^[0-9]{6}$' then
    raise exception 'Invalid date key for order number: %', normalized_date_key;
  end if;

  insert into public.daily_order_sequences as seq (date_key, current_number, created_at, updated_at)
  values (normalized_date_key, 1, now(), now())
  on conflict (date_key)
  do update
    set current_number = seq.current_number + 1,
        updated_at = now()
  returning current_number into next_sequence;

  order_record := jsonb_populate_record(null::public.orders, coalesce(p_order, '{}'::jsonb));
  order_record.id := coalesce(nullif(order_record.id, ''), gen_random_uuid()::text);
  order_record.order_id := format('APL-%s-%s', normalized_date_key, lpad(next_sequence::text, 5, '0'));
  order_record.source := coalesce(order_record.source, 'website');
  order_record.status := coalesce(order_record.status, 'unprocessed');
  order_record.currency := coalesce(order_record.currency, 'USD');
  order_record.quantity := coalesce(order_record.quantity, 1);
  order_record.unit_price := coalesce(order_record.unit_price, 0);
  order_record.subtotal := coalesce(order_record.subtotal, 0);
  order_record.shipping_status := coalesce(order_record.shipping_status, 'not_started');
  order_record.created_at := coalesce(order_record.created_at, now());
  order_record.updated_at := coalesce(order_record.updated_at, order_record.created_at);

  insert into public.orders
  select (order_record).*
  returning * into inserted_order;

  return to_jsonb(inserted_order);
end;
$$;

revoke all on function public.create_order_with_number(jsonb, text) from public;
grant execute on function public.create_order_with_number(jsonb, text) to service_role;

comment on table public.daily_order_sequences is 'Atomic per-day order sequence counters used to generate concurrent-safe APL-YYMMDD-00001 style order numbers.';
comment on function public.create_order_with_number(jsonb, text) is 'Creates an order row and assigns a concurrent-safe daily order number inside one database transaction.';

commit;
