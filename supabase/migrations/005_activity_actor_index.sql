-- RefrigeristaAPP — índice final de auditoria
create index if not exists activity_log_actor_idx
  on public.activity_log(actor_user_id);
