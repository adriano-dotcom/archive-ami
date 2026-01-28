

# Correção: Data Importando com 1 Dia a Menos

## Diagnóstico Final

### O Que Está Acontecendo

Após análise detalhada, confirmei que:

1. **Edge Function está correto**: O log mostra `"due_date": "2026-01-28"` sendo retornado ✅
2. **Normalização no Edge Function funciona**: A lógica de `split('T')[0]` está implementada ✅
3. **Banco de dados recebe valor errado**: A parcela foi salva como `2026-01-27` ao invés de `2026-01-28` ❌

### Causa Raiz Identificada

O problema ocorre na **conversão implícita de strings de data pelo Supabase JS SDK** no navegador:

```text
Fluxo do problema:
1. Edge Function retorna: "due_date": "2026-01-28" (string)
2. Frontend recebe: "2026-01-28" (string)
3. Supabase SDK serializa para JSON
4. PostgreSQL interpreta a string como UTC meia-noite
5. Internamente converte considerando timezone do client
6. Resultado: 2026-01-27 (1 dia a menos)
```

**Evidência no banco:**
```sql
due_date = 2026-01-27
due_date AT TIME ZONE 'America/Sao_Paulo' = 2026-01-26 21:00:00
```

Isso mostra que a data está sendo tratada como timestamp UTC e depois convertida.

---

## Solução

### Normalização Explícita Antes do Insert

Garantir que a data seja uma **string literal pura** no formato `YYYY-MM-DD`, sem nenhuma possibilidade de conversão de timezone.

**Arquivo:** `src/components/segurados/ImportDocumentAIModal.tsx`

**Mudança na linha ~1875:**

```typescript
// ANTES:
const installmentData = {
  // ...
  due_date: inst.due_date,  // Pode ser convertido implicitamente
  // ...
};

// DEPOIS:
// Função helper para normalizar data (evita problemas de timezone)
const normalizeDateString = (dateStr: string | undefined | null): string | null => {
  if (!dateStr) return null;
  
  // Se já está no formato YYYY-MM-DD, usar diretamente
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }
  
  // Se contém 'T' (formato ISO), pegar apenas a parte da data
  if (dateStr.includes('T')) {
    return dateStr.split('T')[0];
  }
  
  // Se está no formato DD/MM/YYYY, converter
  const brMatch = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
  }
  
  return dateStr;
};

const installmentData = {
  // ...
  due_date: normalizeDateString(inst.due_date),
  // ...
};
```

### Normalização Adicional na Recepção dos Dados

Também aplicar normalização quando os dados são recebidos do Edge Function:

**Mudança na linha ~1321:**

```typescript
let extractedInstallments: ExtractedInstallment[] = (data.installments || []).map((inst: any, i: number) => ({
  ...inst,
  id: `installment-${i}-${Date.now()}`,
  selected: true,
  matchStatus: 'new' as const,
  insurer: forcedInsurer || inst.insurer,
  // Normalizar data na recepção
  due_date: normalizeDateString(inst.due_date)
}));
```

---

## Implementação Detalhada

### Passo 1: Adicionar Função Helper

Adicionar a função `normalizeDateString` no início do componente (após os imports):

```typescript
// Helper para normalizar datas e evitar problemas de timezone
const normalizeDateString = (dateStr: string | undefined | null): string | null => {
  if (!dateStr) return null;
  
  const str = String(dateStr).trim();
  
  // Se já está no formato YYYY-MM-DD puro, usar diretamente
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }
  
  // Se contém 'T' (formato ISO), pegar apenas a parte da data
  if (str.includes('T')) {
    return str.split('T')[0];
  }
  
  // Se está no formato DD/MM/YYYY, converter para YYYY-MM-DD
  const brMatch = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
  }
  
  return str;
};
```

### Passo 2: Aplicar na Criação de Installments

Na seção onde `installmentData` é construído (linha ~1870-1887), usar a função:

```typescript
const installmentData = {
  policy_id: policyId,
  contact_id: contactId,
  installment_number: installmentNumber,
  value: inst.value,
  due_date: normalizeDateString(inst.due_date),  // Normalizado
  days_overdue: inst.days_overdue || 0,
  status: inst.status === 'VENCIDO' || inst.status === 'ATRASADO' ? 'overdue' : 'pending',
  metadata: {
    receipt_number: inst.receipt_number,
    endorsement: inst.endorsement,
    cancellation_date: normalizeDateString(inst.cancellation_date),  // Também normalizar
    commission: inst.commission,
    source: inst.source,
    import_session_id: sessionIdRef.current,
    import_timestamp: new Date().toISOString()
  }
};
```

### Passo 3: Aplicar na Recepção dos Dados

Na extração inicial (linha ~1321) e no retry (linha ~1229):

```typescript
// Linha ~1321
let extractedInstallments: ExtractedInstallment[] = (data.installments || []).map((inst: any, i: number) => ({
  ...inst,
  id: `installment-${i}-${Date.now()}`,
  selected: true,
  matchStatus: 'new' as const,
  insurer: forcedInsurer || inst.insurer,
  due_date: normalizeDateString(inst.due_date)  // Adicionar
}));
```

---

## Resumo das Mudanças

| Arquivo | Localização | Modificação |
|---------|-------------|-------------|
| `src/components/segurados/ImportDocumentAIModal.tsx` | Após imports (~linha 50) | Adicionar função `normalizeDateString` |
| `src/components/segurados/ImportDocumentAIModal.tsx` | Linha ~1321 | Normalizar `due_date` na extração inicial |
| `src/components/segurados/ImportDocumentAIModal.tsx` | Linha ~1229 | Normalizar `due_date` no retry |
| `src/components/segurados/ImportDocumentAIModal.tsx` | Linha ~1875 | Normalizar `due_date` e `cancellation_date` antes do insert |

---

## Teste de Validação

Após a implementação:

1. Reimportar o PDF da SOMPO
2. Verificar que a parcela com vencimento 28/01/2026 é salva corretamente
3. Consultar no banco para confirmar:

```sql
SELECT due_date FROM installments 
WHERE metadata->>'endorsement' = '115427';
-- Esperado: 2026-01-28
```

