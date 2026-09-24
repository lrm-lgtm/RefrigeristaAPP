-- RefrigeristaAPP — IDs canônicos e visões de histórico
-- Aplicar somente no Supabase próprio do RefrigeristaAPP.

create unique index if not exists customers_phone_unique
  on public.customers ((regexp_replace(phone, '\\D', '', 'g')))
  where phone is not null and regexp_replace(phone, '\\D', '', 'g') <> '';

create unique index if not exists equipments_customer_serial_unique
  on public.equipments (customer_id, lower(serial_number))
  where serial_number is not null and btrim(serial_number) <> '';

create index if not exists work_orders_opened_at_idx
  on public.work_orders(opened_at desc);

create or replace view public.customer_history as
select
  c.id as customer_id,
  c.name,
  c.phone,
  count(distinct e.id) as equipment_count,
  count(distinct wo.id) as work_order_count,
  coalesce(sum(woc.grand_total),0)::numeric(12,2) as lifetime_value,
  max(wo.opened_at) as last_service_at
from public.customers c
left join public.equipments e on e.customer_id=c.id
left join public.work_orders wo on wo.customer_id=c.id
left join public.work_order_closings woc on woc.work_order_id=wo.id
group by c.id,c.name,c.phone;

create or replace view public.equipment_history as
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
  count(distinct wo.id) as work_order_count,
  coalesce(sum(woc.grand_total),0)::numeric(12,2) as lifetime_value,
  max(wo.opened_at) as last_service_at
from public.equipments e
left join public.work_orders wo on wo.equipment_id=e.id
left join public.work_order_closings woc on woc.work_order_id=wo.id
group by e.id,e.customer_id,e.type,e.environment,e.brand,e.model,e.serial_number,e.capacity,e.voltage,e.refrigerant,e.next_preventive_at;

comment on view public.customer_history is 'Resumo agregado por customer_id para histórico e relacionamento.';
comment on view public.equipment_history is 'Resumo agregado por equipment_id para prontuário técnico.';
