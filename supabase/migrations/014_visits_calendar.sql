-- RefrigeristaAPP — visitas/compromissos independentes de atendimento técnico

create table if not exists public.visits (
  id uuid primary key default gen_random_uuid(),
  external_key text unique,
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text not null,
  phone text,
  address text,
  title text not null default 'Visita',
  notes text,
  scheduled_at timestamptz not null,
  duration_minutes integer not null default 60 check (duration_minutes between 15 and 480),
  status text not null default 'scheduled'
    check (status in ('scheduled','done','cancelled')),
  converted_work_order_id uuid references public.work_orders(id) on delete set null,
  google_event_id text,
  google_calendar_id text,
  google_event_url text,
  google_sync_status text not null default 'not_synced'
    check (google_sync_status in ('not_synced','synced','error','deleted')),
  google_synced_at timestamptz,
  google_sync_error text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.visits enable row level security;

drop policy if exists "app_owner_all" on public.visits;
create policy "app_owner_all"
on public.visits
for all
to authenticated
using (private.is_app_owner())
with check (private.is_app_owner());

create index if not exists visits_scheduled_at_idx
  on public.visits(scheduled_at);

create index if not exists visits_customer_idx
  on public.visits(customer_id);

create index if not exists visits_status_idx
  on public.visits(status);

create unique index if not exists visits_google_event_unique
  on public.visits(google_event_id)
  where google_event_id is not null;

drop trigger if exists touch_visits_updated_at on public.visits;
create trigger touch_visits_updated_at
before update on public.visits
for each row execute procedure private.touch_updated_at();

comment on table public.visits is
  'Compromissos/visitas rápidas que podem existir sem virar ordem de serviço.';
comment on column public.visits.converted_work_order_id is
  'Preenchido somente se a visita posteriormente virar atendimento técnico.';
