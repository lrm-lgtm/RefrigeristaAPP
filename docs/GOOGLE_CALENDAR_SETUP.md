# Google Calendar — configuração final

## Estado

A integração já está implementada no RefrigeristaAPP, mas depende de um OAuth Client do Google pertencente à conta/projeto Google que será usado pelo Luiz.

O app usa uma agenda secundária própria:

`Luiz Miguel — Atendimentos`

Fluxo implementado:

- atendimento com data/hora -> cria/atualiza evento;
- duração prevista -> define o fim do evento;
- mudança de horário -> atualiza o mesmo evento;
- atendimento cancelado ou sem agendamento -> remove o evento vinculado;
- preventiva no fechamento -> cria/atualiza evento futuro de preventiva;
- lembretes do atendimento -> 1 dia e 1 hora antes;
- lembretes da preventiva -> 7 dias e 1 dia antes;
- tokens de atualização -> Supabase Vault, criptografados;
- sincronização com Google Agenda ocorre a partir do banco real/Supabase.

## Permissão solicitada

A autorização pede:

- `openid`
- `email`
- `https://www.googleapis.com/auth/calendar.app.created`

A escolha de `calendar.app.created` é intencional: a integração cria e administra apenas a agenda criada pelo próprio aplicativo, em vez de pedir acesso amplo a todas as agendas da conta.

## Passo necessário no Google Cloud

1. Criar ou selecionar um projeto no Google Cloud da conta do Luiz.
2. Ativar a **Google Calendar API**.
3. Configurar a tela de consentimento OAuth.
4. Criar um **OAuth Client ID** do tipo **Web application**.
5. Adicionar exatamente este Authorized redirect URI:

```
https://kzkjnamwtqlgcqkeerwj.supabase.co/functions/v1/google-calendar-auth-callback
```

6. Entregar ao projeto:
   - OAuth Client ID
   - OAuth Client Secret

Esses dois valores não devem ser versionados no GitHub. O RefrigeristaAPP já possui RPC própria para armazená-los no **Supabase Vault**.

## Depois das credenciais

Executar administrativamente:

```sql
select public.google_calendar_set_oauth_credentials(
  '<GOOGLE_CLIENT_ID>',
  '<GOOGLE_CLIENT_SECRET>'
);
```

Depois:

1. entrar no RefrigeristaAPP;
2. abrir **… -> Dados e backup -> Google Agenda**;
3. tocar **Conectar Google Agenda**;
4. autenticar a conta Google do Luiz;
5. aprovar o acesso;
6. o app criará/reutilizará a agenda **Luiz Miguel — Atendimentos**.

## Homologação

Criar um atendimento com horário e duração.

Esperado:

1. enviar o atendimento para a nuvem;
2. evento aparecer na agenda;
3. alterar horário e reenviar;
4. mesmo evento ser atualizado, sem duplicação;
5. finalizar com próxima preventiva;
6. evento de preventiva aparecer;
7. baixar em outro aparelho e manter os mesmos vínculos.

## Edge Functions

- `google-calendar-auth-start`
- `google-calendar-auth-callback`
- `google-calendar-status`
- `google-calendar-sync`
- `google-calendar-disconnect`

Todas as ações de operação exigem usuário autenticado e autorizado no RefrigeristaAPP. O callback OAuth é público por necessidade do protocolo, mas valida um `state` aleatório de uso único e com expiração curta.
