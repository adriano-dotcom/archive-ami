## Objetivo

Inserir no system prompt da Iris uma explicação clara e inegociável sobre **como funciona a apólice para o transportador subcontratado (agregado)** — destacando que é uma modalidade de **compliance legal** (comprovação de seguro perante a ANTT) e que **NÃO possui cobertura efetiva** nos ramos RCTR-C, RC-DC e RC-V, pois os embarques não são averbados. Também deve orientar a migração para o produto com averbação caso o transportador passe a atuar como **contratado** (responsável pela carga).

É apenas ajuste de prompt/comportamento no orquestrador — sem mudança de schema, UI ou lógica de negócio.

## Mudança em `supabase/functions/nina-orchestrator/index.ts`

Adicionar um novo bloco fixo logo após o bloco "⛔ REGRA DE CONTRATAÇÃO — CANAL ÚNICO" (após a linha ~3660), dentro de `plansCatalogContent`, para que faça parte da fonte única de verdade injetada no prompt:

```text
⛔ REGRA INEGOCIÁVEL — APÓLICE DO TRANSPORTADOR SUBCONTRATADO (AGREGADO)
Modalidade inédita no mercado, criada para o transportador que atua como SUBCONTRATADO (agregado) e precisa apenas cumprir a exigência legal de possuir seguro de transporte para operar com o RNTRC (ANTT).

Como funciona na prática:
- Como subcontratado, o transportador NÃO precisa averbar os embarques. A averbação e a cobertura da carga são responsabilidade do CONTRATANTE PRINCIPAL (transportador contratado) da operação.
- Esta apólice serve para COMPROVAR que o transportador possui o seguro obrigatório, funcionando como DOCUMENTO DE COMPLIANCE perante a ANTT — e NÃO como seguro ativo sobre a carga.
- Sem burocracia de averbação a cada viagem: mantém a regularidade legal de forma simples e direta.

⚠️ ATENÇÃO — INFORMAÇÃO ESSENCIAL (NUNCA OMITIR):
- Como os embarques NÃO são averbados, esta apólice NÃO possui cobertura efetiva nos ramos RCTR-C, RC-DC e RC-V.
- Em caso de sinistro, NÃO haverá indenização nesta modalidade. Ela existe EXCLUSIVAMENTE para atender à obrigatoriedade legal de comprovação de seguro.
- Sempre que explicar a modalidade subcontratado, deixe esse ponto EXPLÍCITO. Nunca dê a entender que há cobertura efetiva sobre a carga.

MIGRAÇÃO PARA CONTRATADO (responsável pela carga):
- Se o transportador for atuar como CONTRATADO (assumir a carga) e precisar de cobertura REAL e EFETIVA, é OBRIGATÓRIO averbar os embarques.
- Nesse caso, oriente-o a entrar em contato com a Jacometo Corretora e solicitar a MIGRAÇÃO para o produto COM averbação — somente assim as viagens ficam efetivamente protegidas.
```

## Resultado esperado

- A Iris passa a explicar corretamente a apólice do subcontratado como documento de compliance, sem cobertura efetiva.
- Sempre reforça o alerta de que não há indenização nessa modalidade.
- Orienta a migração para o produto com averbação quando o transportador atua como contratado.

Após aplicar, farei o redeploy da função `nina-orchestrator`.