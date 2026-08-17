begin;

do $$
begin
  if exists (
    select 1
    from public.payments
    where payment_type in ('full-payment', 'deposit', 'balance')
    group by order_id, payment_type
    having count(*) > 1
  ) then
    raise exception 'Duplicate logical payment stages exist; resolve them before applying payments_order_stage_unique.';
  end if;
end $$;

create unique index if not exists payments_order_stage_unique
  on public.payments (order_id, payment_type)
  where payment_type in ('full-payment', 'deposit', 'balance');

alter table public.orders
  drop constraint if exists orders_order_status_check;

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
      'deposit_paid',
      'in_production',
      'quality_inspection',
      'awaiting_balance',
      'balance_paid',
      'ready_to_ship',
      'shipped',
      'delivered',
      'completed',
      'cancelled'
    )
  );

create or replace function public.review_bank_transfer_payment(
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
    raise exception 'Bank transfer review status must be paid or failed.' using errcode = '22023';
  end if;

  select *
  into v_payment
  from public.payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Payment not found.' using errcode = 'P0002';
  end if;

  if not (
    lower(coalesce(v_payment.payment_provider, '')) in ('bank_transfer', 'bank-transfer', 'worldfirst')
    or lower(coalesce(v_payment.payment_method, '')) in ('bank transfer', 'bank-transfer', 'swift', 'worldfirst')
    or lower(coalesce(v_payment.settlement_channel, '')) = 'worldfirst'
  ) then
    raise exception 'Payment is not a bank transfer record.' using errcode = '22023';
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
    return jsonb_build_object(
      'payment_id', v_payment.id,
      'order_id', v_order.id,
      'idempotent', true
    );
  end if;

  update public.payments
  set
    status = p_next_status,
    payment_method = 'Bank Transfer',
    payment_provider = 'bank_transfer',
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
      when bool_or(status in ('pending', 'awaiting_payment', 'payment_submitted')) then 'pending'
      else 'failed'
    end
    into v_order_payment_status
    from public.payments
    where order_id = v_order.id
      and payment_type <> 'refund';

    v_order_status := v_order.order_status;
  end if;

  update public.orders
  set
    payment_method = 'Bank Transfer',
    payment_status = v_order_payment_status,
    order_status = v_order_status,
    updated_at = v_now
  where id = v_order.id;

  insert into public.order_events (
    order_id,
    event_type,
    title,
    description,
    created_by,
    metadata,
    created_at
  ) values (
    v_order.id,
    case when p_next_status = 'paid' then 'payment_marked_paid' else 'payment_status_changed' end,
    case when p_next_status = 'paid' then 'Bank transfer confirmed' else 'Bank transfer rejected' end,
    case
      when p_next_status = 'paid' then initcap(replace(v_payment.payment_type, '-', ' ')) || ' payment was confirmed.'
      else initcap(replace(v_payment.payment_type, '-', ' ')) || ' payment was rejected.'
    end,
    coalesce(nullif(trim(p_created_by), ''), 'admin'),
    jsonb_build_object(
      'paymentId', v_payment.id,
      'paymentType', v_payment.payment_type,
      'paymentStatus', p_next_status,
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

revoke all on function public.review_bank_transfer_payment(text, text, text) from public;
revoke all on function public.review_bank_transfer_payment(text, text, text) from anon;
revoke all on function public.review_bank_transfer_payment(text, text, text) from authenticated;
grant execute on function public.review_bank_transfer_payment(text, text, text) to service_role;

commit;
