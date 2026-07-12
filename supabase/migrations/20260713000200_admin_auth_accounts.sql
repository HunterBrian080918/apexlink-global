begin;

create table if not exists public.admin_auth_accounts (
  id text primary key default gen_random_uuid()::text,
  email text not null unique,
  password_hash text not null,
  password_salt text not null,
  session_version integer not null default 1 check (session_version >= 1),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);

create index if not exists admin_auth_accounts_is_active_idx
on public.admin_auth_accounts (is_active, updated_at desc);

drop trigger if exists set_admin_auth_accounts_updated_at on public.admin_auth_accounts;
create trigger set_admin_auth_accounts_updated_at
before update on public.admin_auth_accounts
for each row execute function public.set_updated_at();

alter table public.admin_auth_accounts enable row level security;

drop policy if exists "admin_auth_accounts_admin_manage" on public.admin_auth_accounts;
create policy "admin_auth_accounts_admin_manage"
on public.admin_auth_accounts
for all
using (public.is_admin())
with check (public.is_admin());

comment on table public.admin_auth_accounts is 'Server-managed admin login credentials migrated from legacy data/admin-auth.json.';

commit;
