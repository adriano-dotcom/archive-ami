

# Correção: Data Exibindo com 1 Dia a Menos na Lista de Parcelas

## Diagnóstico Confirmado

Após análise detalhada, identifiquei **dois problemas distintos**:

### Problema 1: Exibição na Lista de Parcelas
Na `InstallmentsList.tsx`, a data é formatada usando `new Date()`:
```typescript
format(new Date(inst.due_date), 'dd/MM/yyyy', { locale: ptBR })
```

Quando JavaScript interpreta `new Date("2026-01-28")`, ele trata como **UTC meia-noite**. No fuso horário do Brasil (UTC-3), isso "volta" para `27/01/2026 21:00`.

**Por isso a prévia mostra correto** (usa `parseISO`) **mas a lista mostra errado** (usa `new Date`).

### Problema 2: Dados Salvos Incorretamente
A consulta no banco mostrou que algumas datas estão realmente salvas erradas:

| Endorsement | Esperado | Salvo |
|-------------|----------|-------|
| 115427 | 2026-01-28 | 2026-01-27 ❌ |
| 112544 | 2026-01-26 | 2026-01-25 ❌ |
| 104546 | 2026-01-08 | 2026-01-08 ✓ |
| 109004 | 2026-01-08 | 2026-01-08 ✓ |

Padrão: datas no final do mês (dia 26, 28) têm problema, datas no início (dia 08) não têm. Isso indica que a conversão de timezone está acontecendo em algum momento entre a extração e o salvamento.

---

## Solução

### Correção 1: Usar `parseISO` para Exibição (Imediato)

Mudar todas as ocorrências de `new Date(due_date)` para usar `parseISO` do date-fns, que trata a data como string local sem conversão de timezone.

**Arquivo:** `src/components/collections/InstallmentsList.tsx`

**Linha 943:**
```typescript
// ANTES:
{format(new Date(inst.due_date), 'dd/MM/yyyy', { locale: ptBR })}

// DEPOIS:
{format(parseISO(inst.due_date), 'dd/MM/yyyy', { locale: ptBR })}
```

Também adicionar import de `parseISO` se não existir.

### Correção 2: Normalização com Hora Explícita no Salvamento

Para evitar ambiguidade, ao salvar a data, adicionar o horário **12:00** (meio-dia) para evitar rollback de timezone:

**Arquivo:** `src/components/segurados/ImportDocumentAIModal.tsx`

Atualizar a função `normalizeDateString`:
```typescript
const normalizeDateString = (dateStr: string | undefined | null): string | null => {
  if (!dateStr) return null;
  
  const str = String(dateStr).trim();
  
  // Se já está no formato YYYY-MM-DD puro, retornar como está
  // O PostgreSQL DATE vai interpretar corretamente
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

E adicionar log para debug antes de salvar:
```typescript
console.log('[DEBUG] Saving installment with due_date:', installmentData.due_date);
```

### Correção 3: Aplicar `parseISO` em Todos os Componentes de Exibição

Arquivos que usam `new Date(due_date)` e precisam ser corrigidos:

| Arquivo | Linha |
|---------|-------|
| `src/components/collections/InstallmentsList.tsx` | 943 |
| `src/components/collections/SendInstallmentWhatsAppModal.tsx` | 182, 242, 317 |
| `src/components/contacts/ContactCollectionHistory.tsx` | 197 |

---

## Mudanças Detalhadas

### Arquivo: `src/components/collections/InstallmentsList.tsx`

1. Adicionar import de `parseISO`:
```typescript
import { format, parseISO } from 'date-fns';
```

2. Linha 943 - Mudar exibição da data:
```typescript
{format(parseISO(inst.due_date), 'dd/MM/yyyy', { locale: ptBR })}
```

### Arquivo: `src/components/collections/SendInstallmentWhatsAppModal.tsx`

1. Linhas 182, 242, 317 - Mudar para `parseISO`:
```typescript
const dueDate = format(parseISO(installment.due_date), 'dd/MM/yyyy', { locale: ptBR });
```

### Arquivo: `src/components/contacts/ContactCollectionHistory.tsx`

1. Linha 197 - Mudar para `parseISO`:
```typescript
Venc: {format(parseISO(installmentData.due_date), 'dd/MM/yyyy')}
```

---

## Correção Manual para Dados Existentes

SQL para corrigir as parcelas já importadas com data errada:

```sql
-- Corrigir endorsement 115427: 2026-01-27 → 2026-01-28
UPDATE installments 
SET due_date = '2026-01-28'
WHERE metadata->>'endorsement' = '115427';

-- Corrigir endorsement 112544: 2026-01-25 → 2026-01-26
UPDATE installments 
SET due_date = '2026-01-26'
WHERE metadata->>'endorsement' = '112544';
```

---

## Resumo das Mudanças

| Arquivo | Tipo | Descrição |
|---------|------|-----------|
| `InstallmentsList.tsx` | Exibição | Usar `parseISO` ao invés de `new Date` |
| `SendInstallmentWhatsAppModal.tsx` | Exibição | Usar `parseISO` ao invés de `new Date` |
| `ContactCollectionHistory.tsx` | Exibição | Usar `parseISO` ao invés de `new Date` |
| Banco de dados | Correção | UPDATE nas parcelas com data incorreta |

---

## Teste de Validação

Após implementação:
1. As datas na lista de parcelas devem aparecer corretas
2. Novas importações devem salvar as datas corretamente
3. As parcelas existentes corrigidas devem mostrar as datas certas

