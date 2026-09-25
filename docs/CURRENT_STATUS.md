# Estado atual — RefrigeristaAPP

Atualizado em 2026-09-24.

## Produto

O RefrigeristaAPP é um aplicativo pessoal de controle técnico e histórico para Luiz Miguel, com acesso também autorizado para Leonardo.

Não é um ERP de equipe. Não há distribuição de OS, matriz de cargos ou fluxo administrativo complexo.

Fluxo principal:

```
Cliente -> Equipamento -> Atendimento -> Diagnóstico/serviço
       -> Fotos -> Valores -> Pagamento -> Assinatura
       -> Garantia/Preventiva -> Histórico
```

## Frontend/PWA

Estado atual: piloto local-first com nuvem manual, versão de cache v16.

Implementado:

- dashboard pessoal: em aberto, a receber e preventivas;
- novo atendimento rápido;
- tipos de atendimento;
- agendamento opcional;
- clientes agrupados por ID estável;
- equipamentos agrupados por ID estável;
- prontuário por equipamento;
- histórico por cliente;
- busca global;
- edição de cliente e equipamento;
- fotos e assinatura salvas em IndexedDB;
- pagamento separado do status do atendimento;
- garantia e próxima preventiva;
- atalho WhatsApp;
- compartilhamento de resumo;
- comprovante imprimível/PDF via impressão do navegador;
- backup e restauração completos do navegador;
- exemplos deixam de aparecer quando existe o primeiro atendimento real;
- smoke checks executados antes do deploy no GitHub Pages;
- login por e-mail + senha;
- primeiro acesso pelo próprio usuário;
- sincronização manual aparelho -> nuvem e nuvem -> aparelho;
- contador local/nuvem e registro da última sincronização;
- opção de limpar apenas os dados locais;
- os dados de demonstração não reaparecem depois que o app é inicializado.

## Supabase

Projeto exclusivo:

- nome: `refrigerista-app`
- ref: `kzkjnamwtqlgcqkeerwj`
- região: `sa-east-1`
- plano: Free

O banco da OficinaAPP não é utilizado.

Migrations aplicadas:

1. `001_refrigerista_core.sql`
2. `002_canonical_history.sql`
3. `003_staff_rls_storage.sql` (conteúdo posteriormente simplificado para acesso pessoal)
4. `004_single_owner_hardening.sql`
5. `005_activity_actor_index.sql`
6. `006_allowed_personal_access.sql`
7. `007_cloud_sync_keys.sql`
8. `008_sync_upsert_constraints.sql`
9. `009_schedule_sync_timestamps.sql`
10. `010_allowlist_deny_policy.sql`

RLS ativo em todas as tabelas de negócio.

Storage privado:

- `refrigerista-evidence`

E-mails autorizados:

- Luiz Miguel
- Leonardo

A allowlist não é uma equipe/RBAC; serve apenas para limitar quem pode ser proprietário/autorizado no app.

## Gate atual de homologação

As decisões foram fechadas:

1. autenticação por e-mail + senha;
2. banco real começa limpo;
3. sincronização manual durante a homologação;
4. somente Luiz e Leonardo podem criar usuário Auth.

O banco de negócio está vazio e o frontend já possui os controles de nuvem.

Falta uma ação humana inevitável: cada pessoa deve escolher sua própria senha em **Primeiro acesso**. Dependendo da configuração padrão do Supabase Auth, o primeiro cadastro também pode exigir confirmação do e-mail. Depois que os dois acessos forem criados, testar em dois aparelhos:

1. criar um atendimento real no aparelho A;
2. enviar para nuvem;
3. baixar no aparelho B;
4. conferir cliente, equipamento, valores, fotos e assinatura;
5. editar/fechar no aparelho B, enviar novamente e baixar no A.

Só depois desse teste a sincronização automática deve substituir os botões manuais.
