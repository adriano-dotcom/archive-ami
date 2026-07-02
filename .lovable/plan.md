## Objetivo

Verificar, via **teste automatizado (simulação)**, que a Iris responde de forma **consistente** às perguntas de leads sobre a apólice do transportador **subcontratado (agregado)** — sempre deixando explícito que é modalidade de **compliance legal** e que **NÃO há cobertura efetiva** (sem indenização em sinistro). Nenhuma conversa real é criada no banco.

## Como funciona a verificação

Um script Deno standalone envia, direto ao Lovable AI Gateway, o **bloco de regras do subcontratado** (o mesmo texto já injetado no prompt) como `system`, e várias formulações de pergunta de lead como `user`. Depois valida cada resposta por palavras-chave obrigatórias.

Não altera o `nina-orchestrator`; apenas exercita o mesmo modelo/prompt de forma isolada e repetível.

### Arquivo novo: `supabase/functions/nina-orchestrator/subcontratado.test.ts`

- Carrega credenciais com `import "https://deno.land/std@0.224.0/dotenv/load.ts"` e lê `LOVABLE_API_KEY` do ambiente.
- Define o `SYSTEM_PROMPT` de teste contendo o bloco "⛔ REGRA INEGOCIÁVEL — APÓLICE DO TRANSPORTADOR SUBCONTRATADO (AGREGADO)" exatamente como está em `index.ts` (linhas ~3662–3679), mais uma instrução curta de persona (Iris, tira-dúvidas de seguro de cargas).
- Modelo: `google/gemini-3-flash-preview` (default atual do orquestrador em `getAISettings`).
- Bateria de perguntas (variações de fraseado):
  1. "Como funciona essa apólice pra quem é subcontratado?"
  2. "Sou agregado de uma transportadora, essa apólice cobre minha carga?"
  3. "Se der um sinistro trabalhando como subcontratado, eu recebo indenização?"
  4. "Preciso averbar os embarques sendo subcontratado?"
  5. "Comecei a pegar carga como contratado, e agora?"
- Para cada resposta, checa (case-insensitive) a presença dos conceitos-chave conforme a pergunta:
  - Perguntas 1–3: DEVE conter sinal de "sem cobertura efetiva / não há indenização" (ex.: `não` + `cobertura`/`indeniz`) e menção a "compliance"/"comprovação"/"obrigatoriedade legal".
  - Pergunta 4: DEVE indicar que subcontratado NÃO averba (responsabilidade do contratante).
  - Pergunta 5: DEVE orientar averbação obrigatória + migração/contato com a Jacometo.
- Consome o corpo de toda resposta (`await res.text()`/`res.json()`) para evitar leak.
- Imprime uma tabela PASS/FAIL por pergunta e falha o teste (`assert`) se qualquer resposta não trouxer o alerta essencial.
- Opcional: roda cada pergunta 2x para medir consistência (temperatura padrão), reportando taxa de acerto.

### Execução

```
cd supabase/functions/nina-orchestrator && deno test -A subcontratado.test.ts
```

(o `LOVABLE_API_KEY` já está disponível como secret do projeto).

## Resultado esperado

- Relatório PASS/FAIL por variação de pergunta.
- Se todas passarem: confirma que o prompt novo é seguido de forma consistente.
- Se alguma falhar: evidência concreta de que o prompt sozinho não garante consistência — nesse caso eu recomendo, num próximo passo, adicionar uma rede de segurança (sanitizer `enforceSubcontratadoWarning`) nos moldes de `enforceContractSiteLink`.

## Observação

O teste valida o comportamento do modelo com o texto do prompt, não a montagem completa do orquestrador. É a forma mais rápida e sem efeitos colaterais de medir consistência. Após aprovar, implemento o script e rodo a bateria, retornando os resultados.