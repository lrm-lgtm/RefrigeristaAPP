-- RefrigeristaAPP — índices de apoio para FKs adicionadas por agenda/Google Calendar
create index if not exists google_calendar_connection_connected_by_idx
  on public.google_calendar_connection(connected_by);

create index if not exists google_oauth_states_initiated_by_idx
  on public.google_oauth_states(initiated_by);

create index if not exists visits_converted_work_order_idx
  on public.visits(converted_work_order_id);

create index if not exists visits_created_by_idx
  on public.visits(created_by);
