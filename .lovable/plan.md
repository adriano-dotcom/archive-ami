
# Correção: Importação SOMPO - Datas e Parcelas

## Diagnóstico Detalhado

Analisei o PDF original da SOMPO e os dados no banco. Encontrei **2 problemas críticos**:

### Problema 1: Data Vencimento com 1 Dia a Menos

| Esperado (PDF) | Importado (Banco) |
|----------------|-------------------|
| 28/01/2026 | 2026-01-27 |
| 08/01/2026 | 2026-01-08 ✓ |
| 25/01/2026 | 2026-01-25 ✓ |

A data 28/01/2026 foi convertida para 27/01/2026. Isso ocorre quando:
- O código usa `new Date("2026-01-28")` sem timezone explícito
- JavaScript interpreta como UTC meia-noite
- No Brasil (UTC-3), isso retrocede para 27/01 às 21h

### Problema 2: Parcela Faltando (TORRES TRANSPORTES)

| Endosso | Data Vencimento | Status |
|---------|-----------------|--------|
| 115427 | 28/01/2026 | ✓ Importado |
| 104546 | 08/01/2026 | ✓ Importado |
| 109004 | 08/01/2026 | ❌ **Não importado** |

**Causa raiz:** O formato SOMPO usa coluna `Endosso/Parcela` com valores como `115427/0`, `104546/0`, `109004/0`. O `/0` indica que o número após a barra é o número sequencial da parcela (neste caso, todas são parcela única = 0).

A IA está extraindo `installment_number: 0` (ou deixando vazio, forçando para 1). Como a detecção de duplicatas usa `policy_id + installment_number + due_date`, as duas parcelas de 08/01/2026 são consideradas duplicatas:

```text
5400054098 + 1 + 2026-01-08 → 1ª parcela importada
5400054098 + 1 + 2026-01-08 → 2ª parcela IGNORADA (duplicata)
```

---

## Estrutura Real do Relatório SOMPO

```text
| Apólice    | Endosso/Parcela | Nome Segurado | Valor | Data Vencimento |
|------------|-----------------|---------------|-------|-----------------|
| 5400054098 | 115427/0        | TORRES...     | 536,90| 28/01/2026      |
| 5400054098 | 104546/0        | TORRES...     | 536,90| 08/01/2026      |
| 5400054098 | 109004/0        | TORRES...     | 536,90| 08/01/2026      |
```

A coluna **Endosso/Parcela** contém:
- `115427/0` → Endosso 115427, Parcela 0 (única)
- `104546/0` → Endosso 104546, Parcela 0 (única)
- `109004/0` → Endosso 109004, Parcela 0 (única)

**Cada linha é uma parcela diferente**, mesmo com o mesmo valor de "parcela" (0).

---

## Solução

### Correção 1: Atualizar Prompt SOMPO no Edge Function

O formato SOMPO usa "Endosso/Parcela" como identificador único de cada linha. Cada linha é uma parcela individual, mesmo quando `installment_number` parece igual.

**Arquivo:** `supabase/functions/extract-documents/index.ts`

Atualizar seção 4 do prompt (linhas 169-173) com instruções detalhadas:

```text
4. Sompo:
   - Título do documento: "Parcelas de Apólice"
   - Colunas: Apólice, Endosso/Parcela, Nome Segurado, Valor (R$), Data Vencimento, Situação
   - FORMATO ESPECIAL da coluna "Endosso/Parcela": valor como "115427/0"
     * O número ANTES da barra é o ENDOSSO (ex: 115427) → salvar em endorsement
     * O número APÓS a barra é o número sequencial da parcela (ex: 0 = parcela única)
     * CADA LINHA representa uma parcela DIFERENTE, mesmo que o segundo número seja igual
   - Para installment_number: usar um número sequencial (1, 2, 3...) para cada linha 
     do mesmo segurado/apólice, pois a SOMPO não numera parcelas explicitamente
   - MUITO IMPORTANTE: Se houver múltiplas linhas para a mesma apólice, 
     numere installment_number sequencialmente (1, 2, 3...) pela ordem no documento
   - Valores: usar ponto como separador decimal (536,90 → 536.90)
   - Datas: converter para YYYY-MM-DD (28/01/2026 → 2026-01-28)
```

### Correção 2: Normalizar Datas no Edge Function

Garantir que as datas retornadas pela IA são apenas a parte da data, sem informação de timezone.

**Arquivo:** `supabase/functions/extract-documents/index.ts`

Adicionar pós-processamento de datas antes de retornar (aproximadamente linha 900-950):

```typescript
// Normalizar datas para evitar problemas de timezone
for (const inst of result.installments) {
  if (inst.due_date && typeof inst.due_date === 'string') {
    // Se contiver 'T' (formato ISO), pegar apenas a parte da data
    if (inst.due_date.includes('T')) {
      inst.due_date = inst.due_date.split('T')[0];
    }
    // Se estiver em formato DD/MM/YYYY, converter para YYYY-MM-DD
    const brDateMatch = inst.due_date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (brDateMatch) {
      const [_, day, month, year] = brDateMatch;
      inst.due_date = `${year}-${month}-${day}`;
    }
  }
  // Mesma lógica para cancellation_date se existir
  if (inst.cancellation_date && typeof inst.cancellation_date === 'string') {
    if (inst.cancellation_date.includes('T')) {
      inst.cancellation_date = inst.cancellation_date.split('T')[0];
    }
  }
}
```

### Correção 3: Melhorar Detecção de Duplicatas

O sistema atual usa `policy_id + installment_number + due_date` para detectar duplicatas. Isso falha quando:
- Duas parcelas têm mesmo `installment_number` (erro de extração)
- Mesma data de vencimento

**Arquivo:** `src/components/segurados/ImportDocumentAIModal.tsx`

Adicionar `value` na comparação de duplicatas (linha ~763-765):

```typescript
// Verificar duplicata incluindo valor na comparação
const { data: existingInstallment } = await supabase
  .from('installments')
  .select('id, value, status, due_date')
  .eq('policy_id', existingPolicy.id)
  .eq('installment_number', installmentNumber)
  .eq('due_date', inst.due_date)
  .maybeSingle();

// Se não encontrou por installment_number + due_date, 
// também verificar se já existe parcela com mesmo valor + due_date
// (para pegar casos onde installment_number está errado)
if (!existingInstallment) {
  const { data: existingByValue } = await supabase
    .from('installments')
    .select('id, value, status, due_date, installment_number')
    .eq('policy_id', existingPolicy.id)
    .eq('due_date', inst.due_date)
    .eq('value', inst.value)
    .maybeSingle();
    
  if (existingByValue) {
    // Parcela com mesmo valor e data já existe
    // Tratar como duplicata
    // ...
  }
}
```

### Correção 4: Usar Endosso como Identificador Único

Para SOMPO, o `endorsement` (endosso) é o identificador único de cada parcela. Quando disponível, usar isso na detecção de duplicatas.

**Arquivo:** `src/components/segurados/ImportDocumentAIModal.tsx`

```typescript
// Para seguradoras que usam endosso como ID único (SOMPO, etc)
if (inst.endorsement && inst.endorsement.trim() !== '') {
  const { data: existingByEndorsement } = await supabase
    .from('installments')
    .select('id, value, status, due_date')
    .eq('policy_id', existingPolicy.id)
    .eq('metadata->>endorsement', inst.endorsement)
    .maybeSingle();
    
  if (existingByEndorsement) {
    // Já existe parcela com este endosso
    // ...
  }
}
```

---

## Resumo das Mudanças

| Arquivo | Modificação |
|---------|-------------|
| `supabase/functions/extract-documents/index.ts` | 1. Atualizar prompt SOMPO com instruções detalhadas sobre formato Endosso/Parcela<br>2. Adicionar pós-processamento de datas para evitar problema de timezone |
| `src/components/segurados/ImportDocumentAIModal.tsx` | 1. Melhorar detecção de duplicatas incluindo valor na comparação<br>2. Usar endosso como identificador quando disponível |

---

## Dados para Correção Manual

Para corrigir os dados já importados incorretamente:

**Corrigir data da parcela de 27/01 para 28/01:**
```sql
UPDATE installments 
SET due_date = '2026-01-28'
WHERE id = '1d796af6-8ecf-4e76-8454-0eb22f4200ad';
```

**Inserir parcela faltante (endosso 109004):**
Reimportar o PDF após as correções, ou inserir manualmente via interface.
