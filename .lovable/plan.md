## Problema

Print do WhatsApp: tutor diz que o pet "Loop" tem **11 anos**. A Orbi respondeu chamando de "pet sênior" e recomendou o plano **Órbita Galáxia** (R$ 138,32/mês). Isso é informação inventada — o catálogo oficial (`orbe_plans_catalog`) define `max_pet_age_years = 10` para **todos os 4 planos** (Essencial, Plus, Total, Galáxia). Pets com mais de 10 anos **não podem** contratar plano pet OrbePet.

A informação correta já está no prompt (`Idade máxima pet na contratação: 10 anos` por plano), mas a LLM ignorou em favor de fechar venda.

## Causa raiz

1. O prompt informa a idade máxima por plano, mas **não há regra hard explícita** dizendo "se idade > 10 → recusar venda de plano pet".
2. **Não existe guardrail determinístico** pós-resposta: se o pet tem 11+ anos e a IA recomenda um plano mesmo assim, nada bloqueia.
3. O fluxo de qualificação não trata `pet_age > 10` como um caminho dedicado (deveria seguir para Orbe 360, que é justamente o produto independente de pet).

## Plano de correção

### 1. Regra hard no system prompt (`buildEnhancedPrompt` em `nina-orchestrator/index.ts`)

Adicionar bloco no topo do catálogo de planos:

```
⛔ REGRA INEGOCIÁVEL — IDADE MÁXIMA
- Pets com mais de 10 anos NÃO PODEM contratar nenhum plano pet OrbePet
  (Essencial, Plus, Total ou Galáxia).
- NUNCA invente termos como "plano sênior", "cobertura especial idoso",
  "exceção para pet idoso". Não existe.
- Se o tutor informar idade > 10 anos:
   1. Reconheça com empatia ("entendo, ele já tem uma idade…")
   2. Explique honestamente que o limite de contratação é 10 anos
   3. Ofereça o Orbe 360 (telemedicina humana + funeral) para o tutor:
      https://orbepet.com.br/orbe-360
   4. NÃO recomende nenhum plano pet, NÃO cite preços de plano pet.
```

### 2. Detecção determinística de pet > 10 anos

Criar `detectOverAgePet(messages, clientMemory)` análogo ao `detectOrbe360Intent`:
- Lê últimas mensagens do tutor + `client_memory.pet_idade`.
- Regex: `/(\d{1,2})\s*(anos?|aninhos)/i` no contexto de pet, e leitura de `client_memory`.
- Retorna `true` se pet conhecido > 10 anos.

Quando `true`:
- Injeta no prompt um aviso reforçado para essa resposta específica:
  `⚠️ ATENÇÃO: este pet tem mais de 10 anos. Não pode contratar plano pet. Direcione para Orbe 360.`

### 3. Safety net pós-resposta (sanitizer)

No mesmo lugar onde já existe o safety net do Orbe 360 (linhas 3857 e 4049):

```ts
if (overAgePet && mentionsPetPlan(aiContent)) {
  console.warn('[Nina][AgeGuard] pet>10 + plan recommendation detected — substituindo por resposta segura');
  aiContent = OVER_AGE_FALLBACK_RESPONSE;
}
```

`mentionsPetPlan()`: regex pelos nomes dos 4 planos (`Essencial`, `Órbita Plus`, `Órbita Total`, `Órbita Galáxia`).

`OVER_AGE_FALLBACK_RESPONSE`: mensagem padrão honesta + link Orbe 360.

### 4. Logs e observabilidade

- Log `[Nina][AgeGuard] over_age_detected pet_age=X` quando detectar.
- Log `[Nina][AgeGuard][SafetyNet] replaced_response` quando o safety net disparar.
- Permite monitorar reincidência.

## Detalhes técnicos

**Arquivos:**
- `supabase/functions/nina-orchestrator/index.ts` — adicionar:
  - bloco de regra no `plansCatalogContent` (próximo da linha 3599)
  - função `detectOverAgePet()` (junto da `detectOrbe360Intent` ~linha 5207)
  - constante `OVER_AGE_FALLBACK_RESPONSE` (junto de `ORBE_360_FALLBACK_RESPONSE`)
  - chamada do safety net nos dois pontos de pós-processamento (~3854 e ~4043)

**Sem mudança de schema.** O `max_pet_age_years=10` já está no banco e é a fonte da verdade.

## Fora de escopo

- Não mudar preços nem coberturas dos planos.
- Não criar plano para pet sênior (não existe e não vai existir aqui).
- Não mexer em fluxos não relacionados (cobrança, agendamento, etc.).

## Resultado esperado

Tutor: "meu pet tem 11 anos"

Antes: Orbi inventa "plano para sênior" e recomenda Galáxia.

Depois: Orbi responde com empatia, explica o limite de 10 anos, e oferece o Orbe 360 com link. Mesmo se a LLM tentar recomendar um plano pet, o safety net substitui pela resposta segura.