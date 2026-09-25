-- RefrigeristaAPP — restringe criação de usuários Auth à allowlist pessoal

create or replace function private.enforce_allowed_auth_email()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if new.email is null or not exists (
    select 1
    from public.allowed_app_emails a
    where lower(a.email)=lower(new.email)
  ) then
    raise exception 'email_not_allowed';
  end if;
  return new;
end;
$$;

drop trigger if exists before_auth_user_created_refrigerista on auth.users;
create trigger before_auth_user_created_refrigerista
before insert on auth.users
for each row execute procedure private.enforce_allowed_auth_email();
