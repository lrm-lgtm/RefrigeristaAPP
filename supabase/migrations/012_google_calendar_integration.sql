-- RefrigeristaAPP — integração Google Calendar
-- Tokens de atualização ficam criptografados no Supabase Vault.

alter table public.work_orders
  add column if not exists appointment_duration_minutes integer not null default 60
    check (appointment_duration_minutes between 15 and 480),
  add column if not exists google_event_id text,
  add column if not exists google_calendar_id text,
  add column if not exists google_event_url text,
  add column if not exists google_sync_status text not null default 'not_synced'
    check (google_sync_status in ('not_synced','synced','error','deleted')),
  add column if not exists google_synced_at timestamptz,
  add column if not exists google_sync_error text;

alter table public.work_order_closings
  add column if not exists preventive_google_event_id text,
  add column if not exists preventive_google_event_url text,
  add column if not exists preventive_google_synced_at timestamptz;

create unique index if not exists work_orders_google_event_unique
  on public.work_orders(google_event_id)
  where google_event_id is not null;

create table if not exists public.google_calendar_connection (
  id smallint primary key default 1 check (id = 1),
  google_email text,
  calendar_id text,
  calendar_name text not null default 'Luiz Miguel — Atendimentos',
  refresh_secret_id uuid,
  scopes text[] not null default '{}'::text[],
  status text not null default 'disconnected'
    check (status in ('disconnected','connected','error')),
  connected_by uuid references auth.users(id) on delete set null,
  connected_at timestamptz,
  updated_at timestamptz not null default now(),
  last_error text
);

create table if not exists public.google_oauth_states (
  state_hash text primary key,
  initiated_by uuid not null references auth.users(id) on delete cascade,
  return_url text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.google_calendar_connection enable row level security;
alter table public.google_oauth_states enable row level security;

drop policy if exists "deny_client_google_connection" on public.google_calendar_connection;
create policy "deny_client_google_connection"
on public.google_calendar_connection
for select
to anon, authenticated
using (false);

drop policy if exists "deny_client_google_oauth_states" on public.google_oauth_states;
create policy "deny_client_google_oauth_states"
on public.google_oauth_states
for select
to anon, authenticated
using (false);

revoke all on table public.google_calendar_connection from anon, authenticated;
revoke all on table public.google_oauth_states from anon, authenticated;
grant select, insert, update, delete on table public.google_calendar_connection to service_role;
grant select, insert, update, delete on table public.google_oauth_states to service_role;

create or replace function public.google_calendar_store_refresh_token(p_secret text)
returns uuid
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_id uuid;
begin
  if p_secret is null or length(p_secret) < 10 then
    raise exception 'invalid_refresh_token';
  end if;

  select refresh_secret_id into v_id
  from public.google_calendar_connection
  where id = 1;

  if v_id is null then
    select vault.create_secret(
      p_secret,
      'refrigerista_google_calendar_refresh',
      'Google Calendar refresh token do RefrigeristaAPP'
    ) into v_id;
  else
    perform vault.update_secret(v_id, p_secret);
  end if;

  insert into public.google_calendar_connection(id, refresh_secret_id, updated_at)
  values (1, v_id, now())
  on conflict (id) do update
    set refresh_secret_id = excluded.refresh_secret_id,
        updated_at = now();

  return v_id;
end;
$$;

create or replace function public.google_calendar_get_refresh_token()
returns text
language sql
security definer
set search_path = public, vault, pg_temp
as $$
  select ds.decrypted_secret
  from public.google_calendar_connection c
  join vault.decrypted_secrets ds on ds.id = c.refresh_secret_id
  where c.id = 1;
$$;

create or replace function public.google_calendar_delete_refresh_token()
returns void
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_id uuid;
begin
  select refresh_secret_id into v_id
  from public.google_calendar_connection
  where id = 1;

  if v_id is not null then
    delete from vault.secrets where id = v_id;
  end if;

  update public.google_calendar_connection
  set refresh_secret_id = null,
      status = 'disconnected',
      updated_at = now()
  where id = 1;
end;
$$;

revoke all on function public.google_calendar_store_refresh_token(text) from public, anon, authenticated;
revoke all on function public.google_calendar_get_refresh_token() from public, anon, authenticated;
revoke all on function public.google_calendar_delete_refresh_token() from public, anon, authenticated;

grant execute on function public.google_calendar_store_refresh_token(text) to service_role;
grant execute on function public.google_calendar_get_refresh_token() to service_role;
grant execute on function public.google_calendar_delete_refresh_token() to service_role;

comment on table public.google_calendar_connection is
  'Conexão única da agenda operacional do Luiz Miguel. Refresh token armazenado criptografado no Vault.';
comment on column public.work_orders.google_event_id is
  'ID do evento Google Calendar vinculado ao agendamento deste atendimento.';
comment on column public.work_order_closings.preventive_google_event_id is
  'ID do evento futuro de preventiva criado no Google Calendar.';
