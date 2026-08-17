alter table public.payments
  add column if not exists note text;
