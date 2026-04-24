# Melhorias no Gatilho de Vídeo de Planos

## Arquivo único editado
`supabase/functions/nina-orchestrator/index.ts` — função `queuePlanVideoIfMentioned` e prompt do agente.

## Mudanças

### 1. Detecção dupla (input do cliente + resposta da IA)
Hoje só escaneia `aiContent`. Passar a escanear também `userMessage` para que mesmo respostas genéricas da Orbi disparem o vídeo quando o cliente pergunta explicitamente sobre um plano.

```ts
const detectionText = `${userMessage || ''}\n${aiContent || ''}`.toLowerCase();
```

### 2. Padrões mais permissivos + intenções semânticas
Além de "Órbita Plus/Total/Galáxia", reconhecer:
- `\bplus\b`, `\btotal\b`, `\bgal[áa]xia\b` isolados
- "plano intermediário" / "plano do meio" → `orbita_plus`
- "plano mais completo" / "top de linha" → `orbita_galaxia`
- "plano mais barato" / "básico" / "entrada" → `orbita_total`

Mapeamento por regex → categoria do `media_library`.

### 3. Cooldown reduzido + bypass para reenvio
- Reduzir cooldown padrão de **2h → 30min**.
- Detectar pedido explícito de reenvio (`/manda(r)?\s+(de\s+novo|novamente|outra\s+vez)/i`) → cooldown = 0.

### 4. Comparativo automático (5ª melhoria)
Quando detectar perguntas como "qual a diferença entre os planos", "comparar planos", "qual escolher" → buscar vídeo da categoria `comparativo` na `media_library` e enviar com prioridade 2.

### 5. Reforço no system prompt
Acrescentar instrução à Orbi para sempre citar o nome completo do plano ("Órbita Plus", não só "o intermediário"), garantindo consistência mesmo sem a Camada 1.

### 6. Telemetria
Adicionar ao `metadata` da `send_queue`:
```ts
{
  video_trigger_source: 'user_message' | 'ai_response' | 'comparison_intent',
  video_skip_reason: 'cooldown' | 'no_media' | null,
  video_category_matched: 'orbita_plus' | ...
}
```

## Constantes novas
```ts
const VIDEO_COOLDOWN_MS = 30 * 60 * 1000; // 30min
const RESEND_REGEX = /manda(r)?\s+(de\s+novo|novamente|outra\s+vez)/i;
const COMPARISON_REGEX = /(diferen[çc]a|comparar|comparativo|qual\s+(escolher|melhor)|entre\s+os\s+planos)/i;
```

## Não muda
- Schema do banco
- Estrutura `media_library` (já tem categorias certas)
- Prioridade/scheduled_at do envio
- Anti-loop, critic pass, roteamento adaptativo (mantidos)

## Validação pós-deploy
Logs esperados:
- Cliente pergunta "me explica o plus" → `[Nina][Video] ✅ Detectado em user_message: orbita_plus`
- Cliente pede "manda de novo o vídeo do total" → bypass cooldown + envio
- Cliente pergunta "qual a diferença entre os planos" → envio de vídeo `comparativo`
