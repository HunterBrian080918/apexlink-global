begin;

alter table public.orders
  add column if not exists shipping_status text;

update public.orders
set shipping_status = 'not_started'
where shipping_status is null
   or btrim(shipping_status) = ''
   or shipping_status not in (
     'not_started',
     'preparing',
     'packed',
     'shipped',
     'in_transit',
     'delivered',
     'exception'
   );

alter table public.orders
  alter column shipping_status set default 'not_started';

alter table public.orders
  alter column shipping_status set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_shipping_status_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_shipping_status_check
      check (
        shipping_status in (
          'not_started',
          'preparing',
          'packed',
          'shipped',
          'in_transit',
          'delivered',
          'exception'
        )
      );
  end if;
end
$$;

create index if not exists orders_shipping_status_idx
  on public.orders (shipping_status);

create table if not exists public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references public.orders (id) on delete cascade,
  event_type text not null check (
    event_type in (
      'order_created',
      'quote_created',
      'customer_confirmed',
      'deposit_requested',
      'deposit_received',
      'production_started',
      'quality_inspection_started',
      'quality_inspection_completed',
      'balance_requested',
      'balance_received',
      'packed',
      'shipped',
      'delivered',
      'cancelled',
      'refunded',
      'admin_note_added',
      'order_status_changed',
      'payment_status_changed',
      'shipping_status_changed',
      'payment_created',
      'payment_marked_paid'
    )
  ),
  title text not null,
  description text,
  created_by text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists order_events_order_id_idx
  on public.order_events (order_id);

create index if not exists order_events_created_at_idx
  on public.order_events (created_at desc);

create index if not exists order_events_event_type_idx
  on public.order_events (event_type);

create index if not exists order_events_order_created_idx
  on public.order_events (order_id, created_at desc);

alter table public.order_events enable row level security;

drop policy if exists "order_events_admin_manage" on public.order_events;
create policy "order_events_admin_manage"
on public.order_events
for all
using (public.is_admin())
with check (public.is_admin());

commit;
