# RefrigeristaAPP

Aplicativo de gestão de clientes, equipamentos e ordens de serviço para **Luiz Miguel — Ar Condicionado e Refrigeração**.

## Objetivo do MVP

Fluxo principal:

```
Cliente
  -> Local
  -> Equipamento
  -> Ordem de Serviço
  -> Diagnóstico
  -> Orçamento
  -> Aprovação / assinatura
  -> Serviço e fotos
  -> Cobrança
  -> Histórico
```

A base conceitual reaproveita o OficinaAPP, removendo vistoria automotiva, veículo, placa e quilometragem.

## Regras

- Fotos de atendimento são opcionais e categorizadas como antes, durante, depois, etiqueta/equipamento e outras.
- Cada equipamento mantém seu histórico técnico, financeiro, fotos e assinaturas.
- Orçamentos aprovados ficam vinculados à revisão aprovada.
- O projeto deve usar backend/Supabase próprio, separado da oficina.
- Mobile-first / PWA.
