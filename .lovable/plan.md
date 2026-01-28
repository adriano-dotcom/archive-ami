

# Plano de Otimização Completa - Sistema Jacometo (Cobrança)

## Resumo Executivo

Este plano aborda melhorias críticas em **segurança**, **performance**, **acessibilidade** e **usabilidade** identificadas na auditoria. O projeto já possui uma base sólida com React, TypeScript, Supabase e boas práticas como lazy loading e toast notifications (Sonner já está integrado).

---

## Análise do Estado Atual

### O que já existe no projeto

| Funcionalidade | Status | Observação |
|----------------|--------|------------|
| Toast Notifications | Implementado | Sonner já configurado em App.tsx |
| Lazy Loading | Implementado | Componentes de rota carregados sob demanda |
| AlertDialog (confirmações) | Implementado | Já usado para "Limpar Todas" em InstallmentsList |
| Debounce | Parcial | Existe em alguns lugares, mas não no campo de busca principal |
| Paginação | Existente | TablePagination componente disponível |
| ARIA labels | Ausente | Nenhum aria-label encontrado no código |
| Hook useDebounce | Ausente | Não existe um hook reutilizável |
| Rate limiting | Ausente | Campanhas sem limite de criação |

---

## Fase 1: Crítico (Implementação Imediata)

### 1.1 Verificar Duplicação de Sidebar

**Diagnóstico**: Analisei o código e identifiquei que `SidebarBody` renderiza DOIS componentes:
- `DesktopSidebar` (visível em telas md+)
- `MobileSidebar` (visível em mobile)

Isso é intencional para responsividade - cada um usa `hidden md:flex` e `md:hidden` para controlar visibilidade. **Não há duplicação problemática** - é um padrão correto de design responsivo.

**Ação**: Nenhuma mudança necessária neste item.

---

### 1.2 Adicionar ARIA Labels Essenciais

**Problema**: Zero aria-labels encontrados no código.

**Arquivos a modificar**:

1. **`src/components/collections/InstallmentsList.tsx`**
   - Campo de busca: adicionar `aria-label="Buscar parcelas por nome, telefone ou apólice"`
   - Botões de ação: adicionar aria-labels descritivos
   - Tabela: adicionar `scope="col"` nos headers

2. **`src/components/collections/CollectionCampaigns.tsx`**
   - Modal de criação: adicionar `aria-labelledby` no DialogContent
   - Campos de formulário: vincular Labels corretamente
   - Botões de ícone: adicionar aria-labels

3. **`src/components/Sidebar.tsx`**
   - Links de navegação: adicionar aria-current para item ativo
   - Botão de logout: adicionar aria-label

4. **`src/components/ui/sidebar.tsx`**
   - Botão de menu mobile: adicionar aria-label="Abrir menu"
   - Botão de pin: já tem title, adicionar aria-label

**Exemplo de implementação**:

```tsx
// Campo de busca
<Input
  aria-label="Buscar parcelas por nome, telefone ou apólice"
  placeholder="Buscar por nome, telefone, apólice..."
/>

// Botão sem texto
<Button aria-label="Atualizar lista de parcelas">
  <RefreshCw className="w-4 h-4" />
</Button>

// Tabela acessível
<TableHead scope="col">Empresa</TableHead>
```

---

### 1.3 Implementar Rate Limiting para Campanhas

**Problema**: Usuários podem criar campanhas ilimitadamente, gerando custos e spam.

**Solução em 2 partes**:

1. **Nova Edge Function**: `supabase/functions/validate-campaign-limit/index.ts`
   - Verifica quantas campanhas o usuário criou nas últimas 24h
   - Limite sugerido: 10 campanhas/dia
   - Retorna `{ allowed: true/false, remaining: X, limit: 10 }`

2. **Atualizar `CollectionCampaigns.tsx`**:
   - Chamar edge function antes de criar campanha
   - Mostrar toast de erro se limite atingido
   - Exibir contador de campanhas restantes no botão

**Código da Edge Function**:

```typescript
// supabase/functions/validate-campaign-limit/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const DAILY_LIMIT = 10;
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const { count, error } = await supabase
    .from("collection_batches")
    .select("*", { count: "exact", head: true })
    .gte("created_at", todayStart.toISOString());

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const remaining = Math.max(0, DAILY_LIMIT - (count || 0));
  
  return new Response(
    JSON.stringify({ 
      allowed: remaining > 0,
      remaining,
      limit: DAILY_LIMIT,
      used: count || 0
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
```

---

## Fase 2: Importante (Próximas 2 Semanas)

### 2.1 Implementar Hook useDebounce Reutilizável

**Criar arquivo**: `src/hooks/useDebounce.ts`

```typescript
import { useState, useEffect } from 'react';

export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}
```

**Atualizar `InstallmentsList.tsx`**:

```tsx
import { useDebounce } from '@/hooks/useDebounce';

// Dentro do componente:
const debouncedSearch = useDebounce(search, 300);

// Passar debouncedSearch ao invés de search para o hook useInstallments
const { sortedInstallments, ... } = useInstallments({
  search: debouncedSearch,  // <-- usar valor com debounce
  ...
});
```

---

### 2.2 Implementar Paginação nas Tabelas de Parcelas

O componente `TablePagination` já existe em `src/components/ui/table-pagination.tsx`.

**Atualizar `InstallmentsList.tsx`**:

1. Adicionar estados de paginação:
```tsx
const [currentPage, setCurrentPage] = useState(1);
const [pageSize, setPageSize] = useState(25);
```

2. Calcular itens paginados:
```tsx
const paginatedInstallments = useMemo(() => {
  const start = (currentPage - 1) * pageSize;
  return sortedInstallments.slice(start, start + pageSize);
}, [sortedInstallments, currentPage, pageSize]);
```

3. Adicionar componente de paginação:
```tsx
<TablePagination
  currentPage={currentPage}
  totalItems={sortedInstallments.length}
  pageSize={pageSize}
  onPageChange={setCurrentPage}
  onPageSizeChange={(size) => {
    setPageSize(size);
    setCurrentPage(1);
  }}
/>
```

---

### 2.3 Melhorar Validação do Formulário de Campanha

**Atualizar `CollectionCampaigns.tsx`**:

```tsx
const [errors, setErrors] = useState<Record<string, string>>({});

const validateForm = () => {
  const newErrors: Record<string, string> = {};
  
  if (!newCampaign.name.trim()) {
    newErrors.name = 'Nome é obrigatório';
  } else if (newCampaign.name.length < 3) {
    newErrors.name = 'Nome deve ter ao menos 3 caracteres';
  }
  
  if (!newCampaign.template) {
    newErrors.template = 'Selecione um template';
  }
  
  setErrors(newErrors);
  return Object.keys(newErrors).length === 0;
};

// No Input:
<Input 
  value={newCampaign.name}
  onChange={(e) => {
    setNewCampaign(prev => ({ ...prev, name: e.target.value }));
    if (errors.name) setErrors(prev => ({ ...prev, name: '' }));
  }}
  className={cn(
    "bg-slate-800/50 border-white/10",
    errors.name && "border-red-500/50"
  )}
/>
{errors.name && (
  <p className="text-sm text-red-400 mt-1">{errors.name}</p>
)}
```

---

### 2.4 Adicionar Confirmação para Ação "Detectar Duplicatas"

O botão "Detectar Duplicatas" já existe mas abre modal direto.

**Atualizar `InstallmentsList.tsx`** - adicionar AlertDialog antes de abrir o modal de duplicatas para ações destrutivas dentro dele.

---

## Fase 3: Boas Práticas (Próximo Mês)

### 3.1 Implementar Error Boundary

**Criar**: `src/components/ErrorBoundary.tsx`

```tsx
import React from 'react';

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-screen bg-slate-950">
          <div className="text-center p-8 bg-slate-900 rounded-xl border border-red-500/30">
            <h1 className="text-xl text-red-400 mb-2">Algo deu errado</h1>
            <p className="text-slate-400 mb-4">{this.state.error?.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-cyan-600 text-white rounded-lg"
            >
              Recarregar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
```

**Atualizar `App.tsx`**:
```tsx
<ErrorBoundary>
  <QueryClientProvider client={queryClient}>
    ...
  </QueryClientProvider>
</ErrorBoundary>
```

---

### 3.2 Adicionar Classe CSS sr-only para Screen Readers

**Atualizar `src/index.css`**:

```css
/* Screen Reader Only - Acessibilidade */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
```

---

## Cronograma de Implementação

```text
┌──────────────────────────────────────────────────────────────────┐
│ FASE 1 - CRÍTICO (Semana 1)                                      │
├──────────────────────────────────────────────────────────────────┤
│ □ 1.2 ARIA labels essenciais (2-3 horas)                         │
│ □ 1.3 Rate limiting para campanhas (2-3 horas)                   │
│ □ Classe CSS sr-only (15 min)                                    │
├──────────────────────────────────────────────────────────────────┤
│ FASE 2 - IMPORTANTE (Semanas 2-3)                                │
├──────────────────────────────────────────────────────────────────┤
│ □ 2.1 Hook useDebounce (30 min)                                  │
│ □ 2.2 Paginação em InstallmentsList (1-2 horas)                  │
│ □ 2.3 Validação de formulário de campanha (1 hora)               │
│ □ 2.4 Confirmações para ações destrutivas (1 hora)               │
├──────────────────────────────────────────────────────────────────┤
│ FASE 3 - BOAS PRÁTICAS (Semana 4)                                │
├──────────────────────────────────────────────────────────────────┤
│ □ 3.1 Error Boundary global (1 hora)                             │
│ □ Service Worker offline (opcional, 2-3 horas)                   │
│ □ Web Vitals monitoring (opcional, 1 hora)                       │
└──────────────────────────────────────────────────────────────────┘
```

---

## Arquivos a Criar

| Arquivo | Propósito |
|---------|-----------|
| `src/hooks/useDebounce.ts` | Hook reutilizável para debounce |
| `src/components/ErrorBoundary.tsx` | Captura erros React globalmente |
| `supabase/functions/validate-campaign-limit/index.ts` | Rate limiting de campanhas |

## Arquivos a Modificar

| Arquivo | Modificações |
|---------|--------------|
| `src/components/collections/InstallmentsList.tsx` | ARIA labels, debounce, paginação |
| `src/components/collections/CollectionCampaigns.tsx` | ARIA labels, validação, rate limit |
| `src/components/Sidebar.tsx` | ARIA labels em links |
| `src/components/ui/sidebar.tsx` | ARIA labels em botões |
| `src/App.tsx` | Envolver com ErrorBoundary |
| `src/index.css` | Adicionar classe .sr-only |

---

## Notas Técnicas

### Sobre Message Channel Errors

Os erros de "message channel closed" mencionados na auditoria são tipicamente causados por **extensões do navegador** (como React DevTools, Ad blockers, etc.), não pelo código da aplicação. Se os erros persistirem em produção sem extensões, investigar listeners de service workers.

### Sobre Otimização de Bundle

O projeto já usa lazy loading para todas as rotas. Otimizações adicionais de bundle (tree-shaking, chunk consolidation) requerem configuração do Vite que está fora do escopo deste plano inicial.

### Toast Notifications

O projeto já possui Sonner configurado e funcionando corretamente. Não é necessária nenhuma ação adicional.

