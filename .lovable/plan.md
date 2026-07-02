# Treinar a Iris com as informações do site (fonte única)

## Decisões aplicadas
- **Site = verdade única:** produto oficial passa a ser o pacote das 3 apólices (RCTR-C, RC-DC, RC-V) por **R$ 644,28/mês** (recorrente, IOF incluso), modalidade de **comprovação/compliance** do transportador **subcontratado** — **não indeniza sinistro**. Remove-se do agente o modelo antigo de R$ 900/ano + averbação por embarque.
- **Conteúdo:** Home + FAQ (fatos do produto).
- **Armazenamento:** base de conhecimento `product_knowledge` (já injetada no prompt da Iris).

## Fatos do site que a Iris vai passar a usar
- Pacote com as 3 apólices obrigatórias RCTR-C, RC-DC e RC-V, cada uma com número próprio, emitidas num único fluxo por seguradora parceira registrada na SUSEP.
- Preço: **R$ 644,28/mês** (prêmio mensal recorrente, IOF e encargos inclusos). Vigência de 1 ano a partir da emissão.
- Base legal: **Lei 14.599/2023**, obrigatória desde **09/01/2026** (base histórica: Art. 13 da Lei 11.442/2007).
- Público: MEI, ME e EPP registrados como ETC na ANTT, que atuam como **subcontratados (agregados)**.
- Modalidade de **comprovação** do seguro obrigatório perante a ANTT — **não substitui a cobertura efetiva da carga** de cada viagem (responsabilidade do contratante principal). **Não há indenização em sinistro.**
- Quem atua como **contratado** (responsável pela carga) precisa migrar para pacote com cobertura efetiva → orientar contato/WhatsApp com a Jacometo.
- Passo a passo: (1) preencher online com CNPJ → (2) aceitar a proposta → (3) emissão em até **5 dias úteis** → (4) indicar o número da apólice no RNTRC.
- Contratação 100% online no site oficial; atendimento humano em Londrina/PR; corretora especialista, +25 anos.

## Mudanças no backend

### 1. Base de conhecimento (`product_knowledge`) — via insert tool
Atualizar o registro existente (`Pacote do Pequeno Transportador`) para refletir o site:
- `summary`: pacote das 3 apólices a R$ 644,28/mês, compliance do subcontratado, sem indenização.
- `full_content`: texto estruturado com os fatos acima (produto, preço, base legal, público, modalidade/compliance, sem indenização, migração para contratado, passo a passo, prazos, seguradora SUSEP, canal de contratação).
- Manter `is_active = true`, `extraction_status = 'completed'`.

### 2. Catálogo (`orbe_plans_catalog`) — via insert tool
Atualizar o registro do plano:
- `monthly_price` → **644.28**.
- `plan_name` → "Pacote 3 Apólices Obrigatórias (RCTR-C + RC-DC + RC-V) — Compliance do Subcontratado".
- `limits_per_event` → remover campos de averbação (`averbacao_*`, `rcv_*`, `premio_basico_anual`); manter `emissao_dias: 5` e marcar mensalidade recorrente/compliance.
- `coverages` → manter descrição das 3 apólices, mas deixar explícito que é modalidade de comprovação (sem indenização efetiva).

### 3. Prompt do orquestrador (`supabase/functions/nina-orchestrator/index.ts`)
- Substituir o bloco fixo de preço/averbação (aprox. linhas 3631–3644) pelo novo modelo: **R$ 644,28/mês recorrente**, sem averbação por embarque; remover percentuais 0,05%/0,1% e RC-V por km.
- Ajustar `\n### ${plan_name} — prêmio básico ${price}/ano` → **/mês** (linha ~3685).
- Atualizar base legal: incluir **Lei 14.599/2023 (obrigatório desde 09/01/2026)** onde hoje cita apenas Lei 11.442/2007 e ANTT 478/2024 (linhas ~3649 e ~4926).
- Atualizar a linha de atendimento que cita "R$ 900/ano + averbação por embarque" → **R$ 644,28/mês** (linha ~4930).
- Manter o bloco do subcontratado (já correto) e o MODELO DE PRIMEIRA RESPOSTA, alinhando o preço.
- Reimplantar a função `nina-orchestrator`.

### 4. Memória do projeto
- Atualizar/afinar memórias que ficam desatualizadas com o novo modelo: `Plans Catalog SSOT`, `Sales Anchor Strategy` (ancoragem/averbação) e `Iris Persona` — registrando que o produto oficial é o pacote de compliance do subcontratado a R$ 644,28/mês, sem averbação e sem indenização.

## Validação
- `supabase--read_query` para conferir os novos valores em `product_knowledge` e `orbe_plans_catalog`.
- Rodar o teste `subcontratado.test.ts` (já existente) para garantir que a Iris continua consistente sobre "sem cobertura/indenização" e direcionamento.
- Teste rápido via `curl_edge_functions`/simulação perguntando preço e "quem pode contratar" para confirmar que a Iris responde R$ 644,28/mês e Lei 14.599/2023.

## Observações
- O site não nomeia a seguradora ("seguradora parceira registrada na SUSEP"); a base de conhecimento seguirá essa redação. Menções internas a "Sompo" no prompt serão suavizadas para "seguradora parceira (SUSEP)" para não conflitar com o site.
- Não altera schema (apenas dados) nem a lógica de captura de leads; muda a base de conhecimento, o catálogo e os fatos do prompt.
