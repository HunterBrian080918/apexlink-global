alter table public.order_items
  add column if not exists product_name_snapshot text,
  add column if not exists product_image_snapshot text,
  add column if not exists sku_snapshot text,
  add column if not exists line_total numeric(12, 2),
  add column if not exists selected_price_tier_snapshot jsonb,
  add column if not exists product_options_snapshot jsonb;

update public.order_items
set
  product_name_snapshot = coalesce(nullif(product_name_snapshot, ''), product_name),
  line_total = coalesce(line_total, subtotal)
where
  product_name_snapshot is null
  or btrim(product_name_snapshot) = ''
  or line_total is null;
