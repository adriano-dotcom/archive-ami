# Atualizar o Cadastro (/tutores) para o padrão Jacometo / Iris

A página de cadastro acessada em **`/tutores`** (componente `SeguradosTab`) ainda usa
terminologia de pet ("Novo Tutor", "Clínicas/Petshops", "Tutores", "Nenhum tutor
cadastrado"). Vamos rebrandizar todos os rótulos visíveis para a terminologia de
**transporte de carga** (Jacometo Corretora / assistente "Iris"), mantendo toda a lógica
de negócio intacta (apenas textos de UI).

## Mapeamento de termos

| Antes (pet)              | Depois (transporte)      |
|--------------------------|--------------------------|
| Novo Tutor               | Novo Transportador       |
| Tutores                  | Transportadores          |
| Clínicas/Petshops        | Empresas                 |
| Clínica/Petshop          | Empresa                  |
| Tutor (cabeçalho)        | Transportador            |
| "Nenhum tutor cadastrado"| "Nenhum transportador cadastrado" |
| "Nenhuma clínica/petshop cadastrada" | "Nenhuma empresa cadastrada" |
| Planos (vinculados)      | Apólices (vinculadas)    |

## Arquivos a editar (somente textos de UI)

1. **`src/components/segurados/SeguradosTab.tsx`**
   - Botão "Novo Tutor" → "Novo Transportador"
   - Abas "Clínicas/Petshops" → "Empresas" e "Tutores" → "Transportadores"
   - Toasts e diálogos de exclusão (individual e em lote) com "tutor/tutores" →
     "transportador/transportadores"; "clínica/petshop" → "empresa"; "planos" → "apólices"
   - Diálogo "Detalhes do tutor" → "Detalhes do transportador"

2. **`src/components/segurados/SeguradosPFTable.tsx`**
   - Empty state "Nenhum tutor cadastrado" → "Nenhum transportador cadastrado" e subtexto
   - Cabeçalho de coluna "Tutor" → "Transportador"

3. **`src/components/segurados/CompaniesTable.tsx`**
   - Empty state "Nenhuma clínica/petshop cadastrada" → "Nenhuma empresa cadastrada" e subtexto
   - Cabeçalho de coluna "Clínica/Petshop" → "Empresa"

## Observações
- Nenhuma mudança em schema, queries ou lógica — apenas strings de interface.
- Mantém o comportamento atual de PJ (Empresas) + PF (Transportadores) e importação.
