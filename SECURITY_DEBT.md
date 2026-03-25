# Security Debt

Documento vivo para rastrear vulnerabilidades conhecidas e débitos de segurança do OrbePet.

## Prioridades
- **P0 (Crítico)**: Corrigir imediatamente, bloqueia deploy
- **P1 (Alto)**: Corrigir em até 1 semana
- **P2 (Baixo)**: Backlog, corrigir quando possível

## Itens Pendentes

| ID | Prioridade | Descrição | Data | Status |
|----|------------|-----------|------|--------|
| SEC-001 | P1 | CORS wildcard `*` em todas as Edge Functions — trocar por domínio real em produção | 2026-03-25 | Pendente |
| SEC-002 | P1 | Falta rate limiting nas Edge Functions públicas (`capture-lead`, `whatsapp-webhook`, `whatsapp-call-webhook`) | 2026-03-25 | Pendente |
| SEC-003 | P1 | Falta validação Zod na maioria das Edge Functions | 2026-03-25 | Pendente |
| SEC-004 | P2 | RLS policies com `USING (true)` para INSERT/UPDATE/DELETE em algumas tabelas (detectado pelo linter) | 2026-03-25 | Pendente |
| SEC-005 | P2 | Extensões instaladas no schema `public` — mover para schema dedicado | 2026-03-25 | Pendente |
| SEC-006 | P2 | Funções sem `search_path` explícito (detectado pelo linter) | 2026-03-25 | Pendente |
| SEC-007 | P2 | Webhook logs acumulando sem cleanup automático (1.683+ registros) | 2026-03-25 | Pendente |
| SEC-008 | P2 | Pending invites expirados sem cleanup automático | 2026-03-25 | Pendente |

## Itens Resolvidos

| ID | Descrição | Data Resolução |
|----|-----------|----------------|
| SEC-R01 | Service role key JWT hardcoded no trigger `trigger_nina_orchestrator` — substituído por `current_setting()` | 2026-03-25 |
