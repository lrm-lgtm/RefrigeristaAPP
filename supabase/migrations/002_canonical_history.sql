-- RefrigeristaAPP — histórico canônico por cliente e equipamento
-- Aplicar somente no Supabase próprio do RefrigeristaAPP.

create index if not exists customers_phone_idx
  on public.customers ((regexp_replace(phone, '\\D', '', 'g')))
  where phone is not null and regexp_replace(phone, '\\D', '', 'g') <> '';

create unique index if not exists equipments_customer_serial_unique
  on public.equipments (customer_id, lower(serial_number))
  where serial_number is not null and btrim(serial_number) <> '';

create index if not exists work_orders_opened_at_idx
  on public.work_orders(opened_at desc);

create or replace view public.customer_history
with (security_invoker = true)
as
with eq as (
  select customer_id, count(*)::bigint as equipment_count
  from public.equipments
  group by customer_id
),
wo as (
  select
    w.customer_id,
    count(*)::bigint as work_order_count,
    coalesce(sum(c.grand_total),0)::numeric(12,2) as lifetime_value,
    max(w.opened_at) as last_service_at
  from public.work_orders w
  left join public.work_order_closings c on c.work_order_id=w.id
  group by w.customer_id
)
select
  c.id as customer_id,
  c.name,
  c.phone,
  coalesce(eq.equipment_count,0) as equipment_count,
  coalesce(wo.work_order_count,0) as work_order_count,
  coalesce(wo.lifetime_value,0)::numeric(12,2) as lifetime_value,
  wo.last_service_at
from public.customers c
left join eq on eq.customer_id=c.id
left join wo on wo.customer_id=c.id;

create or replace view public.equipment_history
with (security_invoker = true)
as
with wo as (
  select
    w.equipment_id,
    count(*)::bigint as work_order_count,
    coalesce(sum(c.grand_total),0)::numeric(12,2) as lifetime_value,
    max(w.opened_at) as last_service_at
  from public.work_orders w
  left join public.work_order_closings c on c.work_order_id=w.id
  where w.equipment_id is not null
  group by w.equipment_id
)
select
  e.id as equipment_id,
  e.customer_id,
  e.type,
  e.environment,
  e.brand,
  e.model,
  e.serial_number,
  e.capacity,
  e.voltage,
  e.refrigerant,
  e.next_preventive_at,
  coalesce(wo.work_order_count,0) as work_order_count,
  coalesce(wo.lifetime_value,0)::numeric(12,2) as lifetime_value,
  wo.last_service_at
from public.equipments e
left join wo on wo.equipment_id=e.id;

comment on view public.customer_history is 'Resumo agregado por customer_id para histórico e relacionamento.';
comment on view public.equipment_history is 'Resumo agregado por equipment_id para prontuário técnico.';
