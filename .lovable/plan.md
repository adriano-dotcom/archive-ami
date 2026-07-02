## Objetivo

Neste CRM (Jacometo/Iris), replicar automaticamente o lead para o **Mitsui Projeto** via **webhook assinado com HMAC-SHA256** sempre que um contato entrar na etapa **Proposta** (`lead_status = 'proposal'`). O receptor `/api/public/ingest-lead` será criado depois, no Mitsui Projeto, usando o mesmo segredo `CRM_INGEST_SECRET`.

## Fluxo

```text
Funil (arrastar p/ "Proposta")  ->  UPDATE contacts.lead_status='proposal'
        -> trigger AFTER UPDATE (pg_net POST assíncrono)
        -> edge function replicate-lead-to-crm
        -> monta payload + assina HMAC-SHA256
        -> POST https://direct-render-dupe.lovable.app/api/public/ingest-lead
              headers: X-Signature, X-Timestamp, X-Event-Id
```

## Passos

### 1. Segredo
- Adicionar `CRM_INGEST_SECRET` (mesmo valor que será usado no receptor do Mitsui). Peço o valor via formulário seguro.

### 2. Edge function `replicate-lead-to-crm`
- `verify_jwt = false` em `supabase/config.toml`.
- Recebe `{ contact_id }` (enviado pelo trigger).
- Carrega o contato pelo `SUPABASE_SERVICE_ROLE_KEY`.
- Monta o payload do lead (campos relevantes do contato):
  - `name`, `call_name`, `email`, `phone_number`
  - `company`, `cnpj`, `cpf`, `rntrc`, `company_type`
  - `cargo_type`, `vehicle_plate`, `vehicle_type`, `typical_route_km`
  - `city`, `state`, `neighborhood`, `cep`
  - `lead_source`, `lead_status`, `tags`, `notes`
  - `utm_source`, `utm_campaign`, `utm_content`, `utm_term`
  - metadados: `source_system: "jacometo-crm"`, `external_id: contact.id`, `stage: "proposal"`, `occurred_at`
- Assinatura (esquema SHA-256 padrão):
  - `timestamp = Date.now()`
  - `body = JSON.stringify(payload)`
  - `signature = HMAC_SHA256(secret, timestamp + "." + body)` em hex
  - Headers: `X-Signature: sha256=<hex>`, `X-Timestamp: <ms>`, `X-Event-Id: <contact_id>-<timestamp>`, `Content-Type: application/json`
- `POST` para `https://direct-render-dupe.lovable.app/api/public/ingest-lead`.
- Trata resposta: loga status/erro; não relança para não travar o trigger.

### 3. Trigger no banco (migração)
- Function `notify_lead_proposal()` (SECURITY DEFINER) que dispara apenas quando `lead_status` muda **para** `'proposal'` (`NEW.lead_status='proposal' AND OLD.lead_status IS DISTINCT FROM 'proposal'`).
- Usa `net.http_post` com `current_setting('supabase.service_role_key', true)` (padrão já usado no projeto — sem chave hardcoded), enviando `{ contact_id: NEW.id }` para a function.
- Trigger `AFTER UPDATE OF lead_status ON public.contacts`.
- Envolver em `EXCEPTION WHEN OTHERS` com `RAISE WARNING` para nunca bloquear a atualização do contato.

### 4. Validação
- Teste manual: mover um contato para "Proposta" no funil e conferir nos logs da function o POST e a assinatura gerada.
- O endpoint de destino ainda não existe (retornará 404 até o receptor ser criado no Mitsui) — o importante nesta etapa é confirmar que o disparo, o payload e a assinatura saem corretos. O receptor validará a mesma assinatura depois.

## Detalhes técnicos / observações
- **Direção cross-project é one-way**: não consigo escrever no Mitsui Projeto a partir daqui. Por isso o receptor `/api/public/ingest-lead` fica como próximo passo, feito de dentro do Mitsui (TanStack `/api/` server route), reutilizando `CRM_INGEST_SECRET` e recomputando `HMAC_SHA256(secret, timestamp + "." + body)` para validar, com checagem de janela de tempo (anti-replay) via `X-Timestamp`.
- URL de destino usa a Published URL do Mitsui (`direct-render-dupe.lovable.app`). Se preferir o domínio custom (ex.: `transporte.jacometoseguros.com.br`), é só trocar a constante.
- Não altera lógica de captura de leads existente nem outras automações; apenas adiciona o disparo na entrada em "Proposta".
