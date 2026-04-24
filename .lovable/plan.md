## Diagnóstico

A função `queueTextResponse` em `supabase/functions/nina-orchestrator/index.ts` (linhas 4326-4385) já tem uma checagem de duplicação, mas é **frágil**:

```ts
// Atual (linha 4351)
return normalizedExisting === normalizedNewContent || 
       (normalizedExisting.length > 20 && normalizedNewContent.includes(normalizedExisting.substring(0, 50)));
```

Problemas:
1. Só pega match exato OU se a nova mensagem **contém** os primeiros 50 chars da anterior (caso raro).
2. Não detecta paráfrases ("Posso te ajudar?" vs "Como posso ajudar?").
3. Janela de 5 minutos é muito curta para loops de follow-up que ocorrem em horas.
4. Quando bloqueia, simplesmente **descarta** a resposta (cliente fica sem resposta nenhuma).

## Solução: Anti-Loop em 3 camadas

### Camada 1 — Detecção robusta de equivalência

Criar uma nova função utilitária `isSemanticallyDuplicate(candidate, recentMessages, threshold = 0.85)` que combina:

- **Normalização forte**: lowercase, remove pontuação, emojis, espaços extras, expansões comuns ("vc"→"você", "tb"→"também").
- **Similaridade Jaccard** (sobreposição de palavras únicas): rápido, pega paráfrases curtas.
- **Similaridade de trigrams** (sequências de 3 caracteres): pega reordenação de palavras.
- **Similaridade de prefixo/sufixo**: detecta variações tipo "Oi Maria, posso te ajudar?" vs "Oi Maria, como posso te ajudar?".
- **Score combinado**: `max(jaccard, trigram) * 0.7 + prefixSim * 0.3`. Bloqueia se ≥ 0.85.

```ts
function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^\w\s]/g, ' ')                          // remove pontuação/emojis
    .replace(/\b(vc|voce)\b/g, 'você')
    .replace(/\b(tb|tbm)\b/g, 'também')
    .replace(/\s+/g, ' ')
    .trim();
}

function jaccardSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.split(' ').filter(w => w.length > 2));
  const wordsB = new Set(b.split(' ').filter(w => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return intersection / union;
}

function trigramSimilarity(a: string, b: string): number {
  const trigrams = (s: string) => {
    const set = new Set<string>();
    for (let i = 0; i <= s.length - 3; i++) set.add(s.substring(i, i + 3));
    return set;
  };
  const tA = trigrams(a), tB = trigrams(b);
  if (tA.size === 0 || tB.size === 0) return 0;
  const intersection = [...tA].filter(t => tB.has(t)).length;
  return intersection / Math.max(tA.size, tB.size);
}

function similarityScore(candidate: string, existing: string): number {
  const a = normalizeForComparison(candidate);
  const b = normalizeForComparison(existing);
  if (!a || !b) return 0;
  if (a === b) return 1;
  
  const jac = jaccardSimilarity(a, b);
  const tri = trigramSimilarity(a, b);
  const lexical = Math.max(jac, tri);
  
  // Prefixo: primeiras 40 chars iguais é forte sinal de loop
  const prefixLen = Math.min(40, a.length, b.length);
  const prefixSim = a.substring(0, prefixLen) === b.substring(0, prefixLen) ? 1 : 0;
  
  return lexical * 0.7 + prefixSim * 0.3;
}
```

### Camada 2 — Janela ampliada e regeneração inteligente

Em `queueTextResponse`, substituir a checagem atual por:

1. Buscar **últimas 5 mensagens da Orbi** (não 5 minutos — usar últimas 5 mensagens independente do tempo, mais relevante para loop conversacional).
2. Calcular score contra cada uma; se **qualquer score ≥ 0.85** → marcar como loop.
3. Quando detectar loop:
   - Logar `[Nina][AntiLoop] 🔁 Bloqueado: score=0.92 vs msg "..."`.
   - **Tentar regenerar UMA vez**: chamar a IA novamente com system prompt anti-loop reforçado:
     ```
     ⛔ A resposta anterior que você gerou era TÃO PARECIDA com sua última mensagem que foi bloqueada.
     Você ESTÁ EM LOOP. Última mensagem enviada: "{lastMsg}"
     Gere agora algo COMPLETAMENTE DIFERENTE: outra estrutura, outro CTA, outro ângulo.
     Se já fez a pergunta, AVANCE para o próximo passo (apresentar plano, marcar contato, fechar).
     ```
   - Se a regeneração também falhar no mesmo limiar → usar **fallback variado** baseado no estágio do funil:
     - Sem resposta há tempo → mensagem de "estou por aqui se precisar"
     - Lead já qualificado → "quer que eu te mande o link para fechar?"
     - Lead em dúvida → "alguma dúvida específica sobre os planos posso esclarecer?"
   - Persistir contador de loops em `nina_context.consecutive_loops`. Se ≥ 3, marcar conversa para handoff humano.

### Camada 3 — Telemetria

Adicionar tabela leve de logs para análise posterior (opcional mas recomendado):

```sql
-- Já temos a tabela 'messages' com metadata jsonb; basta gravar no metadata da mensagem enviada:
metadata: {
  anti_loop_score: 0.62,        // score máximo contra histórico
  anti_loop_regenerated: false, // se precisou regenerar
  anti_loop_fallback_used: false
}
```

Sem migration necessária — usa o campo `metadata` que já existe em `send_queue`.

## Mudanças no código

### Arquivo único: `supabase/functions/nina-orchestrator/index.ts`

1. **Adicionar funções utilitárias** (próximo a `sanitizeAiResponse`, ~linha 4843):
   - `normalizeForComparison`
   - `jaccardSimilarity`
   - `trigramSimilarity`
   - `similarityScore`
   - `findHighestSimilarity(candidate, history) → { maxScore, mostSimilarMsg }`
   - `getAntiLoopFallback(stage, contactName)` — retorna mensagem variada por estágio

2. **Refatorar `queueTextResponse`** (linhas 4326-4385):
   - Buscar últimas 5 mensagens `from_type IN ('nina','human')` ordenadas por `sent_at DESC` (sem filtro de 5min — usa só as 5 últimas).
   - Trocar lógica `isDuplicate` por chamada a `findHighestSimilarity`.
   - Se score ≥ 0.85: tentar regenerar 1x via nova função `regenerateWithAntiLoop(supabase, conversation, message, originalContent, lastSimilar, settings, aiSettings, agent)`.
   - Se falhar de novo: usar `getAntiLoopFallback`.
   - Anexar `anti_loop_score` ao metadata do `send_queue.insert`.

3. **Nova função `regenerateWithAntiLoop`** (~linha 4385, antes do return):
   - Chama Lovable AI Gateway com `temperature: 0.95` (alta variabilidade) e instrução explícita de quebrar o loop.
   - `max_tokens: 600` (resposta curta basta).
   - Retorna o novo conteúdo OU `null` se ainda for similar.

4. **Atualizar contador no `nina_context`**:
   - Quando bloqueia + regenera com sucesso: zera `consecutive_loops`.
   - Quando precisa usar fallback: incrementa `consecutive_loops`.
   - Se `consecutive_loops >= 3`: marca `requires_human_handoff = true` no nina_context (a UI já lê esse flag).

### Constantes

```ts
const ANTI_LOOP_THRESHOLD = 0.85;        // bloqueio
const ANTI_LOOP_HISTORY_SIZE = 5;        // últimas N mensagens da Orbi
const ANTI_LOOP_MAX_REGENERATIONS = 1;   // tentativas extras
const ANTI_LOOP_HANDOFF_AT = 3;          // loops consecutivos antes de handoff
```

## Validação após deploy

Testar no chat enviando 3x a mesma pergunta ("e o plano galaxia?") e confirmar nos logs:
- 1ª resposta: passa normal, score baixo
- 2ª resposta: score médio (0.4-0.7), passa
- 3ª resposta: score alto, log `[Nina][AntiLoop] 🔁 Regenerando` + nova resposta diferente
- 4ª se ainda em loop: fallback contextual + log `[Nina][AntiLoop] 🆘 Fallback acionado`

## Não muda

- Lógica de chunking de mensagens (`breakMessageIntoChunks`)
- Sanitização de resposta (`sanitizeAiResponse`)
- Roteamento adaptativo de modelos (`getAdaptiveSettings`)
- Anti-repetição via prompt (linhas 4729-4748) — continua como reforço preventivo
- Schema do banco — usa apenas campos `metadata` e `nina_context` já existentes

## Arquivos editados

- `supabase/functions/nina-orchestrator/index.ts` (1 refatoração + 6 funções novas)
