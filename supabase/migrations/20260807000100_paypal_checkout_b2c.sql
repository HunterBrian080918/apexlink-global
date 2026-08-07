alter table public.payments
  add column if not exists payment_provider text,
  add column if not exists transaction_id text,
  add column if not exists paypal_order_id text,
  add column if not exists paypal_capture_id text;

create unique index if not exists payments_paypal_order_id_key
  on public.payments (paypal_order_id)
  where paypal_order_id is not null;

create unique index if not exists payments_paypal_capture_id_key
  on public.payments (paypal_capture_id)
  where paypal_capture_id is not null;

create index if not exists payments_transaction_id_idx
  on public.payments (transaction_id);

do $$
declare
  constraint_name text;
begin
  select con.conname
    into constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'payments'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%status%'
  order by con.conname
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.payments drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.payments
  add constraint payments_status_check
  check (
    status in (
      'unpaid',
      'pending',
      'awaiting_payment',
      'awaiting-payment',
      'payment_submitted',
      'payment-submitted',
      'deposit_paid',
      'partially_paid',
      'paid',
      'failed',
      'refunded',
      'partially_refunded',
      'cancelled'
    )
  );

do $$
declare
  constraint_name text;
begin
  select con.conname
    into constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'orders'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%order_status%'
  order by con.conname
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.orders drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.orders
  add constraint orders_order_status_check
  check (
    order_status is null
    or order_status = ''
    or order_status in (
      'pending_payment',
      'paid',
      'processing',
      'inquiry_received',
      'quote_pending',
      'awaiting_confirmation',
      'awaiting_deposit',
      'in_production',
      'quality_inspection',
      'awaiting_balance',
      'ready_to_ship',
      'shipped',
      'delivered',
      'completed',
      'cancelled'
    )
  );

do $$
declare
  constraint_name text;
begin
  select con.conname
    into constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'orders'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%payment_status%'
  order by con.conname
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.orders drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.orders
  add constraint orders_payment_status_check
  check (
    payment_status is null
    or payment_status = ''
    or payment_status in (
      'unpaid',
      'pending',
      'deposit_paid',
      'partially_paid',
      'paid',
      'failed',
      'refunded',
      'partially_refunded',
      'cancelled'
    )
  );
