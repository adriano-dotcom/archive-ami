# 🎯 Plano: Adicionar Orbe 360 ao repertório da Orbi

## Contexto
A Orbi hoje **não conhece o Orbe 360**. Quando o lead diz "não tenho pet, posso contratar pra mim?", ela responde apenas que a OrbePet é exclusiva para cães e gatos — perdendo a venda do produto que cobre justamente o tutor (telemedicina humana 24h + assistência funeral com apoio psicológico).

Decisões confirmadas pelo usuário:
- **Quando ofertar:** lead sem pet, cross-sell pós-venda pet, gatilhos de telemedicina/funeral, e em qualquer oportunidade natural.
- **Modelo:** pode ser contratado **isoladamente** (não exige plano pet ativo).

## Implementação

### 1. Cadastrar Orbe 360 em `product_knowledge` (INSERT)
Inserir registro com `name = 'Orbe 360'`, `is_active = true`, `extraction_status = 'completed'`, `summary` e `full_content` estruturados:
- O que é (adicional/avulso de telemedicina humana + funeral)
- Benefícios principais (telemedicina humana 24h, cobertura funeral completa, assessoria 24h, apoio psicológico para a família)
- Quem pode contratar (qualquer tutor, com ou sem pet — isolado ou complementar)
- Link oficial: `https://orbepet.com.br/orbe-360`

### 2. Adicionar bloco "PRODUTO COMPLEMENTAR — ORBE 360" no prompt
Em `supabase/functions/nina-orchestrator/index.ts`, função `buildContext` (~linha 4820), inserir nova seção logo após "CONHECIMENTO ESPECIALIZADO - PLANOS DE SAÚDE PET":

```
## PRODUTO COMPLEMENTAR — ORBE 360 (proteção do tutor e família)

O Orbe 360 é um produto OrbePet voltado ao **tutor e família**, com:
- 🩺 Telemedicina humana completa 24h
- ⚱️ Cobertura funeral completa, com assessoria 24h e apoio psicológico

### Pode ser contratado:
- **De forma isolada** (lead sem pet) — alternativa quando o cliente quer proteção pra si mesmo
- **Como complemento** a qualquer plano pet (cross-sell)

### QUANDO OFERTAR (gatilhos):
1. Lead diz que NÃO TEM PET mas demonstra interesse em proteção/saúde → ofereça Orbe 360 ao invés de encerrar
2. Lead JÁ FECHOU OU ESTÁ FECHANDO um plano pet → ofereça como complemento natural ("aproveita e protege você também")
3. Lead menciona "telemedicina", "consulta médica humana", "funeral", "luto", "família" → apresente Orbe 360
4. Em qualquer momento natural da conversa quando fizer sentido

### COMO OFERTAR:
- Texto CURTO (2 linhas), sem listas longas
- Foque em 2 benefícios: telemedicina humana 24h + cobertura funeral
- Sempre envie o link: https://orbepet.com.br/orbe-360
- Se o lead recusar, NÃO insista (regra anti-repetição: máximo 1 oferta por conversa)

### EXEMPLO de oferta para lead sem pet:
"Mesmo sem pet eu tenho algo pra você! O Orbe 360 cobre telemedicina humana 24h e assistência funeral completa pra você e sua família. Confere aqui: https://orbepet.com.br/orbe-360"
```

### 3. Atualizar bloco "REGRAS GERAIS" (linha ~4810)
Adicionar:
> "Quando o lead disser que **não tem pet**, NÃO encerre a conversa — ofereça o **Orbe 360** (telemedicina humana + funeral) como alternativa contratável isoladamente."

### 4. Redeploy
Redeploy da edge function `nina-orchestrator`.

### 5. Memória
Criar `mem://features/agent/orbe-360-upsell` com a regra de gatilhos e modelo de contratação isolada.

## Validação pós-deploy
1. **"Não tenho pet, posso contratar pra mim?"** → resposta deve mencionar Orbe 360 + link, sem encerrar.
2. **"Quero o Plus"** → fluxo Plus normal; cross-sell Orbe 360 só após o fechamento (não atrapalha qualificação).
3. **"Tem cobertura funeral?"** → apresenta Orbe 360 com link.
4. **"Não quero o 360"** → não reoferece.

## Sem mudanças em
- `orbe_plans_catalog` (Orbe 360 é adicional, não plano pet — não entra no comparativo de cobertura veterinária).
- Lógica de vídeos (`queuePlanVideoIfMentioned`) — Orbe 360 não tem vídeo associado por enquanto.
- RLS, schema, frontend.

## Arquivos
- `supabase/functions/nina-orchestrator/index.ts` (~30 linhas adicionadas)
- INSERT em `product_knowledge`
- `mem://features/agent/orbe-360-upsell`
