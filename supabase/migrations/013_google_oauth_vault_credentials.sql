-- RefrigeristaAPP — credenciais OAuth do Google no Supabase Vault
-- Os valores reais só serão gravados depois da criação do OAuth Client no Google Cloud.

create or replace function public.google_calendar_set_oauth_credentials(
  p_client_id text,
  p_client_secret text
)
returns void
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_client_id_secret uuid;
  v_client_secret_secret uuid;
begin
  if p_client_id is null or length(p_client_id) < 10 then
    raise exception 'invalid_google_client_id';
  end if;
  if p_client_secret is null or length(p_client_secret) < 8 then
    raise exception 'invalid_google_client_secret';
  end if;

  select id into v_client_id_secret
  from vault.secrets
  where name = 'refrigerista_google_client_id'
  limit 1;

  if v_client_id_secret is null then
    select vault.create_secret(
      p_client_id,
      'refrigerista_google_client_id',
      'Google OAuth client id do RefrigeristaAPP'
    ) into v_client_id_secret;
  else
    perform vault.update_secret(v_client_id_secret, p_client_id);
  end if;

  select id into v_client_secret_secret
  from vault.secrets
  where name = 'refrigerista_google_client_secret'
  limit 1;

  if v_client_secret_secret is null then
    select vault.create_secret(
      p_client_secret,
      'refrigerista_google_client_secret',
      'Google OAuth client secret do RefrigeristaAPP'
    ) into v_client_secret_secret;
  else
    perform vault.update_secret(v_client_secret_secret, p_client_secret);
  end if;
end;
$$;

create or replace function public.google_calendar_get_oauth_credentials()
returns jsonb
language sql
security definer
set search_path = public, vault, pg_temp
as $$
  select jsonb_build_object(
    'client_id',
    max(decrypted_secret) filter (where name = 'refrigerista_google_client_id'),
    'client_secret',
    max(decrypted_secret) filter (where name = 'refrigerista_google_client_secret')
  )
  from vault.decrypted_secrets
  where name in ('refrigerista_google_client_id','refrigerista_google_client_secret');
$$;

revoke all on function public.google_calendar_set_oauth_credentials(text,text) from public, anon, authenticated;
revoke all on function public.google_calendar_get_oauth_credentials() from public, anon, authenticated;
grant execute on function public.google_calendar_set_oauth_credentials(text,text) to service_role;
grant execute on function public.google_calendar_get_oauth_credentials() to service_role;
