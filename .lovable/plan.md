# Pivô para Jacometo Corretora — Seguros de Carga

Transformar o CRM (hoje OrbePet / planos de pet) para atender leads de **seguros obrigatórios do transportador** (RCTR-C, RC-DC, RC-V) da **Jacometo Corretora de Seguros** (Londrina/PR). Inclui reset do banco, ajustes de estrutura, novo catálogo, nova persona de IA ("Iris") e rebrand visual.

## 1. Reset do banco de dados

Apagar **todos os dados operacionais e de configuração**, preservando apenas o login (usuários e permissões).

- **Manter:** `user_roles` (login/permissões).
- **Esvaziar (DELETE):** `contacts`, `conversations`, `messages`, `companies`, `installments`, `installment_history`, `lead_captures`, `lead_nurture_enrollments`, `nurture_step_logs`, `appointments`, `call_logs`, `whatsapp_calls`, `collection_*`, `followup_logs`, `import_*`, `learning_insights`, `media_library*`, `reimbursement_claims`, `sales_coaching_reports`, `scheduled_emails`, `webhook_request_logs`, `ecommerce_orders`, `conversation_states`, todas as filas (`*_queue`), `team_members`, `agents`, `nina_settings`, `orbe_plans_catalog`, `product_knowledge`, `landing_pages`, `nurture_sequences`, `sellers`, `plans`, `policies`, `tag_definitions`, `whatsapp_templates`, `template_status_notifications`, `pending_invites`.
- `nina_settings`, `agents` e o catálogo serão **recriados** já com o conteúdo da Jacometo (passos 3 e 4).

## 2. Ajustes de estrutura (lead de transporte)

Adicionar campos de transporte de carga em `contacts`:

- `rntrc` (texto) — registro ANTT do transportador
- `company_type` (texto) — porte: MEI / ME / EPP
- `vehicle_plate` (texto) — placa do veículo
- `vehicle_type` (texto) — tipo/modelo do veículo
- `cargo_type` (texto) — tipo de carga transportada
- `typical_route_km` (inteiro) — rota típica em km (usado no cálculo do RC-V)

Reaproveitar os campos já existentes: `cnpj`, `cep/street/number/...`, `lead_source`, `lead_status`, UTM. O campo `pet_name` deixa de ser usado (mantido por compatibilidade).

## 3. Catálogo de produtos (seguros de carga)

Substituir o conteúdo de `orbe_plans_catalog` (planos pet) pelos produtos da Jacometo, baseados no site de referência:

- **Pacote 3 seguros obrigatórios** — R$ 900,00/ano (prêmio básico, emissão das 3 apólices, vigência 1 ano, número para indicar no RNTRC).
- **Coberturas:** RCTR-C (danos à carga em acidente), RC-DC (roubo/furto/desaparecimento de carga), RC-V (danos a terceiros pelo veículo).
- **Averbação por embarque:** RCTR-C 0,05% + RC-DC 0,05% (0,1% sobre o valor da mercadoria); RC-V R$ 10 por viagem até 400 km, acréscimo limitado a R$ 25.
- **Seguradora:** Sompo Seguros. **Base legal:** Art. 13 da Lei 11.442/2007; ANTT 478/2024 e 488/26.

## 4. Nova IA "Iris" e prompt do orquestrador

Reescrever a persona e o prompt em `supabase/functions/nina-orchestrator/index.ts`:

- Nome: **Iris**, assistente da Jacometo Corretora, especialista em seguros obrigatórios de transporte de carga.
- Objetivo: qualificar o transportador (CNPJ, RNTRC, porte, veículo, tipo de carga, rota), explicar as 3 coberturas e o preço, e conduzir à contratação online / WhatsApp.
- Substituir toda regra de carência/plano pet pelo catálogo de carga (averbação, prêmio anual, prazos de emissão em até 5 dias).
- Tom: direto, sem burocracia, focado no pequeno transportador.

## 5. Rebrand visual e textual (frontend)

- **Cores:** trocar o roxo (#6A0DAD) por azul-marinho profundo + azul-claro de destaque, no padrão do site de referência (ex.: marinho `#0A2540`/`#0c2340`, accent `#2E9BE6`). Atualizar tokens em `src/index.css` e `tailwind.config.ts`.
- **Tipografia:** títulos em serifa elegante (display) + corpo sans, alinhado ao site de referência.
- **Terminologia (UI):** "Tutores/Pets" → "Transportadores/Carga"; "Clínicas" → "Transportadoras"; "Planos" → "Seguros/Coberturas". Atualizar Sidebar, Dashboard, telas de segurados/contatos e textos.
- **Marca:** nome "Jacometo Corretora de Seguros" em logo/título, e-mails (remetente), `index.html` (title/meta/SEO), favicon.
- Remover textos e ícones específicos de pet remanescentes.

## 6. Memória do projeto

Atualizar `mem://index.md` e arquivos de memória: nova direção (Jacometo / seguros de carga), nova paleta (marinho/azul), terminologia (transportadores/transportadoras), persona "Iris", catálogo de carga — e remover/arquivar as regras específicas de pet (Orbi, carências, planos pet, "no cargo insurance").

## Fora de escopo

- Não recriar a landing page pública idêntica ao site de referência agora (pode ser um passo seguinte com o construtor de LP).
- Não alterar a integração de WhatsApp/voz, filas ou crons (apenas conteúdo/persona).
- Não mexer em `auth`/`storage`/buckets.

## Detalhes técnicos

- **Reset + schema:** uma migration para os novos campos de `contacts`; os DELETEs de dados via ferramenta de dados (insert/delete), respeitando ordem de FKs (mensagens→conversas→contatos, etc.).
- **Catálogo:** reescrever linhas de `orbe_plans_catalog` (mantém a tabela como SSOT injetada na IA) e `product_knowledge` com o conteúdo de carga.
- **Edge function:** editar `nina-orchestrator/index.ts` (persona, regras, catálogo) após a migration.
- **Frontend:** tokens em `index.css`/`tailwind.config.ts`, strings/branding nos componentes de UI e `index.html`.

## Validação

1. Banco: contagens zeradas nas tabelas operacionais; `user_roles` preservado.
2. Catálogo: `orbe_plans_catalog` com os produtos de carga corretos.
3. IA: simular "quanto custa o seguro obrigatório?" — Iris responde R$ 900/ano + averbação, sem qualquer referência a pet.
4. UI: build ok, paleta azul-marinho aplicada, terminologia de transporte, marca Jacometo.
