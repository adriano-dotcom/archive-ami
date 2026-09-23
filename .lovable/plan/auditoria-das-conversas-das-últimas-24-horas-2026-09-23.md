# Auditoria das conversas das últimas 24 horas

## O que existe hoje (verificado no banco)

Nas últimas 24 horas houve **6 conversas** com **208 mensagens**:

| Lead | Telefone | Mensagens | Do lead | Da Iris | Do vendedor | Status |
|---|---|---|---|---|---|---|
| Hernandes Mena Do Amaral | 5515996628641 | 43 | 18 | 12 | 13 | humano |
| Luis | 553597258790 | 38 | 17 | 11 | 10 | humano |
| g magela327 | 5527997005635 | 59 | 24 | 32 | 3 | humano |
| Leo | 5516999632431 | 7 | 2 | 3 | 2 | humano |
| Fretes Clodoaldo | 5547933882714 | 6 | 3 | 0 | 3 | humano |
| Gustavo Silva | 5517991885440 | 55 | 19 | 36 | 0 | Iris |

A tabela de aprendizados (`learning_insights`) está **vazia** — nenhum aprendizado foi registrado até hoje.

## O que vou fazer

### 1. Leitura integral das 6 conversas
Ler as 208 mensagens na ordem, incluindo transcrições de áudio e texto extraído de imagens, separando o que a Iris disse do que o Leonardo (vendedor) disse.

### 2. Relatório de auditoria, conversa por conversa
Para cada lead: perfil (contratado/subcontratado, CNPJ, RNTRC), dados já coletados, em que ponto parou, erros da Iris (classificação errada, promessa que não pode cumprir, pergunta fora de hora, repetição, abandono), e o que o vendedor fez de diferente que funcionou.

### 3. Extração dos padrões de aprendizado
Consolidar os acertos do Leonardo em regras reutilizáveis: como ele explica o produto, como responde objeções (cobertura, seguradora, averbação, preço), como confirma o perfil do transportador e como conduz ao fechamento. E os erros recorrentes da Iris em regras de proibição.

### 4. Registro dos aprendizados no sistema
Gravar cada padrão como um aprendizado em "Aprendizados" (tabela `learning_insights`), com categoria, título, descrição, sugestão de ajuste, exemplos reais retirados das conversas e prioridade — visível na tela de Configurações para revisão da equipe.

### 5. Aplicação no atendimento da Iris
Depois do relatório, aplicar no prompt da Iris (`nina-orchestrator`) apenas os ajustes que a auditoria comprovar, mantendo as regras já existentes: produto só para subcontratado, R$ 911,66/ano, contratação só pelo link oficial, sem emoji, CPF só no fechamento, resposta no mesmo formato recebido (áudio responde áudio).

### 6. Lista de pendências comerciais
Ao final, quais leads estão parados esperando resposta, o que falta de cada um para gerar o link da proposta, e quem deve retomar.

## Detalhes técnicos

- Leitura via consulta às tabelas `messages`, `conversations`, `contacts` e `proposal_drafts` (somente leitura).
- Aprendizados gravados em `public.learning_insights` (campos `category`, `title`, `description`, `suggestion`, `examples`, `priority`, `impact`, `status = 'pending'`), sem mudança de schema.
- Ajustes de comportamento concentrados em `supabase/functions/nina-orchestrator/index.ts` (prompt e regras de qualificação), com redeploy da função.
- Nenhuma mensagem será enviada a nenhum lead durante a auditoria.
