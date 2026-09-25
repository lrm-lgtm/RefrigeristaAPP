-- RefrigeristaAPP — acessos pessoais autorizados (sem equipe/RBAC)
-- Mantém o app simples: apenas Luiz e Leonardo podem se tornar proprietários do app.

create table if not exists public.allowed_app_emails (
  email text primary key,
  label text,
  created_at timestamptz not null default now()
);

alter table public.allowed_app_emails enable row level security;

insert into public.allowed_app_emails (email,label)
values
  ('luizmiguel229@yahoo.com.br','Luiz Miguel'),
  ('leonardo.onipres@gmail.com','Leonardo')
on conflict (email) do update set label=excluded.label;

create or replace function private.handle_allowed_app_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if exists (
    select 1
    from public.allowed_app_emails a
    where lower(a.email)=lower(new.email)
  ) then
    insert into public.app_owner(user_id,name)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1))
    )
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_refrigerista on auth.users;
create trigger on_auth_user_created_refrigerista
after insert on auth.users
for each row execute procedure private.handle_allowed_app_user();

-- Se os usuários já existirem no Auth, vincula agora.
insert into public.app_owner(user_id,name)
select
  u.id,
  coalesce(u.raw_user_meta_data->>'name', split_part(u.email,'@',1))
from auth.users u
join public.allowed_app_emails a on lower(a.email)=lower(u.email)
on conflict (user_id) do nothing;

comment on table public.allowed_app_emails is
  'Allowlist do RefrigeristaAPP. Não representa equipe nem RBAC; são somente os acessos pessoais autorizados.';
