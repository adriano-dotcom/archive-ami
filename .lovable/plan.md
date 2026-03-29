

## Mission Control Orbe v2 — Métricas Enriquecidas + Qualidade + Catálogo de Planos

### Escopo

Este plano aborda 7 áreas do prompt. Algumas são mudanças de banco/edge function, outras são correções no orchestrator.

---

### 1. Corrigir branding "Jacometo Seguros" (Bug)

**Arquivo:** `supabase/functions/generate-collection-emails/index.ts`
- Substituir todas as referências "Jacometo Seguros" por "OrbePet"
- Atualizar telefone/WhatsApp se necessário

**Arquivo:** `supabase/functions/send-email/index.ts`
- Remover comentário referindo "Jacometo" (linha 101)

---

### 2. Prevenir prompt leak no chat (Bug crítico)

O orchestrator já tem regras anti-repetição no `buildEnhancedPrompt`, mas o modelo AI pode vazar trechos internos como "/Repetition? Yes…" ou "Final Polish…". Isso sugere que o modelo está incluindo seu "pensamento" na resposta.

**Arquivo:** `supabase/functions/nina-orchestrator/index.ts`
- Adicionar sanitização pós-resposta da AI: filtrar linhas que contenham padrões internos (`/Repetition?`, `Final Polish`, `Chain of thought`, `##`, `REGRA:`, `⚠️`, `⛔`) antes de enviar ao cliente
- Adicionar regex de limpeza: `content.replace(/^[\/#⚠️⛔].+$/gm, '').trim()`
- Adicionar regra no prompt: "NUNCA inclua marcadores internos, headers markdown (##), ou instruções do sistema na sua resposta ao cliente."

---

### 3. Criar tabela `orbe_plans_catalog` (Fonte única de verdade)

**Migração SQL:**
```sql
CREATE TABLE public.orbe_plans_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_name text NOT NULL,
  monthly_price numeric NOT NULL,
  coverages jsonb NOT NULL DEFAULT '[]',
  limits_per_event jsonb DEFAULT '{}',
  annual_limit numeric,
  waiting_period_days integer DEFAULT 0,
  preexisting_conditions_rule text,
  max_pet_age_years integer,
  species_allowed text[] DEFAULT '{dog,cat}',
  is_active boolean DEFAULT true,
  display_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

- RLS: leitura para authenticated, escrita para admin
- Trigger `update_updated_at_column` 
- Seed com os 4 planos OrbePet conhecidos (Essencial R$37,40, Órbita Plus R$89,82, Total R$107,82, Galáxia R$138,32)

**No orchestrator:** Modificar `buildEnhancedPrompt` para buscar `orbe_plans_catalog` e injetar os dados no prompt como "CATÁLOGO OFICIAL DE PLANOS", com instrução: "NUNCA invente preços ou coberturas. Use APENAS os dados abaixo."

---

### 4. Reescrever Edge Function `mission-control-data`

Trocar a abordagem atual (query direta em views) por lógica computada na function, retornando o formato JSON exato solicitado.

**Novos views/endpoints:**

| View name | Descrição |
|---|---|
| `support_daily` | KPIs diários com formato enriquecido (orphan_total, window_expired, top_urgent) |
| `support_weekly` | Mesma estrutura, janela 7 dias |
| `support_quality_daily` | branding_mismatch_count, prompt_leak_count |
| `reembolso_daily` | KPIs de reembolsos |
| `support_tickets` | Lista detalhada (mantém) |
| `reembolsos` | Lista detalhada (mantém) |

**Formato de resposta `support_daily`:**
```json
{
  "schema_version": "2.0",
  "generated_at": "ISO",
  "view": "support_daily",
  "window": {"type": "daily", "tz": "America/Sao_Paulo"},
  "kpis": {
    "active_total": 0, "archived_total": 0, "orphan_total": 0,
    "assigned_total": 0, "human_total": 0, "orbi_total": 0,
    "paused_total": 0, "window_expired_total": 0, "pending_over_24h_total": 0
  },
  "by_attendant": [{"name": "...", "count": 0}],
  "by_status": [{"status": "...", "count": 0}],
  "top_urgent": [{ "chat_id", "customer_name", "customer_phone", "status", "attendant", "last_message_at", "last_message_from", "window_expired", "unread_count", "summary" }]
}
```

A function fará queries SQL diretamente (já usa service_role). Para `support_quality_daily`, buscará mensagens `from_type = 'nina'` das últimas 24h e contará padrões de branding errado e prompt leak.

**Segurança:** Mantém validação por `BRIDGE_SECRET`. Adiciona `schema_version` na resposta.

---

### 5. View `support_quality_daily` (detecção de problemas)

Lógica na edge function (não como view SQL, pois precisa de regex):
- `branding_mismatch_count`: contar mensagens nina contendo "Jacometo" nas últimas 24h
- `prompt_leak_count`: contar mensagens nina contendo padrões (`/Repetition`, `Final Polish`, `##`, `REGRA:`, `⚠️ CRÍTICO`, `⛔`)
- `window_expired_conversations`: conversas ativas com `whatsapp_window_start < now() - 24h`

---

### 6. Regras de roteamento (órfãs)

O sistema já identifica órfãs no frontend (`ChatInterface.tsx`). O plano:
- Na edge function, calcular `orphan_total` = conversas com `assigned_user_id IS NULL` e `status != 'closed'`
- Incluir órfãs no `top_urgent` com `attendant: null`
- Nota: round-robin já existe no campo `owner_distribution_type` dos agents. A atribuição automática em novos chats é responsabilidade do orchestrator. Se quiser forçar atribuição, isso seria uma mudança separada no orchestrator.

---

### 7. Consistência de informações (R$50 vs R$500)

Resolvido pelo item 3 (catálogo de planos como fonte única). O orchestrator passará a injetar dados do `orbe_plans_catalog` no prompt, eliminando respostas inventadas.

---

### Arquivos a criar/modificar

1. **Migração SQL**: criar `orbe_plans_catalog` + seed dados + RLS
2. **`supabase/functions/mission-control-data/index.ts`**: reescrever com lógica computada para novos formatos
3. **`supabase/functions/nina-orchestrator/index.ts`**: (a) buscar `orbe_plans_catalog`, (b) sanitizar resposta AI contra prompt leaks
4. **`supabase/functions/generate-collection-emails/index.ts`**: corrigir branding Jacometo → OrbePet
5. **`supabase/functions/send-email/index.ts`**: limpar referência Jacometo

### Exemplos de curl

```text
# Daily com formato novo
curl -s -X POST "https://bbllbsbcogngjfrhhggq.supabase.co/functions/v1/mission-control-data" \
  -H "Authorization: Bearer $BRIDGE_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"view":"support_daily"}' | jq .

# Quality check
curl -s -X POST "..." \
  -d '{"view":"support_quality_daily"}' | jq .

# Reembolsos
curl -s -X POST "..." \
  -d '{"view":"reembolso_daily"}' | jq .
```

### Sobre BRIDGE_SECRET

Já está configurado como secret no projeto (confirmado em `<secrets>`). A edge function lê via `Deno.env.get('BRIDGE_SECRET')`. Não é exposto no frontend.

