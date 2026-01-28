

# Plano: Arquivamento em Lote de Conversas

## Resumo

Implementar funcionalidade de seleção múltipla de conversas para arquivamento em lote, especialmente útil para limpar conversas de cobrança "Sem Resposta" após +24h sem retorno do cliente.

## Estado Atual

| Funcionalidade | Status |
|----------------|--------|
| Badge "Sem Resposta" | Já implementado - aparece para templates enviados há +24h sem resposta |
| Filtro "Sem Resposta" | Já implementado - botão para filtrar estas conversas |
| Arquivamento individual | Já implementado - via menu dropdown |
| Arquivamento em lote | Não existe - será implementado |

---

## Implementação

### 1. Novos Estados de Seleção

**Arquivo:** `src/components/ChatInterface.tsx`

Adicionar estados para controlar modo de seleção múltipla:

```tsx
// Bulk selection state
const [bulkSelectMode, setBulkSelectMode] = useState(false);
const [selectedConversations, setSelectedConversations] = useState<Set<string>>(new Set());
```

---

### 2. Nova Função para Arquivamento em Lote

**Arquivo:** `src/services/api.ts`

Criar função que arquiva múltiplas conversas de uma vez:

```tsx
archiveConversationsBulk: async (conversationIds: string[]): Promise<void> => {
  console.log(`[API] Bulk archiving ${conversationIds.length} conversations`);
  
  const { error } = await supabase
    .from('conversations')
    .update({ is_active: false })
    .in('id', conversationIds);

  if (error) throw error;
  
  console.log(`[API] ${conversationIds.length} conversations archived`);
}
```

---

### 3. Hook para Arquivamento em Lote

**Arquivo:** `src/hooks/useConversations.ts`

Adicionar função `archiveConversationsBulk`:

```tsx
const archiveConversationsBulk = useCallback(async (conversationIds: string[]) => {
  try {
    await api.archiveConversationsBulk(conversationIds);
    // Remove from local list (optimistic update)
    setConversations(prev => prev.filter(c => !conversationIds.includes(c.id)));
    console.log(`[useConversations] ${conversationIds.length} conversations archived`);
  } catch (err) {
    console.error('[useConversations] Error bulk archiving:', err);
    throw err;
  }
}, []);
```

---

### 4. UI de Seleção Múltipla

**Arquivo:** `src/components/ChatInterface.tsx`

#### 4.1 Botão para Ativar Modo de Seleção

Adicionar botão no header da lista de conversas, próximo ao filtro de arquivados:

```tsx
{/* Botão Modo Seleção */}
<button
  onClick={() => {
    setBulkSelectMode(!bulkSelectMode);
    setSelectedConversations(new Set());
  }}
  className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 shrink-0 transition-all duration-300 ${
    bulkSelectMode
      ? 'bg-gradient-to-r from-cyan-400 to-blue-500 text-white shadow-lg'
      : 'bg-slate-800/40 backdrop-blur-xl text-slate-300 border border-white/10'
  }`}
>
  <Square className="w-4 h-4" />
  {bulkSelectMode ? 'Cancelar' : 'Selecionar'}
</button>
```

#### 4.2 Checkbox em Cada Conversa

Quando em modo de seleção, mostrar checkbox no lugar do avatar ou ao lado:

```tsx
{bulkSelectMode && (
  <div 
    className="w-6 h-6 flex items-center justify-center mr-2"
    onClick={(e) => {
      e.stopPropagation();
      const newSelected = new Set(selectedConversations);
      if (newSelected.has(chat.id)) {
        newSelected.delete(chat.id);
      } else {
        newSelected.add(chat.id);
      }
      setSelectedConversations(newSelected);
    }}
  >
    <Checkbox checked={selectedConversations.has(chat.id)} />
  </div>
)}
```

#### 4.3 Barra de Ações Flutuante

Quando houver seleções, mostrar barra flutuante com contagem e ações:

```tsx
{bulkSelectMode && selectedConversations.size > 0 && (
  <div className="absolute bottom-4 left-4 right-4 bg-slate-900/95 backdrop-blur-xl border border-slate-700 rounded-2xl p-4 shadow-2xl flex items-center justify-between z-30">
    <div className="flex items-center gap-3">
      <span className="bg-cyan-500 text-white text-sm font-bold px-3 py-1 rounded-full">
        {selectedConversations.size}
      </span>
      <span className="text-slate-300 text-sm">selecionadas</span>
      
      {/* Botão selecionar todos visíveis */}
      <button 
        onClick={() => setSelectedConversations(new Set(filteredConversations.map(c => c.id)))}
        className="text-cyan-400 text-xs hover:text-cyan-300"
      >
        Selecionar todos ({filteredConversations.length})
      </button>
    </div>
    
    <div className="flex items-center gap-2">
      {/* Arquivar Selecionados */}
      <button
        onClick={handleBulkArchive}
        className="px-4 py-2 bg-gradient-to-r from-slate-500 to-slate-600 text-white rounded-xl text-sm font-semibold flex items-center gap-2 hover:from-slate-400 hover:to-slate-500"
      >
        <Archive className="w-4 h-4" />
        Arquivar
      </button>
    </div>
  </div>
)}
```

---

### 5. Handler para Arquivamento em Lote

**Arquivo:** `src/components/ChatInterface.tsx`

```tsx
const handleBulkArchive = async () => {
  if (selectedConversations.size === 0) return;
  
  const count = selectedConversations.size;
  try {
    await archiveConversationsBulk(Array.from(selectedConversations));
    setArchivedCount(prev => prev + count);
    setSelectedConversations(new Set());
    setBulkSelectMode(false);
    
    toast.success(`${count} conversa${count > 1 ? 's' : ''} arquivada${count > 1 ? 's' : ''}`, {
      description: 'As conversas foram movidas para Arquivados'
    });
  } catch (error) {
    toast.error('Erro ao arquivar conversas');
  }
};
```

---

### 6. Diálogo de Confirmação (Opcional)

Adicionar AlertDialog antes de arquivar múltiplas conversas:

```tsx
<AlertDialog open={showBulkArchiveConfirm} onOpenChange={setShowBulkArchiveConfirm}>
  <AlertDialogContent className="bg-slate-900 border-slate-700">
    <AlertDialogHeader>
      <AlertDialogTitle className="text-white">Arquivar Conversas</AlertDialogTitle>
      <AlertDialogDescription className="text-slate-400">
        Tem certeza que deseja arquivar {selectedConversations.size} conversa{selectedConversations.size > 1 ? 's' : ''}? 
        Elas serão movidas para a aba "Arquivados".
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancelar</AlertDialogCancel>
      <AlertDialogAction onClick={handleBulkArchive}>
        Arquivar
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

---

## Fluxo de Uso

```text
┌─────────────────────────────────────────────────────────────────┐
│ 1. Filtrar por "Sem Resposta"                                   │
│    → Mostra apenas conversas com template +24h sem resposta     │
├─────────────────────────────────────────────────────────────────┤
│ 2. Clicar "Selecionar"                                          │
│    → Ativa modo de seleção múltipla                             │
├─────────────────────────────────────────────────────────────────┤
│ 3. Selecionar conversas desejadas                               │
│    → Checkboxes aparecem, contador na barra flutuante           │
├─────────────────────────────────────────────────────────────────┤
│ 4. Clicar "Selecionar todos" (opcional)                         │
│    → Seleciona todas as conversas filtradas                     │
├─────────────────────────────────────────────────────────────────┤
│ 5. Clicar "Arquivar"                                            │
│    → Confirmação → Arquiva em lote                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Arquivos a Modificar

| Arquivo | Modificações |
|---------|--------------|
| `src/services/api.ts` | Adicionar `archiveConversationsBulk` |
| `src/hooks/useConversations.ts` | Adicionar função e exportar |
| `src/components/ChatInterface.tsx` | Estados de seleção, UI de checkboxes, barra flutuante |

## Novos Imports Necessários

```tsx
import { Checkbox } from './ui/checkbox';
// Square já está importado
```

---

## Benefícios

- **Produtividade**: Limpar dezenas de conversas "Sem Resposta" com poucos cliques
- **UX**: Interface intuitiva similar a apps de email (Gmail, Outlook)
- **Consistência**: Usa os mesmos componentes e estilos do sistema
- **Segurança**: Confirmação antes de ação destrutiva
- **Reversível**: Conversas podem ser restauradas em "Arquivados"

