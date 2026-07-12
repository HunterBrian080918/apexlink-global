begin;

alter table public.support_conversations
  add column if not exists conversation_type text not null default 'general_contact',
  add column if not exists related_order_id text null,
  add column if not exists related_product_id text null,
  add column if not exists customer_phone text null,
  add column if not exists subject text null,
  add column if not exists last_message_text text null,
  add column if not exists last_message_at timestamptz null,
  add column if not exists last_message_sender text null,
  add column if not exists customer_unread_count integer not null default 0,
  add column if not exists admin_unread_count integer not null default 0;

update public.support_conversations
set status = case
  when status = 'replied' then 'waiting_customer'
  when status = 'open' then 'open'
  when status = 'closed' then 'closed'
  when status is null or btrim(status) = '' then 'open'
  else status
end
where status in ('replied', 'open', 'closed')
   or status is null
   or btrim(status) = '';

do $$
declare
  status_constraint_name text;
begin
  select con.conname
  into status_constraint_name
  from pg_constraint con
  where con.conrelid = 'public.support_conversations'::regclass
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%status%';

  if status_constraint_name is not null then
    execute format(
      'alter table public.support_conversations drop constraint %I',
      status_constraint_name
    );
  end if;
end
$$;

alter table public.support_conversations
  add constraint support_conversations_status_check
  check (
    status in (
      'open',
      'waiting_customer',
      'waiting_admin',
      'resolved',
      'closed'
    )
  );

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'support_conversations_conversation_type_check'
      and conrelid = 'public.support_conversations'::regclass
  ) then
    alter table public.support_conversations
      add constraint support_conversations_conversation_type_check
      check (
        conversation_type in (
          'general_contact',
          'product_inquiry',
          'order_support',
          'wholesale_inquiry'
        )
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'support_conversations_related_order_id_fkey'
      and conrelid = 'public.support_conversations'::regclass
  ) then
    alter table public.support_conversations
      add constraint support_conversations_related_order_id_fkey
      foreign key (related_order_id) references public.orders (id) on delete set null;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'support_conversations_related_product_id_fkey'
      and conrelid = 'public.support_conversations'::regclass
  ) then
    alter table public.support_conversations
      add constraint support_conversations_related_product_id_fkey
      foreign key (related_product_id) references public.products (id) on delete set null;
  end if;
end
$$;

alter table public.support_messages
  add column if not exists read_at timestamptz null,
  add column if not exists message_type text not null default 'text',
  add column if not exists metadata jsonb not null default '{}'::jsonb;

update public.support_messages
set sender = 'system'
where sender = 'assistant';

do $$
declare
  sender_constraint_name text;
begin
  select con.conname
  into sender_constraint_name
  from pg_constraint con
  where con.conrelid = 'public.support_messages'::regclass
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%sender%';

  if sender_constraint_name is not null then
    execute format(
      'alter table public.support_messages drop constraint %I',
      sender_constraint_name
    );
  end if;
end
$$;

alter table public.support_messages
  add constraint support_messages_sender_check
  check (
    sender in (
      'customer',
      'admin',
      'system'
    )
  );

create index if not exists support_conversations_status_only_idx
  on public.support_conversations (status);

create index if not exists support_conversations_type_idx
  on public.support_conversations (conversation_type);

create index if not exists support_conversations_email_idx
  on public.support_conversations (email);

create index if not exists support_conversations_related_order_idx
  on public.support_conversations (related_order_id);

create index if not exists support_conversations_related_product_idx
  on public.support_conversations (related_product_id);

create index if not exists support_conversations_last_message_at_idx
  on public.support_conversations (last_message_at desc);

create index if not exists support_conversations_status_last_message_idx
  on public.support_conversations (status, last_message_at desc);

create index if not exists support_messages_conversation_only_idx
  on public.support_messages (conversation_id);

create index if not exists support_messages_created_at_idx
  on public.support_messages (created_at desc);

create index if not exists support_messages_conversation_created_idx
  on public.support_messages (conversation_id, created_at);

commit;
