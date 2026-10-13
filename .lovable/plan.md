# Integração Pipedrive: contatos do WhatsApp → Pessoa + Lead

## Abordagem

Em vez de secret manual + Vault, usamos o **conector Pipedrive** da plataforma: você conecta a conta uma vez (cartão seguro na conversa, o token nunca passa pelo chat nem fica escrito em código) e o backend passa a ter a variável `PIPEDRIVE_API_KEY` disponível automaticamente para as funções. Isso elimina a necessidade de gravar o token no Vault — a função lê a credencial do ambiente, como já faz com RESEND e ElevenLabs.

## Passos

1. **Conectar o Pipedrive** — abro o cartão de conexão; você cola o token da sua conta Pipedrive (Configurações → Preferências pessoais → API) no formulário seguro.

2. **Migration** (uma só):
   - Colunas em `contacts`: `sent_to_pipedrive_at timestamptz`, `pipedrive_sync_error text` (nullable, sem DEFAULT obrigatório).
   - Trigger `trg_push_lead_pipedrive` AFTER INSERT OR UPDATE OF lead_status, cnpj ON contacts: só dispara quando `lead_status` ou `cnpj` mudou E `sent_to_pipedrive_at IS NULL`, chamando a edge function via `net.http_post` no mesmo padrão fire-and-forget da `notify_lead_proposal` (EXCEPTION WHEN OTHERS → só WARNING). O segredo da chamada interna é lido do Vault (`internal_cron_secret`), nunca em texto no SQL.

3. **Edge function `push-lead-pipedrive`** (nova):
   - Guard: aceita só chamada interna (header `x-internal-secret` = INTERNAL_CRON_SECRET ou Bearer service-role).
   - Busca o contato pelo `contact_id` recebido; ignora se já tem `sent_to_pipedrive_at`.
   - Cria **Pessoa** no Pipedrive (nome, telefone, e-mail, CNPJ no campo de observação) e depois **Lead** vinculado, com a origem da campanha (utm_source/campaign/meta_ad_id do contato) no título/campo de origem.
   - Chamadas via gateway do conector (`PIPEDRIVE_API_KEY` + `LOVABLE_API_KEY` do ambiente) — nenhum token em código.
   - Sucesso → grava `sent_to_pipedrive_at = now()`; falha → grava `pipedrive_sync_error` com o erro e não derruba nada.
   - Suporta `dry_run: true`: monta o payload de um contato real e devolve o JSON **sem enviar** ao Pipedrive.

4. **Deploy** só da função `push-lead-pipedrive`.

5. **Teste**: rodo `dry_run` com um contato real que tenha CNPJ e te mostro o JSON. Nenhum envio real nem lead de teste — você valida o envio real depois.

## Fora de escopo (não toco)

- `notify_lead_proposal`, `replicate-lead-to-crm`, Nina/orchestrator, webhook do WhatsApp, checkout.
- Nenhum contato antigo é enviado.

## Detalhes técnicos

- API Pipedrive v1 via gateway do conector (base já inclui `/v1`): `POST /persons` depois `POST /leads`.
- Trigger em SQL com `pg_net`; função em Deno (TypeScript).
- Se preferir o caminho com secret manual `PIPEDRIVE_API_TOKEN` + Vault em vez do conector, me avise antes de aprovar.
