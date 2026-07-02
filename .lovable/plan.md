## Contexto

Os contatos que entram pelo chat **já são salvos** na base (tabela `contacts`) e ficam ligados às conversas. O que acontece é que a única tela no menu (`Transportadores` → `/tutores`) tem duas abas:
- **Empresas** — lê da tabela `companies` (vazia).
- **Transportadores** — mostra só **segurados/clientes** (quem tem apólice, é `cliente`, tem assinatura, ou veio de cobrança/e-commerce).

Leads novos vindos do chat (status `novo`/`qualificado`, sem apólice) são filtrados para fora de propósito, então aparecem "0". Não há perda de dados.

## Solução escolhida

Adicionar uma **terceira aba "Leads"** dentro da tela de Transportadores, ao lado de *Empresas* e *Transportadores*, listando exatamente os contatos que entraram pelo chat e ainda não viraram segurados. Segurados e empresas continuam separados, sem misturar.

Nenhuma mudança de banco é necessária — é só leitura/exibição de dados que já existem.

## O que será feito

### 1. Buscar os leads (`src/hooks/useSeguradosData.ts`)
- Criar a interface `Lead` (id, nome, telefone, e-mail, CPF, CNPJ, cidade, estado, status do lead, origem, tags, data de entrada, última atividade).
- Adicionar `fetchLeads()`: retorna contatos que **não** se qualificam como segurados — ou seja, sem apólice, não `cliente`, sem assinatura, e origem diferente de cobrança/e-commerce. Diferente da aba Transportadores, **não** vai esconder nomes que parecem empresa (ex.: "RM transporte", "Sm Tuning"), pois esses também são leads legítimos do chat.
- Incluir `leads` no retorno de `fetchSeguradosData()` (ao lado de `companies` e `seguradosPF`).

### 2. Nova tabela de leads (`src/components/segurados/LeadsTable.tsx`)
- Componente novo, no estilo da tabela de Transportadores existente.
- Colunas: **Nome**, **Telefone**, **CNPJ/CPF**, **Status** (badge do estágio do lead), **Origem**, **Entrou em** (data formatada com `parseISO` do date-fns, conforme padrão do projeto) e **Ações**.
- Ações por linha: **Abrir conversa** (usa o fluxo já existente `handleOpenConversation`) e **Excluir**. Seleção múltipla para exclusão em lote.

### 3. Integrar a aba (`src/components/segurados/SeguradosTab.tsx`)
- Ampliar `activeSubTab` para `'pj' | 'pf' | 'leads'`.
- Adicionar um `TabsTrigger` **"Leads"** com contador e cor própria (ex.: âmbar/ciano) e um `TabsContent value="leads"` renderizando a `LeadsTable`.
- Adicionar `filteredLeads` (respeita a busca por nome/telefone/documento já existente).
- Reaproveitar a exclusão em lote já existente de contatos para a aba Leads.
- Botão de criação: manter "Nova Empresa"/"Novo Transportador" nas abas atuais; na aba Leads não é necessário botão de criação (os leads chegam pelo chat).

## Detalhes técnicos
- A definição de "lead" é o inverso do filtro de segurados PF já presente em `fetchSeguradosPFOptimized` (linhas 230-238), sem a exclusão por nome-de-empresa.
- Sem migração de banco: apenas frontend + consulta de leitura.
- Datas exibidas com `parseISO` (nunca `new Date()`), seguindo o padrão do projeto.
- Terminologia mantida: rótulos "Transportadores"/"Empresas"/"Leads"; valores de banco legados intactos.

## Resultado
Ao abrir **Transportadores**, você verá 3 abas: **Empresas**, **Transportadores** (segurados) e **Leads** — esta última já listando Adriano, RM transporte, Aldair Santos, Sm Tuning, DEOLINDA, Jocileny e o Lead +55 43 9125-5007, com botão para abrir a conversa de cada um.