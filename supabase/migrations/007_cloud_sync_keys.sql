-- RefrigeristaAPP — chaves externas para sincronização do piloto

alter table public.customers add column if not exists external_key text;
alter table public.customer_sites add column if not exists external_key text;
alter table public.equipments add column if not exists external_key text;
alter table public.work_orders add column if not exists external_key text;
alter table public.work_orders add column if not exists materials_text text;

create unique index if not exists customers_external_key_unique
  on public.customers(external_key) where external_key is not null;

create unique index if not exists customer_sites_external_key_unique
  on public.customer_sites(external_key) where external_key is not null;

create unique index if not exists equipments_external_key_unique
  on public.equipments(external_key) where external_key is not null;

create unique index if not exists work_orders_external_key_unique
  on public.work_orders(external_key) where external_key is not null;

create unique index if not exists service_media_storage_path_unique
  on public.service_media(storage_path);
