alter table public.website_settings
  add column if not exists seo_canonical_base_url text,
  add column if not exists seo_allow_indexing boolean not null default true,
  add column if not exists seo_og_title text,
  add column if not exists seo_og_description text,
  add column if not exists seo_og_image text;

update public.website_settings
set seo_allow_indexing = true
where seo_allow_indexing is null;

