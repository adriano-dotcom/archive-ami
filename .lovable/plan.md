

## Funil de Vendas — Kanban para Leads WhatsApp

### Visão Geral

Criar um quadro Kanban funcional na rota `/funil` que exibe os contatos vindos do WhatsApp organizados por estágio do funil. Os cards mostram nome, telefone, último contato, lead score e plano de interesse. Suporte a drag-and-drop para mover leads entre colunas.

### Estágios do Funil

Os estágios usam o campo `lead_status` já existente na tabela `contacts`:

| Coluna | lead_status | Cor |
|--------|------------|-----|
| Novo Lead | `new` | Azul |
| Qualificado | `qualified` | Amarelo |
| Proposta | `proposal` | Laranja |
| Negociação | `negotiation` | Roxo |
| Vendido | `customer` | Verde |
| Perdido | `churned` | Vermelho |

### Arquitetura

**Arquivo principal:** `src/components/SalesFunnel.tsx` — reescrito completo

**Dados:** Query direta ao Supabase buscando contatos com campos: `id, name, call_name, phone_number, email, lead_status, last_activity, client_memory, profile_picture_url, tags, company`. Sem criar tabelas novas — usa `lead_status` existente.

**Drag-and-drop:** Implementação nativa com HTML5 Drag API (sem dependência extra). Ao soltar um card em outra coluna, faz `UPDATE contacts SET lead_status = '...' WHERE id = '...'`.

### Componentes

1. **SalesFunnel** — container principal com 6 colunas horizontais em scroll
2. **FunnelColumn** — coluna com header (nome, contagem, valor) e lista de cards
3. **FunnelCard** — card do contato com avatar, nome, telefone, lead score badge, tempo desde último contato, tags

### Funcionalidades

- Filtro por busca (nome/telefone)
- Contagem de leads por coluna no header
- Drag-and-drop entre colunas atualiza `lead_status` no banco
- Click no card abre link para conversa (`/chat?contact=id`) ou drawer de detalhes
- Lead score badge reutilizando `LeadScoreBadge` existente
- Indicador de plano de interesse (extraído de `client_memory.lead_profile.products_discussed`)
- Responsivo: scroll horizontal no mobile

### Detalhes Técnicos

- React Query para fetch e cache dos contatos
- Optimistic update no drag-and-drop
- Sem novas tabelas — apenas `contacts.lead_status`
- Sem novas dependências npm

