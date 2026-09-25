-- RefrigeristaAPP — campos de agenda e timestamps para futura sincronização

alter table public.work_orders
  add column if not exists attendance_type text not null default 'Manutenção corretiva';

alter table public.customer_sites
  add column if not exists updated_at timestamptz not null default now();

alter table public.work_order_closings
  add column if not exists updated_at timestamptz not null default now();

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_customers_updated_at on public.customers;
create trigger touch_customers_updated_at
before update on public.customers
for each row execute procedure private.touch_updated_at();

drop trigger if exists touch_customer_sites_updated_at on public.customer_sites;
create trigger touch_customer_sites_updated_at
before update on public.customer_sites
for each row execute procedure private.touch_updated_at();

drop trigger if exists touch_equipments_updated_at on public.equipments;
create trigger touch_equipments_updated_at
before update on public.equipments
for each row execute procedure private.touch_updated_at();

drop trigger if exists touch_work_orders_updated_at on public.work_orders;
create trigger touch_work_orders_updated_at
before update on public.work_orders
for each row execute procedure private.touch_updated_at();

drop trigger if exists touch_closings_updated_at on public.work_order_closings;
create trigger touch_closings_updated_at
before update on public.work_order_closings
for each row execute procedure private.touch_updated_at();

create index if not exists work_orders_scheduled_at_idx
  on public.work_orders(scheduled_at)
  where scheduled_at is not null;

create index if not exists equipments_next_preventive_idx
  on public.equipments(next_preventive_at)
  where next_preventive_at is not null;

create index if not exists closings_payment_status_idx
  on public.work_order_closings(payment_status);
