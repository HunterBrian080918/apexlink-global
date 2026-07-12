begin;

do $$
declare
  existing_constraint_name text;
begin
  select con.conname
  into existing_constraint_name
  from pg_constraint con
  where con.conrelid = 'public.orders'::regclass
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%order_status%';

  if existing_constraint_name is not null then
    execute format(
      'alter table public.orders drop constraint %I',
      existing_constraint_name
    );
  end if;
end
$$;

alter table public.orders
  add constraint orders_order_status_check
  check (
    order_status is null
    or order_status = ''
    or order_status in (
      'pending_payment',
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

commit;
