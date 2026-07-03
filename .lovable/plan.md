# Questionário de qualificação da Iris (modelo Mitsui)

Quando o lead demonstra interesse, a Iris passa a conduzir a **mesma sequência de qualificação do Mitsui Projeto**, uma pergunta por vez, e ao concluir envia o link de contratação **e** registra o lead para um corretor.

## Sequência de qualificação (modelo Mitsui exato)
1. **CNPJ** da transportadora.
2. **Confirmar empresa + RNTRC/ANTT** (o sistema já consulta Receita + ANTT automaticamente e pede confirmação).
3. **Tipo de transportador**: atua como **contratado** (responsável pela carga) ou **subcontratado** (agregado)?
4. **E-mail** para envio da cotação.
5. **Celular (WhatsApp)** — como a conversa já ocorre no WhatsApp, a Iris **confirma** o número atual ("Posso usar este mesmo número?") em vez de pedir do zero.

**Gatilho crítico:** se o lead disser que atua como **contratado** (responsável pela carga), este produto (compliance, sem indenização) não serve — a Iris não envia o link, encerra a qualificação e encaminha para um corretor humano (produto com cobertura efetiva/averbação).

## Ao concluir a qualificação (subcontratado + CNPJ + e-mail + celular)
A Iris executa as **duas** ações:
- **Envia o link** oficial: `https://transporte.jacometoseguros.com.br` para o lead preencher a proposta.
- **Registra/avisa o corretor**: o orquestrador marca o contato como `lead_status = 'proposal'`, o que dispara o pipeline já existente (`notify_lead_proposal` → `replicate-lead-to-crm`) que registra/replica o lead no CRM.

## Substituição da qualificação legada
Os campos antigos que não batem com o produto de compliance (`tipo_carga`, `estados`, `viagens_mes/valor_medio`, `tipo_frota`, `emite_cte`) são removidos da lógica e das instruções do prompt. Passam a valer apenas os 4 dados do modelo Mitsui: **CNPJ, tipo de transportador, e-mail, celular**.

---

## Detalhes técnicos (arquivo: `supabase/functions/nina-orchestrator/index.ts`)

1. **Prompt de fluxo (`buildEnhancedPrompt`, bloco ~3679–3704 "REGRA DE CONTRATAÇÃO"):**
   - Reescrever o "Fluxo correto" para a sequência Mitsui: (1) CNPJ → (2) confirmar empresa/RNTRC → (3) tipo de transportador → (4) e-mail → (5) confirmar celular → (6) enviar link.
   - Adicionar o **gatilho crítico** contratado → não enviar link, encaminhar para humano.
   - Reforçar "UMA pergunta por vez".

2. **Bloco anti-repetição / checklist (~5198–5209 e ~5329–5342):**
   - Substituir `fieldLabels` e a "Lista de verificação antes de perguntar" pelos 4 campos Mitsui (CNPJ, tipo de transportador, e-mail, celular). Remover referências a tipo de carga, estados, frota, CT-e.
   - Ajustar exemplos anti-eco (linhas ~5275–5276, ~5331–5332) que citam "alimentos"/"estados".

3. **`isQualificationComplete` (~1524):**
   - Reescrever para exigir: `contact.cnpj`, `qa.tipo_transportador === 'subcontratado'`, `contact.email`, e celular (`contact.phone_number`/`whatsapp_id`).

4. **`extractQualificationFromMessages` (~1543):**
   - Remover padrões legados; extrair `tipo_transportador` (contratado/subcontratado/agregado). Persistir em `nina_context.qualification_answers` (hoje `mergedQA` em ~3506 é montado mas não salvo — passará a ser salvo).

5. **Ação de conclusão (novo bloco após detecção de e-mail, ~3501):**
   - Após atualizar `qualification_answers`, chamar `isQualificationComplete`. Se completo e **subcontratado**: enfileirar mensagem com o link e `update contacts set lead_status='proposal'` (dispara `replicate-lead-to-crm`), evitando repetir se já enviado (flag em `nina_context`).
   - Se **contratado**: pausar para handoff humano (sem link), usando o mecanismo de handoff já existente.

6. **Deploy** da função `nina-orchestrator` e teste rápido: simular mensagens (CNPJ → confirmação → "sou subcontratado" → e-mail) e verificar envio do link + `lead_status='proposal'`.

Nenhuma alteração de schema é necessária (usa `nina_context.qualification_answers`, `contacts.lead_status` e o trigger já existentes).