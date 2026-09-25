-- RefrigeristaAPP — acesso de usuário único + evidências privadas
-- Aplicar somente no Supabase próprio do RefrigeristaAPP.
-- O app é pessoal: um único proprietário autenticado, sem matriz de cargos.

create table if not exists public.app_owner (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text,
  created_at timestamptz not null default now()
);

alter table public.app_owner enable row level security;

create or replace function public.is_app_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_owner o
    where o.user_id = auth.uid()
  );
$$;

revoke all on function public.is_app_owner() from public;
grant execute on function public.is_app_owner() to authenticated;

drop policy if exists "owner_read_self" on public.app_owner;
create policy "owner_read_self"
on public.app_owner for select
to authenticated
using (user_id = auth.uid());

-- Sem INSERT/UPDATE/DELETE pelo cliente: o proprietário é provisionado
-- administrativamente uma única vez depois da criação do usuário Auth.

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
      'create policy "app_owner_all" on public.%I for all to authenticated using (public.is_app_owner()) with check (public.is_app_owner())',
      tbl
    );
  end loop;
end $$;

drop policy if exists "app_owner_read_activity" on public.activity_log;
create policy "app_owner_read_activity"
on public.activity_log for select
to authenticated
using (public.is_app_owner());

drop policy if exists "app_owner_insert_activity" on public.activity_log;
create policy "app_owner_insert_activity"
on public.activity_log for insert
to authenticated
with check (public.is_app_owner());

insert into storage.buckets (id, name, public)
values ('refrigerista-evidence','refrigerista-evidence',false)
on conflict (id) do update set public=false;

drop policy if exists "refrigerista_evidence_read" on storage.objects;
create policy "refrigerista_evidence_read"
on storage.objects for select
to authenticated
using (bucket_id='refrigerista-evidence' and public.is_app_owner());

drop policy if exists "refrigerista_evidence_insert" on storage.objects;
create policy "refrigerista_evidence_insert"
on storage.objects for insert
to authenticated
with check (bucket_id='refrigerista-evidence' and public.is_app_owner());

drop policy if exists "refrigerista_evidence_update" on storage.objects;
create policy "refrigerista_evidence_update"
on storage.objects for update
to authenticated
using (bucket_id='refrigerista-evidence' and public.is_app_owner())
with check (bucket_id='refrigerista-evidence' and public.is_app_owner());

drop policy if exists "refrigerista_evidence_delete" on storage.objects;
create policy "refrigerista_evidence_delete"
on storage.objects for delete
to authenticated
using (bucket_id='refrigerista-evidence' and public.is_app_owner());

comment on table public.app_owner is
  'Único usuário proprietário do RefrigeristaAPP. Provisionamento administrativo.';
