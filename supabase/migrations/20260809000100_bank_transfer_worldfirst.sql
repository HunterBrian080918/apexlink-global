alter table public.payments
  add column if not exists payment_proof_url text;

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
      'awaiting_payment',
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
