# Coleta de dados no fluxo "Contratado"

## Objetivo
Quando o lead se identifica como **contratado** (responsável pela carga), a Iris deve coletar CNPJ, e-mail e celular — um por vez — e só encaminhar ao corretor humano quando os três estiverem salvos no banco.

## Situação atual (o que já funciona)
- **Persistência já existe:** os blocos de detecção de CNPJ (com consulta BrasilAPI + confirmação), de e-mail e o telefone do WhatsApp já gravam esses dados na tabela `contacts` para qualquer mensagem, independente do tipo.
- **Gate de handoff já existe:** `isContratadoDataComplete()` só libera o encaminhamento quando CNPJ + e-mail + celular estão presentes; enquanto faltar dado, deixa a IA continuar coletando.
- **Encaminhamento ao corretor já leva os dados:** o handoff do contratado seta `lead_status='proposal'`, que dispara `replicate-lead-to-crm` — payload já inclui CNPJ, e-mail, telefone e razão social. O painel "Informações do Lead" também exibe esses campos.

## Lacuna a corrigir
Falta a **orientação no prompt** para o caminho contratado. Hoje existe o bloco de apresentação do subcontratado (`isSubcontratadoLead`), mas nenhum bloco equivalente para o contratado. Sem isso, a IA fica sem instrução clara de pedir CNPJ → e-mail → confirmar celular, e o gate pode nunca completar.

## Mudança
Em `supabase/functions/nina-orchestrator/index.ts`, na função que monta o prompt (`buildEnhancedPrompt`), logo após o bloco `isSubcontratadoLead` (por volta da linha 5151), adicionar um novo bloco condicional para quando `tipoJaConhecido` for **contratado**:

- Explicar em 1 frase que, como ele é responsável pela carga, o produto certo é o **com cobertura efetiva/averbação**, feito por um corretor especialista.
- Instruir a coletar, **uma pergunta por vez**, na ordem: **CNPJ → e-mail → confirmar o melhor celular** (o número do WhatsApp já serve como celular; apenas confirmar).
- Respeitar as regras anti-repetição já existentes: se o CNPJ/RNTRC já foi consultado, não perguntar de novo.
- Não prometer preço/cobertura específica — isso é papel do corretor.
- Deixar claro que, assim que tiver os dados, vai repassar ao corretor especialista.

O gate `isContratadoDataComplete()` e o handoff (mensagem final + `lead_status='proposal'` + `is_active=false` + `contratado_handoff_done`) permanecem como estão — passam a ser efetivamente acionados porque a IA agora coleta os dados.

## Verificação
- Type-check e deploy da função `nina-orchestrator`.
- Simular conversa: lead responde "contratado" → Iris pede CNPJ → e-mail → confirma celular → após completar, dispara a mensagem de handoff.
- Conferir no banco (`contacts`) que CNPJ, e-mail e telefone ficaram salvos e que `lead_status` virou `proposal`.

## Detalhes técnicos
- Arquivo único: `supabase/functions/nina-orchestrator/index.ts`.
- Sem alterações de schema — usa colunas existentes (`contacts.cnpj/email/phone_number`, `conversations.nina_context`) e triggers já ativos (`notify_lead_proposal`).
