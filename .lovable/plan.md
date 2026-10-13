# Envio real ao Pipedrive + cadastro da Empresa (Organização)

## O que muda
1. **Empresa também vai para o Pipedrive**: quando o contato tiver CNPJ válido (14 dígitos) e nome da empresa, a função procura a Organização no Pipedrive pelo CNPJ/nome. Se existir, vincula; se não existir, **cria** a Organização (nome da empresa, CNPJ no nome/nota, dono Leonardo Sanches) e vincula a Pessoa e o Lead a ela.
2. Sem CNPJ ou sem nome da empresa: comportamento atual (só Pessoa + Lead + nota).
3. Nota continua sem CPF.

## Teste real (após aprovar)
- Escolher 1 contato real com CNPJ e empresa preenchidos que ainda não foi enviado (a Dunas já foi).
- Rodar o envio real (dry_run=false).
- Conferir no Pipedrive via conector: Pessoa, Lead e Organização criados e vinculados, dono correto.
- Conferir no painel do contato: "Enviado em ...".
- Para a Dunas (já enviada sem empresa): criar/vincular a Organização dela também.

## Fora do escopo
Nina, webhook do WhatsApp, notify_lead_proposal, replicate-lead-to-crm, gatilho automático (continua igual).

## Técnico
- `push-lead-pipedrive/index.ts`: antes de criar Pessoa, `GET /organizations/search?term=<cnpj>` (e por nome); senão `POST /organizations` com `name`, `owner_id`; usar `org_id` em `POST /persons` e `POST /leads` (`organization_id`). Para pessoa já existente sem org, `PUT /persons/{id}` com `org_id`.
- Gravar erro em `pipedrive_sync_error` se a criação da organização falhar, sem bloquear Pessoa/Lead.
- Deploy só de `push-lead-pipedrive`.
