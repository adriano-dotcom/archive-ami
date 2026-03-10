

## Plano: Renomear Segurados para Tutores & Pets

Adaptar toda a terminologia da página de Segurados para o contexto OrbePet. O foco é renaming de labels — a estrutura de dados e lógica permanecem iguais.

### Alterações

**1. `src/components/Sidebar.tsx`**
- Renomear label `Segurados` → `Tutores`
- Trocar ícone `Users` → `PawPrint` (ou manter `Users` com label novo)

**2. `src/App.tsx`**
- Renomear rota `/segurados` → `/tutores` (manter alias se necessário)
- Atualizar referências de prefetch (apenas comentários/nomes)

**3. `src/components/segurados/SeguradosTab.tsx`**
- Tabs: `Empresas (PJ)` → `Clínicas/Petshops` | `Pessoas (PF)` → `Tutores`
- Botão `Novo Segurado PF` → `Novo Tutor`
- Textos de confirmação: "segurado" → "tutor"
- Remover coluna "Apólices" e referências a "apólices" nos dialogs de exclusão → usar "planos"
- "Valor em Aberto" e "Atraso" continuam (são genéricos)

**4. `src/components/segurados/SeguradosPFTable.tsx`**
- Header `Segurado` → `Tutor`
- Remover coluna `Seguradoras` (já vazia mas ainda renderizada)
- Renomear `Apólices` → `Planos`
- Empty state: "Nenhum segurado PF cadastrado" → "Nenhum tutor cadastrado"

**5. `src/components/segurados/CompaniesTable.tsx`**
- Header `Empresa` → `Clínica/Petshop`
- `Apólices` → `Planos`
- Empty state: "Nenhuma empresa cadastrada" → "Nenhuma clínica/petshop cadastrada"

**6. `src/hooks/useSeguradosData.ts`**
- Apenas renomear comentários. Types e nomes de funções permanecem para não quebrar imports.

### Escopo
- Apenas renaming de UI labels — sem mudanças no banco, sem mudanças em lógica de negócio
- 5 arquivos editados

