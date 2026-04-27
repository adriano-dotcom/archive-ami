## Objetivo

Reforçar o `sanitizeAiResponse` no `nina-orchestrator` para garantir que **toda resposta que mencione o produto Orbe 360 (ou seus benefícios) inclua obrigatoriamente o link `https://orbepet.com.br/orbe-360`**, mesmo quando a intenção "lead sem pet" não tenha sido detectada na mensagem do usuário.

Hoje a verificação só atua quando `orbe360Intent === true` (regex sobre a mensagem do tutor). Casos comuns ficam fora:
- A IA cita "Orbe 360" espontaneamente em cross-sell sem o link.
- A IA fala de "telemedicina humana" ou "assistência funeral" sem citar o produto nem o link.
- A IA cita o produto em outro contexto (ex.: dúvida solta sobre planos) sem link.

## O que vai mudar

### 1. Nova função `enforceOrbe360Link(content)` no sanitizer

Centraliza a regra de link obrigatório. Comportamento:

- **Detecta menção ao Orbe 360 na resposta** via regex:
  - `/orbe[\s-]?360/i`
  - `/telemedicina\s+human[oa]/i`
  - `/(assist[eê]ncia|cobertura|servi[cç]o)\s+funeral/i`
  - `/apoio\s+psicol[oó]gico/i`
- **Se detectou menção E o link `orbepet.com.br/orbe-360` está ausente**:
  - **Caso A — menção explícita ao "Orbe 360"**: anexa uma linha final com o link no formato:  
    `\n\nConfere aqui: https://orbepet.com.br/orbe-360`
  - **Caso B — menção apenas a benefícios (telemedicina humana / funeral) sem o nome do produto**: substitui pela `ORBE_360_FALLBACK_RESPONSE` determinística (mesma constante já existente).
- **Se não detectou menção alguma**: retorna o conteúdo intacto.
- Loga em `[Nina][Orbe360][Sanitizer]` com o caso aplicado para auditoria.

### 2. Integrar a nova função dentro de `sanitizeAiResponse`

Ao final de `sanitizeAiResponse`, antes do `return`, chamar `enforceOrbe360Link(sanitized)`. Isso garante que **todo caminho que passa pelo sanitizer** ganhe a verificação automaticamente — incluindo o fluxo normal (linha 4040) e o de handoff (que hoje não chama o sanitizer antes do safety net).

### 3. Adicionar `sanitizeAiResponse` no fluxo de handoff

No bloco de handoff (linhas ~3847–3857), aplicar `aiContent = sanitizeAiResponse(aiContent)` **antes** do safety net existente, para que o handoff também receba a verificação automática do link.

### 4. Manter o safety net `orbe360Intent` existente

O bloco atual (linhas 3854 e 4044) continua válido como **rede de segurança extra** quando a intenção do usuário foi detectada. Ele agora opera como segunda camada — se o sanitizer não capturou (resposta sem mencionar nem produto nem benefícios mas usuário pediu), o safety net força o `ORBE_360_FALLBACK_RESPONSE`.

### 5. Logs estruturados

Três níveis de log para facilitar diagnóstico:
- `[Nina][Orbe360][Sanitizer] case=A link_appended` — produto citado, link anexado.
- `[Nina][Orbe360][Sanitizer] case=B fallback_replaced` — só benefícios, resposta substituída.
- `[Nina][Orbe360][SafetyNet] intent_detected_no_mention` — intenção do usuário detectada e nem produto nem benefícios apareceram.

## Detalhes técnicos

**Arquivo único editado:** `supabase/functions/nina-orchestrator/index.ts`

Pseudocódigo da nova função:
```typescript
const ORBE_360_LINK = 'https://orbepet.com.br/orbe-360';

function enforceOrbe360Link(content: string): string {
  if (!content) return content;
  const lower = content.toLowerCase();
  const hasLink = lower.includes('orbepet.com.br/orbe-360');
  if (hasLink) return content;

  const mentionsProduct = /orbe[\s-]?360/i.test(content);
  const mentionsBenefits =
    /telemedicina\s+human[oa]/i.test(content) ||
    /(assist[eê]ncia|cobertura|servi[cç]o)\s+funeral/i.test(content) ||
    /apoio\s+psicol[oó]gico/i.test(content);

  if (mentionsProduct) {
    console.log('[Nina][Orbe360][Sanitizer] case=A link_appended');
    return `${content.trim()}\n\nConfere aqui: ${ORBE_360_LINK}`;
  }
  if (mentionsBenefits) {
    console.log('[Nina][Orbe360][Sanitizer] case=B fallback_replaced');
    return ORBE_360_FALLBACK_RESPONSE;
  }
  return content;
}
```

Integração em `sanitizeAiResponse`:
```typescript
sanitized = sanitized.replace(/\n{3,}/g, '\n\n').trim();
sanitized = enforceOrbe360Link(sanitized); // nova linha
return sanitized || content;
```

Após edição, fazer deploy do `nina-orchestrator` e validar com logs em conversa real ou via `simulate-webhook`.

## Resultado esperado

- Nenhuma resposta da Orbi que mencione "Orbe 360", "telemedicina humana", "funeral" ou "apoio psicológico" sai sem o link `https://orbepet.com.br/orbe-360`.
- Cobertura ampliada: já não depende da detecção de intenção na mensagem do usuário — a verificação é feita também sobre o **conteúdo gerado pela LLM**.
- Compatível com o safety net atual (camadas redundantes, sem regressão).