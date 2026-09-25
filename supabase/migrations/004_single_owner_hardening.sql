-- RefrigeristaAPP — hardening do acesso pessoal e índices úteis

create schema if not exists private;

create or replace function private.is_app_owner()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.app_owner o
    where o.user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_app_owner() from public;
grant usage on schema private to authenticated;
grant execute on function private.is_app_owner() to authenticated;

-- Remove a função equivalente do schema exposto à API.
drop function if exists public.is_app_owner();

drop policy if exists "owner_read_self" on public.app_owner;
create policy "owner_read_self"
on public.app_owner for select
to authenticated
using (user_id = (select auth.uid()));

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'customers','customer_sites','equipments','work_orders',
    'service_media','work_order_items','work_order_closings'
  ]
  loop
    execute format('drop policy if exists "app_owner_all" on public.%I', tbl);
    execute format(
      'create policy "app_owner_all" on public.%I for all to authenticated using (private.is_app_owner()) with check (private.is_app_owner())',
      tbl
    );
  end loop;
end $$;

drop policy if exists "app_owner_read_activity" on public.activity_log;
create policy "app_owner_read_activity"
on public.activity_log for select
to authenticated
using (private.is_app_owner());

drop policy if exists "app_owner_insert_activity" on public.activity_log;
create policy "app_owner_insert_activity"
on public.activity_log for insert
to authenticated
with check (private.is_app_owner());

drop policy if exists "refrigerista_evidence_read" on storage.objects;
create policy "refrigerista_evidence_read"
on storage.objects for select
to authenticated
using (bucket_id='refrigerista-evidence' and private.is_app_owner());

drop policy if exists "refrigerista_evidence_insert" on storage.objects;
create policy "refrigerista_evidence_insert"
on storage.objects for insert
to authenticated
with check (bucket_id='refrigerista-evidence' and private.is_app_owner());

drop policy if exists "refrigerista_evidence_update" on storage.objects;
create policy "refrigerista_evidence_update"
on storage.objects for update
to authenticated
using (bucket_id='refrigerista-evidence' and private.is_app_owner())
with check (bucket_id='refrigerista-evidence' and private.is_app_owner());

drop policy if exists "refrigerista_evidence_delete" on storage.objects;
create policy "refrigerista_evidence_delete"
on storage.objects for delete
to authenticated
using (bucket_id='refrigerista-evidence' and private.is_app_owner());

-- App pessoal: não há distribuição de OS para equipe.
alter table public.work_orders drop column if exists assigned_to;

create index if not exists customer_sites_customer_idx on public.customer_sites(customer_id);
create index if not exists equipments_site_idx on public.equipments(site_id);
create index if not exists work_order_items_order_idx on public.work_order_items(work_order_id);
create index if not exists activity_log_order_idx on public.activity_log(work_order_id);
create index if not exists activity_log_equipment_idx on public.activity_log(equipment_id);
create index if not exists work_orders_created_by_idx on public.work_orders(created_by);
create index if not exists service_media_created_by_idx on public.service_media(created_by);
create index if not exists work_order_closings_closed_by_idx on public.work_order_closings(closed_by);
