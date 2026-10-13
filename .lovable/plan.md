# Atribuição de origem no webhook do WhatsApp (tag [M:...]/[G:...])

Escopo fechado: 1 migration, 1 arquivo novo, 1 função editada. Nada de nina-orchestrator, prompts, templates, checkout ou receive-ecommerce-webhook.

## 1. Migration aditiva (necessária — coluna não existe)

Verificado no banco: `contacts` tem `utm_source`, `campaign`, `lead_source`, mas **não** tem `meta_ad_id`.

```sql
ALTER TABLE public.contacts ADD COLUMN meta_ad_id text;
```

Nullable, sem default, sem mexer em RLS.

## 2. Arquivo novo: `supabase/functions/_shared/source-tag.ts`

Parser exatamente como fornecido (`parseSourceTag`): detecta `[M:utm_campaign|utm_content|utm_term|clid]` ou `[G:...]`, retorna `cleanText` (sem a tag), `kind`, utms e `clid` sanitizado. `-` = vazio.

## 3. `supabase/functions/whatsapp-webhook/index.ts` — função `processIncomingMessage` (linha 976)

**a) Parse da tag** — logo depois do `switch (message.type)` (linha 1110-1217), antes do insert em `messages` (linha 1220):
- Só se `message.type === 'text'` e `content` preenchido: `const tag = parseSourceTag(content)`.
- Se `tag.kind`: `content = tag.cleanText || content` (a Iris nunca vê a tag), e no `metadata.raw` (objeto da Meta) substituir `text.body` pelo texto limpo.
- No metadata do insert de `messages` acrescentar: `source_tag: tag.kind, source_clid: tag.clid, raw_text: <texto original>`.

**b) Gravação no contato (first-touch)** — somente se o contato ainda não tem `utm_source` (relido do banco com `select utm_source`):
- `utm_source` = facebook/google, `utm_campaign`, `utm_content`, `utm_term`, `campaign` = utm_campaign, `lead_source = 'landing_combo'`.
- Envolver em try/catch: erro só loga, nunca derruba o webhook.

**c) CTWA (blocos existentes, linhas 1002-1030 e 1062-1076)** — acrescentar apenas:
- `meta_ad_id = referral.source_id ?? null` no INSERT de contato novo e no UPDATE de contato existente. O resto do bloco CTWA fica como está.

## 4. Deploy

Somente `whatsapp-webhook`. Nenhuma outra função muda.

## Verificação

- Build OK após deploy.
- Simulação local do parser com o texto de exemplo (`[M:combo_meta|ad13|-|IwAR2xYzAbCdEfGhIjKl]`) confirmando `cleanText` sem a tag e campos corretos.
