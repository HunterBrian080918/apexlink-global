create table if not exists public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null check (
    type in (
      'new_contact_inquiry',
      'new_support_message',
      'new_quote_request',
      'new_retail_order',
      'new_wholesale_inquiry',
      'new_payment',
      'customer_reply'
    )
  ),
  title text not null,
  message text,
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists admin_notifications_created_at_idx on public.admin_notifications (created_at desc);
create index if not exists admin_notifications_is_read_idx on public.admin_notifications (is_read);
create index if not exists admin_notifications_type_idx on public.admin_notifications (type);

alter table public.admin_notifications enable row level security;
drop policy if exists "admin_notifications_admin_manage" on public.admin_notifications;
drop policy if exists "admin_notifications_public_read" on public.admin_notifications;
drop policy if exists "admin_notifications_public_write" on public.admin_notifications;

alter table public.customers
  add column if not exists whatsapp text,
  add column if not exists company text,
  add column if not exists customer_type text not null default 'retail',
  add column if not exists customer_status text not null default 'new',
  add column if not exists tags text[] not null default '{}',
  add column if not exists notes text,
  add column if not exists is_vip boolean not null default false,
  add column if not exists is_blacklisted boolean not null default false,
  add column if not exists last_contact_at timestamptz;

alter table public.products drop constraint if exists products_status_check;
alter table public.products
  add constraint products_status_check
  check (status in ('active', 'draft', 'hidden', 'archived'));
