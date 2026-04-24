## 🐛 Diagnóstico confirmado

Na conversa analisada (17:39-17:40):

| Hora | Evento | Categoria | Source |
|---|---|---|---|
| 17:39:43 | User: "Me explica o plus" | — | — |
| 17:40:17 | 🎬 Vídeo enviado | **orbita_galaxia** | ai_response ❌ |
| 17:40:19 | 🎬 Vídeo enviado | orbita_plus | user_message ✅ |
| 17:40:20 | Texto: "O Órbita Plus é o queridinho..." | — | — |

**Causa raiz**: A IA respondeu mencionando o Plus, mas no texto explicativo citou comparativamente o Galáxia (*"Diferente do Galáxia, o Plus não cobre castração..."*). O detector `queuePlanVideoIfMentioned` varre **tanto `userMessage` quanto `aiContent`** e marcou:
- `orbita_plus` (user_message) ✅
- `orbita_galaxia` (ai_response) ❌ — citação contextual, não pedido

Como o array `planMatchers` lista Galáxia em **primeiro lugar**, o Galáxia foi enfileirado primeiro e enviado antes do Plus.

## ✅ Correção proposta

### Regra: prioridade absoluta ao plano que o usuário pediu

Em `supabase/functions/nina-orchestrator/index.ts`, função `queuePlanVideoIfMentioned` (~linha 4193):

**1. Se houver QUALQUER plano detectado em `user_message`, ignorar TODAS as detecções de `ai_response`** (que são quase sempre citações comparativas, não o foco da pergunta).

```typescript
// Após o loop de detecção, antes de checar comparativo:
const hasUserPlanMention = mentioned.some(m => m.source === 'user_message');
if (hasUserPlanMention) {
  // Filtra fora qualquer plano detectado APENAS na resposta da IA
  const filtered = mentioned.filter(m => m.source === 'user_message');
  console.log(`[Nina] 🎬 Filtrando ${mentioned.length - filtered.length} plano(s) citado(s) só na resposta IA (priorizando pedido do user)`);
  mentioned.length = 0;
  mentioned.push(...filtered);
}
```

**2. Reordenar `planMatchers` por especificidade** (Plus primeiro, depois Total, depois Galáxia) — não resolve o bug em si, mas reduz risco quando AMBOS aparecem só na IA. Opcional.

**3. Refinar regex do Galáxia**: hoje `\bgalaxia\b` casa qualquer menção solta. Manter, mas a regra #1 já neutraliza falso-positivo no caso comum.

**4. Telemetria adicional**: gravar no metadata `video_skip_reason: 'ai_only_with_user_pick'` quando descartarmos vídeos por essa regra, para observabilidade futura.

## 🧪 Validação pós-deploy

1. Testar "Me explica o plus" em conversa nova → deve enviar **apenas** vídeo do Plus.
2. Testar "Qual a diferença entre Plus e Galáxia" → user_message contém ambos, então envia os dois (correto).
3. Testar "Me fala mais sobre os planos" (genérico) → IA cita planos, comportamento original mantém (envia o que IA citou, pois não há menção em user).
4. Testar "manda de novo" → resend funciona normal.

## 📋 Arquivos a editar

- `supabase/functions/nina-orchestrator/index.ts` (apenas a função `queuePlanVideoIfMentioned`, ~10 linhas)

## ⚠️ Sem mudanças em

- Schema, migrations, RLS, biblioteca de mídia (vínculo nome↔vídeo já está correto), prompt do agente.
