alter table public.media_assets
  add column if not exists public_id text,
  add column if not exists secure_url text,
  add column if not exists original_filename text,
  add column if not exists display_name text,
  add column if not exists folder text,
  add column if not exists resource_type text,
  add column if not exists format text,
  add column if not exists width integer,
  add column if not exists height integer,
  add column if not exists bytes bigint,
  add column if not exists usage_type text,
  add column if not exists alt_text text;

update public.media_assets
set
  secure_url = coalesce(nullif(secure_url, ''), nullif(url, '')),
  display_name = coalesce(nullif(display_name, ''), nullif(name, '')),
  resource_type = coalesce(nullif(resource_type, ''), nullif(media_type, ''), 'image'),
  usage_type = coalesce(
    nullif(usage_type, ''),
    nullif(case when array_length(usage, 1) >= 1 then usage[1] else null end, ''),
    'misc'
  )
where
  secure_url is null
  or secure_url = ''
  or display_name is null
  or display_name = ''
  or resource_type is null
  or resource_type = ''
  or usage_type is null
  or usage_type = '';

alter table public.products
  add column if not exists main_image_public_id text;

alter table public.product_images
  add column if not exists public_id text;

alter table public.website_settings
  add column if not exists brand_logo_public_id text,
  add column if not exists favicon_public_id text,
  add column if not exists hero_background_public_id text;

create unique index if not exists media_assets_public_id_key
on public.media_assets (public_id)
where public_id is not null and public_id <> '';

create index if not exists media_assets_usage_type_idx
on public.media_assets (usage_type);

create index if not exists media_assets_folder_idx
on public.media_assets (folder);

create index if not exists products_main_image_public_id_idx
on public.products (main_image_public_id)
where main_image_public_id is not null and main_image_public_id <> '';

create index if not exists product_images_public_id_idx
on public.product_images (public_id)
where public_id is not null and public_id <> '';

create index if not exists website_settings_brand_logo_public_id_idx
on public.website_settings (brand_logo_public_id);

create index if not exists website_settings_favicon_public_id_idx
on public.website_settings (favicon_public_id);

create index if not exists website_settings_hero_background_public_id_idx
on public.website_settings (hero_background_public_id);
