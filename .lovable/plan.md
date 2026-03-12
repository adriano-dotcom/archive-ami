

## Plano: Corrigir Produtos Travados em "Processando"

### 1. Resetar os 2 registros travados no banco
- Migração SQL para atualizar `extraction_status` de `processing` → `pending` nos registros que estão em `processing` há mais de 5 minutos (safety net)

### 2. Frontend: Mostrar botão Reprocessar para status `processing` travado
- **`src/components/settings/ProductKnowledgeSettings.tsx` (linha 307)**
  - Adicionar `'processing'` à condição do botão de reprocessar
  - Assim o usuário pode forçar retry quando algo travar

### 3. Edge Function: Adicionar try/catch com fallback para `error`
- **`supabase/functions/extract-product-text/index.ts`**
  - Envolver o bloco principal em try/catch que garanta que o status seja atualizado para `error` mesmo em caso de crash inesperado (como o stack overflow)

### Resultado
- Os 2 produtos travados voltarão a `pending` e poderão ser reprocessados
- Futuras falhas não deixarão registros travados em "processing"

