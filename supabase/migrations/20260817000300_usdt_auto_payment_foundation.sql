begin;

alter table public.payments
  add column if not exists crypto_asset text,
  add column if not exists crypto_network text,
  add column if not exists crypto_wallet_address text,
  add column if not exists crypto_expected_amount numeric(30, 6),
  add column if not exists crypto_received_amount numeric(30, 6),
  add column if not exists crypto_tx_hash text,
  add column if not exists crypto_confirmations integer,
  add column if not exists crypto_detected_at timestamptz,
  add column if not exists crypto_status text;

alter table public.payments
  drop constraint if exists payments_crypto_expected_amount_check,
  drop constraint if exists payments_crypto_received_amount_check,
  drop constraint if exists payments_crypto_confirmations_check,
  drop constraint if exists payments_crypto_status_check;

alter table public.payments
  add constraint payments_crypto_expected_amount_check
    check (crypto_expected_amount is null or crypto_expected_amount > 0),
  add constraint payments_crypto_received_amount_check
    check (crypto_received_amount is null or crypto_received_amount >= 0),
  add constraint payments_crypto_confirmations_check
    check (crypto_confirmations is null or crypto_confirmations >= 0),
  add constraint payments_crypto_status_check
    check (
      crypto_status is null
      or crypto_status in ('waiting', 'detected', 'confirming', 'confirmed', 'failed')
    );

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'payments'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%status%'
      and con.conname <> 'payments_crypto_status_check'
  loop
    execute format('alter table public.payments drop constraint %I', constraint_name);
  end loop;
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
      'pending_crypto_verification',
      'pending_crypto_detection',
      'deposit_paid',
      'partially_paid',
      'paid',
      'failed',
      'refunded',
      'partially_refunded',
      'cancelled'
    )
  );

create unique index if not exists payments_crypto_tx_hash_key
  on public.payments (crypto_tx_hash)
  where crypto_tx_hash is not null and crypto_tx_hash <> '';

create index if not exists payments_crypto_wallet_status_idx
  on public.payments (crypto_wallet_address, crypto_status)
  where crypto_wallet_address is not null and crypto_wallet_address <> '';

create or replace function public.record_crypto_transaction(
  p_payment_id text,
  p_tx_hash text,
  p_received_amount numeric,
  p_confirmations integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payment public.payments%rowtype;
  v_now timestamptz := now();
  v_crypto_status text;
begin
  if coalesce(p_tx_hash, '') !~ '^[0-9A-Fa-f]{64}$' then
    raise exception 'A valid 64-character transaction hash is required.' using errcode = '22023';
  end if;
  if p_received_amount is null or p_received_amount < 0 then
    raise exception 'Received amount must be zero or greater.' using errcode = '22023';
  end if;
  if p_confirmations is null or p_confirmations < 0 then
    raise exception 'Confirmations must be zero or greater.' using errcode = '22023';
  end if;

  select *
  into v_payment
  from public.payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Payment not found.' using errcode = 'P0002';
  end if;
  if coalesce(v_payment.crypto_asset, '') = ''
    or coalesce(v_payment.crypto_network, '') = ''
    or coalesce(v_payment.crypto_wallet_address, '') = ''
    or v_payment.crypto_expected_amount is null then
    raise exception 'Payment is not configured for cryptocurrency detection.' using errcode = '22023';
  end if;
  if upper(v_payment.crypto_asset) <> 'USDT' or upper(v_payment.crypto_network) <> 'TRC20' then
    raise exception 'Only USDT TRC20 transactions can be recorded.' using errcode = '22023';
  end if;
  if coalesce(v_payment.crypto_tx_hash, '') <> ''
    and lower(v_payment.crypto_tx_hash) <> lower(p_tx_hash) then
    raise exception 'A crypto payment cannot be rebound to a different transaction.' using errcode = '23505';
  end if;

  v_crypto_status := case
    when v_payment.crypto_status = 'confirmed' then 'confirmed'
    when p_confirmations > 0 then 'confirming'
    else 'detected'
  end;

  update public.payments
  set
    crypto_tx_hash = lower(p_tx_hash),
    crypto_received_amount = p_received_amount,
    crypto_confirmations = p_confirmations,
    crypto_detected_at = coalesce(crypto_detected_at, v_now),
    crypto_status = v_crypto_status,
    status = case
      when status in ('unpaid', 'pending', 'awaiting_payment') then 'pending_crypto_detection'
      else status
    end,
    updated_at = v_now
  where id = v_payment.id;

  return jsonb_build_object(
    'payment_id', v_payment.id,
    'crypto_tx_hash', lower(p_tx_hash),
    'crypto_received_amount', p_received_amount,
    'crypto_confirmations', p_confirmations,
    'crypto_status', v_crypto_status
  );
end;
$$;

create or replace function public.review_crypto_payment(
  p_payment_id text,
  p_next_status text,
  p_created_by text default 'admin'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payment public.payments%rowtype;
  v_order public.orders%rowtype;
  v_order_payment_status text;
  v_order_status text;
  v_now timestamptz := now();
  v_idempotent boolean := false;
begin
  if p_next_status not in ('paid', 'failed') then
    raise exception 'Crypto payment review status must be paid or failed.' using errcode = '22023';
  end if;

  select *
  into v_payment
  from public.payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Payment not found.' using errcode = 'P0002';
  end if;
  if lower(coalesce(v_payment.payment_provider, '')) not in ('crypto_manual', 'crypto_trc20')
    or upper(coalesce(v_payment.crypto_asset, '')) <> 'USDT'
    or upper(coalesce(v_payment.crypto_network, '')) <> 'TRC20' then
    raise exception 'Payment is not a USDT TRC20 record.' using errcode = '22023';
  end if;
  if p_next_status = 'paid' and coalesce(v_payment.crypto_tx_hash, '') !~ '^[0-9A-Fa-f]{64}$' then
    raise exception 'A valid TRC20 transaction hash is required before confirmation.' using errcode = '22023';
  end if;
  if p_next_status = 'paid' and (
    upper(coalesce(v_payment.currency, '')) <> 'USD'
    or v_payment.crypto_expected_amount is null
    or v_payment.crypto_expected_amount <> v_payment.amount
    or coalesce(v_payment.crypto_received_amount, v_payment.crypto_expected_amount) + 0.000001 < v_payment.crypto_expected_amount
  ) then
    raise exception 'The recorded USDT amount does not satisfy the expected payment amount.' using errcode = '22023';
  end if;

  select *
  into v_order
  from public.orders
  where id = v_payment.order_id
  for update;

  if not found then
    raise exception 'Order not found for payment.' using errcode = 'P0002';
  end if;

  if p_next_status = 'paid' and v_payment.status in ('paid', 'deposit_paid') then
    v_idempotent := true;
  elsif p_next_status = 'failed' and v_payment.status = 'failed' then
    v_idempotent := true;
  end if;

  if v_idempotent then
    return jsonb_build_object('payment_id', v_payment.id, 'order_id', v_order.id, 'idempotent', true);
  end if;

  update public.payments
  set
    status = p_next_status,
    payment_method = 'USDT Cryptocurrency',
    payment_provider = coalesce(nullif(payment_provider, ''), 'crypto_manual'),
    settlement_channel = coalesce(nullif(settlement_channel, ''), 'TRC20'),
    crypto_received_amount = case
      when p_next_status = 'paid' then coalesce(crypto_received_amount, crypto_expected_amount)
      else crypto_received_amount
    end,
    crypto_confirmations = coalesce(crypto_confirmations, 0),
    crypto_detected_at = case
      when p_next_status = 'paid' then coalesce(crypto_detected_at, v_now)
      else crypto_detected_at
    end,
    crypto_status = case when p_next_status = 'paid' then 'confirmed' else 'failed' end,
    paid_at = case when p_next_status = 'paid' then v_now else null end,
    updated_at = v_now
  where id = v_payment.id;

  if p_next_status = 'paid' then
    if v_order.purchase_mode = 'wholesale' and v_payment.payment_type = 'deposit' then
      v_order_payment_status := 'deposit_paid';
      v_order_status := 'deposit_paid';
    elsif v_order.purchase_mode = 'wholesale' and v_payment.payment_type in ('balance', 'full-payment') then
      v_order_payment_status := 'paid';
      v_order_status := 'balance_paid';
    else
      v_order_payment_status := 'paid';
      v_order_status := 'processing';
    end if;
  else
    select case
      when bool_or(payment_type in ('full-payment', 'balance') and status in ('paid', 'deposit_paid')) then 'paid'
      when bool_or(payment_type = 'deposit' and status in ('paid', 'deposit_paid')) then 'deposit_paid'
      when bool_or(status in ('pending', 'awaiting_payment', 'payment_submitted', 'pending_crypto_verification', 'pending_crypto_detection')) then 'pending'
      else 'failed'
    end
    into v_order_payment_status
    from public.payments
    where order_id = v_order.id and payment_type <> 'refund';
    v_order_status := v_order.order_status;
  end if;

  update public.orders
  set
    payment_method = 'USDT Cryptocurrency',
    payment_status = v_order_payment_status,
    order_status = v_order_status,
    updated_at = v_now
  where id = v_order.id;

  insert into public.order_events (
    order_id, event_type, title, description, created_by, metadata, created_at
  ) values (
    v_order.id,
    case when p_next_status = 'paid' then 'payment_marked_paid' else 'payment_status_changed' end,
    case when p_next_status = 'paid' then 'USDT payment confirmed' else 'USDT payment rejected' end,
    case
      when p_next_status = 'paid' then initcap(replace(v_payment.payment_type, '-', ' ')) || ' USDT payment was confirmed.'
      else initcap(replace(v_payment.payment_type, '-', ' ')) || ' USDT payment was rejected.'
    end,
    coalesce(nullif(trim(p_created_by), ''), 'admin'),
    jsonb_build_object(
      'paymentId', v_payment.id,
      'paymentType', v_payment.payment_type,
      'paymentStatus', p_next_status,
      'cryptoAsset', v_payment.crypto_asset,
      'cryptoNetwork', v_payment.crypto_network,
      'cryptoTxHash', v_payment.crypto_tx_hash,
      'orderPaymentStatus', v_order_payment_status,
      'orderStatus', v_order_status
    ),
    v_now
  );

  return jsonb_build_object(
    'payment_id', v_payment.id,
    'order_id', v_order.id,
    'payment_status', p_next_status,
    'order_payment_status', v_order_payment_status,
    'order_status', v_order_status,
    'idempotent', false
  );
end;
$$;

revoke all on function public.record_crypto_transaction(text, text, numeric, integer) from public;
revoke all on function public.record_crypto_transaction(text, text, numeric, integer) from anon;
revoke all on function public.record_crypto_transaction(text, text, numeric, integer) from authenticated;
grant execute on function public.record_crypto_transaction(text, text, numeric, integer) to service_role;

revoke all on function public.review_crypto_payment(text, text, text) from public;
revoke all on function public.review_crypto_payment(text, text, text) from anon;
revoke all on function public.review_crypto_payment(text, text, text) from authenticated;
grant execute on function public.review_crypto_payment(text, text, text) to service_role;

commit;
