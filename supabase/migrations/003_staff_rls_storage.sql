-- RefrigeristaAPP — autenticação, RLS e evidências privadas
-- Aplicar somente no Supabase próprio do RefrigeristaAPP.

create table if not exists public.staff_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null default 'technician'
    check (role in ('owner','admin','technician')),
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.staff_profiles enable row level security;

create or replace function public.is_active_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_profiles sp
    where sp.user_id = auth.uid()
      and sp.active = true
  );
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_profiles sp
    where sp.user_id = auth.uid()
      and sp.active = true
      and sp.role = 'owner'
  );
$$;

revoke all on function public.is_active_staff() from public;
revoke all on function public.is_owner() from public;
grant execute on function public.is_active_staff() to authenticated;
grant execute on function public.is_owner() to authenticated;

drop policy if exists "staff_read_profiles" on public.staff_profiles;
create policy "staff_read_profiles"
on public.staff_profiles for select
to authenticated
using (public.is_active_staff());

drop policy if exists "owner_manage_profiles" on public.staff_profiles;
create policy "owner_manage_profiles"
on public.staff_profiles for all
to authenticated
using (public.is_owner())
with check (public.is_owner());

-- O primeiro proprietário deve ser inserido por operação administrativa
-- após a criação do usuário em auth.users. Não há autoelevação de privilégio.

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'customers','customer_sites','equipments','work_orders',
    'service_media','work_order_items','work_order_closings'
  ]
  loop
    execute format('drop policy if exists "active_staff_all" on public.%I', tbl);
    execute format(
      'create policy "active_staff_all" on public.%I for all to authenticated using (public.is_active_staff()) with check (public.is_active_staff())',
      tbl
    );
  end loop;
end $$;

drop policy if exists "active_staff_read_activity" on public.activity_log;
create policy "active_staff_read_activity"
on public.activity_log for select
to authenticated
using (public.is_active_staff());

drop policy if exists "active_staff_insert_activity" on public.activity_log;
create policy "active_staff_insert_activity"
on public.activity_log for insert
to authenticated
with check (public.is_active_staff());

insert into storage.buckets (id, name, public)
values ('refrigerista-evidence','refrigerista-evidence',false)
on conflict (id) do update set public=false;

drop policy if exists "refrigerista_evidence_read" on storage.objects;
create policy "refrigerista_evidence_read"
on storage.objects for select
to authenticated
using (
  bucket_id='refrigerista-evidence'
  and public.is_active_staff()
);

drop policy if exists "refrigerista_evidence_insert" on storage.objects;
create policy "refrigerista_evidence_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id='refrigerista-evidence'
  and public.is_active_staff()
);

drop policy if exists "refrigerista_evidence_update" on storage.objects;
create policy "refrigerista_evidence_update"
on storage.objects for update
to authenticated
using (
  bucket_id='refrigerista-evidence'
  and public.is_active_staff()
)
with check (
  bucket_id='refrigerista-evidence'
  and public.is_active_staff()
);

drop policy if exists "refrigerista_evidence_delete" on storage.objects;
create policy "refrigerista_evidence_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id='refrigerista-evidence'
  and public.is_active_staff()
);

comment on table public.staff_profiles is
  'Perfis internos do RefrigeristaAPP. O primeiro owner é provisionado administrativamente.';
