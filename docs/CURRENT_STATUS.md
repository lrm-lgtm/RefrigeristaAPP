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

Estado atual: piloto local-first, versão de cache v14.

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
- smoke checks executados antes do deploy no GitHub Pages.

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

## Próximo gate

A estrutura de nuvem está pronta, mas o frontend ainda não deve depender do Supabase até a autenticação real ser ativada e testada.

Decisões/ações necessárias antes de ligar sincronização:

1. criar/ativar os dois usuários em Supabase Auth;
2. escolher autenticação por senha ou magic link;
3. decidir se o primeiro envio para nuvem preserva/importa os dados locais de teste ou começa limpo;
4. iniciar com sincronização manual (mais segura para homologação) ou automática entre aparelhos.

Recomendação para homologação: senha + primeiro envio manual + download manual. Depois de validar em dois aparelhos, migrar para sincronização automática.
