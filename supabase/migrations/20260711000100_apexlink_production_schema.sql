begin;

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.admin_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text unique,
  role text not null default 'admin' check (role in ('admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_profiles
    where user_id = auth.uid()
      and role = 'admin'
  );
$$;

create table if not exists public.customers (
  id text primary key default gen_random_uuid()::text,
  name text,
  email text,
  phone text,
  country text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id text primary key,
  slug text unique,
  name text not null,
  category text,
  image_url text,
  price_value numeric(12, 2) not null default 0,
  price_label text not null default '$0.00',
  moq_value integer not null default 1 check (moq_value >= 0),
  moq_label text not null default '1 units',
  shipping_days integer not null default 1 check (shipping_days >= 0),
  shipping_time text,
  stock integer not null default 0,
  status text not null default 'active' check (status in ('active', 'draft', 'archived')),
  description text,
  detail_description text,
  seo_title text,
  meta_description text,
  keywords text[] not null default '{}',
  functions text[] not null default '{}',
  scenarios text[] not null default '{}',
  markets text[] not null default '{}',
  tags text[] not null default '{}',
  specs jsonb not null default '{}'::jsonb,
  b2c_enabled boolean not null default true,
  b2c_retail_price numeric(12, 2) not null default 0,
  b2c_compare_at_price numeric(12, 2) not null default 0,
  b2c_retail_stock integer not null default 0,
  b2c_minimum_quantity integer not null default 1 check (b2c_minimum_quantity >= 1),
  b2b_enabled boolean not null default true,
  b2b_wholesale_moq integer not null default 1 check (b2b_wholesale_moq >= 1),
  b2b_wholesale_lead_time integer not null default 1 check (b2b_wholesale_lead_time >= 0),
  b2b_deposit_terms text,
  b2b_deposit_required boolean not null default false,
  b2b_deposit_type text not null default 'percentage' check (b2b_deposit_type in ('percentage', 'fixed')),
  b2b_deposit_value numeric(12, 2) not null default 0,
  b2b_balance_due_stage text not null default 'before-shipment' check (b2b_balance_due_stage in ('before-production', 'before-shipment', 'custom')),
  b2b_custom_payment_terms text,
  b2b_deposit_refundable boolean not null default false,
  b2b_deposit_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_images (
  id text primary key default gen_random_uuid()::text,
  product_id text not null references public.products (id) on delete cascade,
  image_type text not null check (image_type in ('main', 'detail', 'gallery')),
  url text not null,
  title text,
  detail_text text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_price_tiers (
  id text primary key default gen_random_uuid()::text,
  product_id text not null references public.products (id) on delete cascade,
  min_quantity integer not null check (min_quantity >= 1),
  max_quantity integer check (max_quantity is null or max_quantity >= min_quantity),
  unit_price numeric(12, 2) not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.media_assets (
  id text primary key default gen_random_uuid()::text,
  name text,
  url text not null unique,
  media_type text not null default 'image',
  usage text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id text primary key default gen_random_uuid()::text,
  order_id text,
  source text not null default 'checkout',
  status text not null default 'unprocessed' check (status in ('unprocessed', 'processed')),
  order_status text check (order_status is null or order_status = '' or order_status in ('pending_payment', 'processing', 'completed', 'cancelled')),
  payment_status text check (payment_status is null or payment_status = '' or payment_status in ('pending', 'paid', 'failed', 'refunded')),
  purchase_mode text check (purchase_mode is null or purchase_mode = '' or purchase_mode in ('retail', 'wholesale')),
  currency text not null default 'USD',
  payment_terms text,
  deposit_percentage text,
  customer_id text references public.customers (id) on delete set null,
  customer_name text,
  country text,
  email text,
  phone text,
  shipping_address text,
  product_id text references public.products (id) on delete set null,
  product_name text,
  quantity integer not null default 1 check (quantity >= 1),
  unit_price numeric(12, 2) not null default 0,
  subtotal numeric(12, 2) not null default 0,
  moq text,
  budget text,
  shipping_cycle text,
  message text,
  admin_note text,
  payment_method text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id text primary key default gen_random_uuid()::text,
  order_id text not null references public.orders (id) on delete cascade,
  product_id text references public.products (id) on delete set null,
  product_name text not null,
  purchase_mode text check (purchase_mode in ('retail', 'wholesale')),
  quantity integer not null default 1 check (quantity >= 1),
  unit_price numeric(12, 2) not null default 0,
  subtotal numeric(12, 2) not null default 0,
  moq text,
  shipping_cycle text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payments (
  id text primary key default gen_random_uuid()::text,
  payment_id text,
  order_id text not null references public.orders (id) on delete cascade,
  product text,
  customer text,
  order_type text not null default 'retail' check (order_type in ('retail', 'wholesale')),
  payment_type text not null default 'full-payment' check (payment_type in ('deposit', 'full-payment', 'balance', 'refund')),
  payment_method text,
  settlement_channel text,
  amount numeric(12, 2) not null default 0,
  currency text not null default 'USD',
  deposit_amount numeric(12, 2) not null default 0,
  balance_amount numeric(12, 2) not null default 0,
  billing_address text,
  customer_email text,
  customer_phone text,
  status text not null default 'pending' check (status in ('pending', 'awaiting-payment', 'payment-submitted', 'paid', 'failed', 'refunded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz
);

create table if not exists public.contact_messages (
  id text primary key default gen_random_uuid()::text,
  customer_id text references public.customers (id) on delete set null,
  source text not null default 'contact',
  status text not null default 'unprocessed' check (status in ('unprocessed', 'processed')),
  customer_name text,
  email text,
  phone text,
  country text,
  product_interest text,
  message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_conversations (
  id text primary key default gen_random_uuid()::text,
  customer_id text references public.customers (id) on delete set null,
  customer_name text,
  email text,
  country text,
  source text not null default 'support',
  status text not null default 'open' check (status in ('open', 'replied', 'closed')),
  last_admin_read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_messages (
  id text primary key default gen_random_uuid()::text,
  conversation_id text not null references public.support_conversations (id) on delete cascade,
  sender text not null check (sender in ('customer', 'admin', 'assistant')),
  text text,
  image_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.website_settings (
  id integer primary key default 1 check (id = 1),
  brand_name text,
  brand_logo_top text,
  brand_logo_bottom text,
  brand_logo_image text,
  favicon text,
  browser_title text,
  brand_subtitle text,
  hero_eyebrow text,
  hero_title text,
  hero_subtitle text,
  hero_background_image text,
  hero_banner text,
  hero_cta_primary_label text,
  hero_cta_primary_link text,
  hero_cta_secondary_label text,
  hero_cta_secondary_link text,
  trusted_badges text[] not null default '{}',
  featured_product_id text references public.products (id) on delete set null,
  spotlight_title text,
  spotlight_subtitle text,
  about_title text,
  about_text text,
  about_points text[] not null default '{}',
  footer_tagline text,
  footer_copyright text,
  contact_email text,
  contact_phone text,
  contact_address text,
  social_linkedin text,
  social_whatsapp text,
  social_instagram text,
  social_x text,
  seo_meta_description text,
  seo_meta_keywords text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  id integer primary key default 1 check (id = 1),
  platform_name text,
  platform_version integer not null default 1,
  admin_login_email text,
  recovery_email text,
  payment_methods text[] not null default '{}',
  language text,
  theme_color text,
  system_config text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_match_rules (
  id integer primary key default 1 check (id = 1),
  usage_count bigint not null default 0,
  price_range_rule jsonb not null default '{"overPenaltyMultiplier": 1.1, "underPenaltyMultiplier": 0.6}'::jsonb,
  moq_rule jsonb not null default '{"penaltyDivisor": 25, "preferredThreshold": 200}'::jsonb,
  shipping_rule jsonb not null default '{"penaltyPerDay": 1}'::jsonb,
  recommendation_rule jsonb not null default '{"baseScore": 58, "budgetWeight": 18, "shippingWeight": 15, "moqWeight": 14, "keywordWeight": 18, "notesWeight": 10, "regionWeight": 9, "fallbackLimit": 3}'::jsonb,
  last_run_criteria jsonb,
  last_run_product_ids text[] not null default '{}',
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_match_logs (
  id text primary key default gen_random_uuid()::text,
  criteria jsonb not null default '{}'::jsonb,
  matched_product_ids text[] not null default '{}',
  matched_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.analytics_totals (
  id integer primary key default 1 check (id = 1),
  total_visits bigint not null default 0,
  total_ai_match bigint not null default 0,
  total_inquiries bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.analytics_daily_stats (
  event_date date primary key,
  visit_count integer not null default 0,
  ai_match_count integer not null default 0,
  inquiry_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.analytics_events (
  id text primary key default gen_random_uuid()::text,
  event_type text not null check (event_type in ('visit', 'ai_match', 'inquiry')),
  path text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

insert into public.website_settings (id)
values (1)
on conflict (id) do nothing;

insert into public.app_settings (id)
values (1)
on conflict (id) do nothing;

insert into public.ai_match_rules (id)
values (1)
on conflict (id) do nothing;

insert into public.analytics_totals (id)
values (1)
on conflict (id) do nothing;

create unique index if not exists orders_order_id_key on public.orders (order_id) where order_id is not null;
create unique index if not exists payments_payment_id_key on public.payments (payment_id) where payment_id is not null;

create index if not exists admin_profiles_email_idx on public.admin_profiles (email);
create index if not exists customers_email_idx on public.customers (email);
create index if not exists customers_country_idx on public.customers (country);
create index if not exists products_category_status_idx on public.products (category, status);
create index if not exists products_updated_at_idx on public.products (updated_at desc);
create index if not exists products_keywords_gin_idx on public.products using gin (keywords);
create index if not exists products_functions_gin_idx on public.products using gin (functions);
create index if not exists products_scenarios_gin_idx on public.products using gin (scenarios);
create index if not exists products_markets_gin_idx on public.products using gin (markets);
create index if not exists products_tags_gin_idx on public.products using gin (tags);
create index if not exists products_specs_gin_idx on public.products using gin (specs);
create index if not exists product_images_product_sort_idx on public.product_images (product_id, image_type, sort_order);
create index if not exists product_price_tiers_product_sort_idx on public.product_price_tiers (product_id, sort_order);
create index if not exists media_assets_type_idx on public.media_assets (media_type);
create index if not exists orders_status_idx on public.orders (status, order_status, payment_status);
create index if not exists orders_customer_id_idx on public.orders (customer_id);
create index if not exists orders_customer_email_idx on public.orders (email);
create index if not exists orders_product_id_idx on public.orders (product_id);
create index if not exists orders_created_at_idx on public.orders (created_at desc);
create index if not exists order_items_order_id_idx on public.order_items (order_id);
create index if not exists order_items_product_id_idx on public.order_items (product_id);
create index if not exists payments_order_id_idx on public.payments (order_id);
create index if not exists payments_status_idx on public.payments (status, created_at desc);
create index if not exists contact_messages_customer_id_idx on public.contact_messages (customer_id);
create index if not exists contact_messages_status_idx on public.contact_messages (status, created_at desc);
create index if not exists support_conversations_customer_id_idx on public.support_conversations (customer_id);
create index if not exists support_conversations_status_idx on public.support_conversations (status, updated_at desc);
create index if not exists support_messages_conversation_idx on public.support_messages (conversation_id, created_at);
create index if not exists website_settings_featured_product_id_idx on public.website_settings (featured_product_id);
create index if not exists ai_match_logs_created_at_idx on public.ai_match_logs (created_at desc);
create index if not exists analytics_events_type_created_idx on public.analytics_events (event_type, created_at desc);
create index if not exists analytics_events_path_idx on public.analytics_events (path);

drop trigger if exists set_admin_profiles_updated_at on public.admin_profiles;
create trigger set_admin_profiles_updated_at
before update on public.admin_profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_customers_updated_at on public.customers;
create trigger set_customers_updated_at
before update on public.customers
for each row execute function public.set_updated_at();

drop trigger if exists set_products_updated_at on public.products;
create trigger set_products_updated_at
before update on public.products
for each row execute function public.set_updated_at();

drop trigger if exists set_product_images_updated_at on public.product_images;
create trigger set_product_images_updated_at
before update on public.product_images
for each row execute function public.set_updated_at();

drop trigger if exists set_product_price_tiers_updated_at on public.product_price_tiers;
create trigger set_product_price_tiers_updated_at
before update on public.product_price_tiers
for each row execute function public.set_updated_at();

drop trigger if exists set_media_assets_updated_at on public.media_assets;
create trigger set_media_assets_updated_at
before update on public.media_assets
for each row execute function public.set_updated_at();

drop trigger if exists set_orders_updated_at on public.orders;
create trigger set_orders_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

drop trigger if exists set_order_items_updated_at on public.order_items;
create trigger set_order_items_updated_at
before update on public.order_items
for each row execute function public.set_updated_at();

drop trigger if exists set_payments_updated_at on public.payments;
create trigger set_payments_updated_at
before update on public.payments
for each row execute function public.set_updated_at();

drop trigger if exists set_contact_messages_updated_at on public.contact_messages;
create trigger set_contact_messages_updated_at
before update on public.contact_messages
for each row execute function public.set_updated_at();

drop trigger if exists set_support_conversations_updated_at on public.support_conversations;
create trigger set_support_conversations_updated_at
before update on public.support_conversations
for each row execute function public.set_updated_at();

drop trigger if exists set_website_settings_updated_at on public.website_settings;
create trigger set_website_settings_updated_at
before update on public.website_settings
for each row execute function public.set_updated_at();

drop trigger if exists set_app_settings_updated_at on public.app_settings;
create trigger set_app_settings_updated_at
before update on public.app_settings
for each row execute function public.set_updated_at();

drop trigger if exists set_ai_match_rules_updated_at on public.ai_match_rules;
create trigger set_ai_match_rules_updated_at
before update on public.ai_match_rules
for each row execute function public.set_updated_at();

drop trigger if exists set_analytics_totals_updated_at on public.analytics_totals;
create trigger set_analytics_totals_updated_at
before update on public.analytics_totals
for each row execute function public.set_updated_at();

drop trigger if exists set_analytics_daily_stats_updated_at on public.analytics_daily_stats;
create trigger set_analytics_daily_stats_updated_at
before update on public.analytics_daily_stats
for each row execute function public.set_updated_at();

alter table public.admin_profiles enable row level security;
alter table public.customers enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.product_price_tiers enable row level security;
alter table public.media_assets enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.contact_messages enable row level security;
alter table public.support_conversations enable row level security;
alter table public.support_messages enable row level security;
alter table public.website_settings enable row level security;
alter table public.app_settings enable row level security;
alter table public.ai_match_rules enable row level security;
alter table public.ai_match_logs enable row level security;
alter table public.analytics_totals enable row level security;
alter table public.analytics_daily_stats enable row level security;
alter table public.analytics_events enable row level security;

drop policy if exists "admin_profiles_self_or_admin_select" on public.admin_profiles;
create policy "admin_profiles_self_or_admin_select"
on public.admin_profiles
for select
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "admin_profiles_admin_manage" on public.admin_profiles;
create policy "admin_profiles_admin_manage"
on public.admin_profiles
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "customers_admin_manage" on public.customers;
create policy "customers_admin_manage"
on public.customers
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "products_public_read" on public.products;
create policy "products_public_read"
on public.products
for select
using (status = 'active' or public.is_admin());

drop policy if exists "products_admin_manage" on public.products;
create policy "products_admin_manage"
on public.products
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "product_images_public_read" on public.product_images;
create policy "product_images_public_read"
on public.product_images
for select
using (
  exists (
    select 1
    from public.products p
    where p.id = product_images.product_id
      and (p.status = 'active' or public.is_admin())
  )
);

drop policy if exists "product_images_admin_manage" on public.product_images;
create policy "product_images_admin_manage"
on public.product_images
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "product_price_tiers_public_read" on public.product_price_tiers;
create policy "product_price_tiers_public_read"
on public.product_price_tiers
for select
using (
  exists (
    select 1
    from public.products p
    where p.id = product_price_tiers.product_id
      and (p.status = 'active' or public.is_admin())
  )
);

drop policy if exists "product_price_tiers_admin_manage" on public.product_price_tiers;
create policy "product_price_tiers_admin_manage"
on public.product_price_tiers
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "media_assets_public_read" on public.media_assets;
create policy "media_assets_public_read"
on public.media_assets
for select
using (true);

drop policy if exists "media_assets_admin_manage" on public.media_assets;
create policy "media_assets_admin_manage"
on public.media_assets
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "orders_admin_manage" on public.orders;
create policy "orders_admin_manage"
on public.orders
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "order_items_admin_manage" on public.order_items;
create policy "order_items_admin_manage"
on public.order_items
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "payments_admin_manage" on public.payments;
create policy "payments_admin_manage"
on public.payments
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "contact_messages_public_insert" on public.contact_messages;
create policy "contact_messages_public_insert"
on public.contact_messages
for insert
with check (true);

drop policy if exists "contact_messages_admin_manage" on public.contact_messages;
create policy "contact_messages_admin_manage"
on public.contact_messages
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "support_conversations_public_insert" on public.support_conversations;
create policy "support_conversations_public_insert"
on public.support_conversations
for insert
with check (true);

drop policy if exists "support_conversations_admin_manage" on public.support_conversations;
create policy "support_conversations_admin_manage"
on public.support_conversations
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "support_messages_public_insert" on public.support_messages;
create policy "support_messages_public_insert"
on public.support_messages
for insert
with check (true);

drop policy if exists "support_messages_admin_manage" on public.support_messages;
create policy "support_messages_admin_manage"
on public.support_messages
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "website_settings_public_read" on public.website_settings;
create policy "website_settings_public_read"
on public.website_settings
for select
using (true);

drop policy if exists "website_settings_admin_manage" on public.website_settings;
create policy "website_settings_admin_manage"
on public.website_settings
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "app_settings_admin_manage" on public.app_settings;
create policy "app_settings_admin_manage"
on public.app_settings
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "ai_match_rules_public_read" on public.ai_match_rules;
create policy "ai_match_rules_public_read"
on public.ai_match_rules
for select
using (true);

drop policy if exists "ai_match_rules_admin_manage" on public.ai_match_rules;
create policy "ai_match_rules_admin_manage"
on public.ai_match_rules
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "ai_match_logs_public_insert" on public.ai_match_logs;
create policy "ai_match_logs_public_insert"
on public.ai_match_logs
for insert
with check (true);

drop policy if exists "ai_match_logs_admin_manage" on public.ai_match_logs;
create policy "ai_match_logs_admin_manage"
on public.ai_match_logs
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "analytics_totals_admin_manage" on public.analytics_totals;
create policy "analytics_totals_admin_manage"
on public.analytics_totals
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "analytics_daily_stats_admin_manage" on public.analytics_daily_stats;
create policy "analytics_daily_stats_admin_manage"
on public.analytics_daily_stats
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "analytics_events_public_insert" on public.analytics_events;
create policy "analytics_events_public_insert"
on public.analytics_events
for insert
with check (event_type in ('visit', 'ai_match', 'inquiry'));

drop policy if exists "analytics_events_admin_manage" on public.analytics_events;
create policy "analytics_events_admin_manage"
on public.analytics_events
for all
using (public.is_admin())
with check (public.is_admin());

comment on table public.admin_profiles is 'Supabase Auth-backed admin role mapping for /admin access.';
comment on table public.products is 'Primary product catalog table mapped from data/products.json and current product editor fields.';
comment on table public.product_images is 'Main, detail, and gallery images for products; detail_text maps current detailImages[].text.';
comment on table public.product_price_tiers is 'Wholesale price tiers mapped from product.b2b.priceTiers.';
comment on table public.orders is 'Order and inquiry header data mapped from the current inquiries/order flow.';
comment on table public.order_items is 'Line items for orders; current storefront creates one item per order.';
comment on table public.payments is 'Payment records linked to orders, supporting deposit/full/balance/refund flows.';
comment on table public.contact_messages is 'Contact form submissions currently stored as inquiries with source=contact.';
comment on table public.support_conversations is 'Support chat threads mapped from current message thread storage.';
comment on table public.support_messages is 'Support chat messages with customer/admin/assistant senders.';
comment on table public.website_settings is 'Shared public website, homepage, footer, contact, social, and SEO settings.';
comment on table public.app_settings is 'Admin-configurable system settings excluding passwords, which move to Supabase Auth.';
comment on table public.ai_match_rules is 'Stored AI Match scoring and rule configuration plus last-run snapshot.';
comment on table public.ai_match_logs is 'Historical AI Match run log records.';
comment on table public.analytics_events is 'Raw analytics event stream for storefront visit, AI Match, and inquiry events.';
comment on table public.analytics_daily_stats is 'Daily aggregated analytics compatible with current dashboard trends.';
comment on table public.analytics_totals is 'Top-level analytics counters compatible with current dashboard stat cards.';

commit;
