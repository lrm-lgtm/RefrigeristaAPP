-- RefrigeristaAPP — constraints de sync compatíveis com upsert/PostgREST
drop index if exists public.customers_external_key_unique;
drop index if exists public.customer_sites_external_key_unique;
drop index if exists public.equipments_external_key_unique;
drop index if exists public.work_orders_external_key_unique;

create unique index customers_external_key_unique on public.customers(external_key);
create unique index customer_sites_external_key_unique on public.customer_sites(external_key);
create unique index equipments_external_key_unique on public.equipments(external_key);
create unique index work_orders_external_key_unique on public.work_orders(external_key);
