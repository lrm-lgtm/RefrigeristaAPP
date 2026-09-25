-- RefrigeristaAPP — política explícita para allowlist interna
drop policy if exists "deny_client_access" on public.allowed_app_emails;
create policy "deny_client_access"
on public.allowed_app_emails
for select
to anon, authenticated
using (false);
