# Dados da Empresa no painel Informações do Lead

Hoje o painel "Informações do Lead" mostra apenas **Dados do Transportador** (Telefone, Região, Email, CPF, Tipo de Carga). Os dados de empresa (CNPJ, razão social e RNTRC) já existem no banco e já vêm carregados na consulta, mas não são exibidos. Vou adicionar uma seção **Dados da Empresa** logo abaixo dos dados do transportador.

## O que será exibido
- **Empresa** — razão social / nome da empresa (`contacts.company`, com fallback para a empresa vinculada `linked_company.razao_social` / `nome_fantasia`)
- **CNPJ** — formatado `00.000.000/0000-00` (`contacts.cnpj`, fallback `linked_company.cnpj`)
- **RNTRC** — número do registro ANTT (`contacts.rntrc`), preenchido automaticamente pela consulta ANTT

Cada campo mostra "Não informado" quando vazio, seguindo o mesmo padrão visual atual (ícone + label + valor).

## Edição
Ao ativar o modo de edição (lápis já existente), **Empresa** e **CNPJ** ficam editáveis (inputs), no mesmo estilo dos outros campos. **RNTRC** permanece somente leitura (é resultado da consulta oficial ANTT). O botão "Salvar Alterações" passa a gravar também empresa e CNPJ.

## Detalhes técnicos

1. **`src/types.ts`**
   - Adicionar em `UIConversation`: `contactCnpj: string | null`, `contactCompany: string | null`, `contactRntrc: string | null`.
   - Em `transformDBToUIConversation`, mapear esses campos a partir de `conv.contact` (cnpj, company, rntrc) com fallback para `conv.contact.linked_company` (razao_social/nome_fantasia/cnpj).

2. **`src/hooks/useConversations.ts`** (handler de realtime ~linha 269)
   - Incluir `contactCnpj`, `contactCompany`, `contactRntrc` na atualização otimista quando o contato muda.

3. **`src/services/api.ts`**
   - Em `updateContact`, incluir `rntrc?: string | null` na assinatura (company e cnpj já existem). Não é obrigatório se RNTRC ficar somente leitura.

4. **`src/components/chat/ContactProfilePanel.tsx`**
   - Nova seção "Dados da Empresa" com os três campos (ícones: prédio para empresa, documento para CNPJ, caminhão para RNTRC).
   - Novos props: `editCnpj/setEditCnpj`, `editCompany/setEditCompany` para edição.
   - Formatação de CNPJ para exibição.

5. **`src/components/ChatInterface.tsx`**
   - Novos estados `editCnpj`, `editCompany` inicializados a partir de `activeChat` (junto dos demais `edit*`, ~linha 521).
   - Passar novos props ao `ContactProfilePanel` (~linha 2649).
   - Em `handleSaveContactData`, incluir `company` e `cnpj` no `api.updateContact`.

Nenhuma mudança de banco de dados é necessária — os campos já existem em `contacts` e já são consultados.
