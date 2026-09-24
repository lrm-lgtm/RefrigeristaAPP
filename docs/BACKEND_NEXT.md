# Próxima fase — backend real

A demonstração atual usa localStorage para validar o fluxo no celular. O próximo gate é persistência real, sem compartilhar banco com o OficinaAPP.

## Fluxo a fechar

Cliente → equipamento → OS → fotos → diagnóstico/serviço → valores → assinatura → fechamento → histórico do equipamento.

## Backend planejado

- Supabase próprio do RefrigeristaAPP.
- Auth para equipe.
- Storage privado para fotos e assinaturas.
- PostgreSQL com a migration `001_refrigerista_core.sql`.
- RLS antes de qualquer uso com dados reais.
- assinatura salva como arquivo + SHA-256.
- histórico por `activity_log`.
- preventiva vinculada diretamente ao equipamento.

## Regra de segurança

O projeto da Oficina não deve ser usado como banco de teste, nem receber estas migrations.

## Critério do próximo gate

1. Criar projeto Supabase separado.
2. Aplicar schema.
3. Criar bucket privado de evidências.
4. Criar primeiro usuário interno.
5. Trocar localStorage por chamadas reais.
6. Abrir uma OS no celular A e enxergar no celular B.
7. Fechar a OS com foto, valor e assinatura e confirmar o histórico do equipamento.
