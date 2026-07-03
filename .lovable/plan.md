# Iris nunca dispensa leads de outros seguros

## Problema
Hoje a Iris dispensa quem procura um seguro diferente do de carga (ex.: van de passageiros) e manda "procurar outra corretora especializada" — como visto na conversa com a Regieli. Isso perde leads.

## Objetivo
Para QUALQUER lead que busque outro tipo de seguro (não seja o pacote de carga), a Iris deve:
1. **Nunca** dispensar nem mandar procurar outra corretora — a Jacometo trabalha com **todos os tipos de seguro**.
2. Coletar os dados do seguro que a pessoa precisa (qual seguro/objetivo).
3. Coletar os dados de contato (nome, telefone/e-mail).
4. Descobrir se é **Pessoa Física ou Jurídica** — se **PJ, pedir o CNPJ**.
5. Informar que **vamos repassar ao responsável** que fará o atendimento.

## O que muda (técnico)
Todo o comportamento vem do prompt montado em `supabase/functions/nina-orchestrator/index.ts` (função `buildEnhancedPrompt`). A base do agente no banco é curta; as instruções efetivas estão no código.

### 1. Remover a instrução de dispensa
Na seção "ORIENTAÇÕES DE ATENDIMENTO" (linha ~4967), trocar:
```
- Se o contato NÃO for transportador / não tiver RNTRC, explique educadamente que o produto é para empresas de transporte de carga registradas na ANTT.
```
por uma orientação que **não dispensa**: se não for transportador de carga / buscar outro seguro, seguir o novo protocolo abaixo (nunca mandar procurar outra corretora).

### 2. Adicionar nova seção de captação de outros seguros
Injetar no `contextInfo` um bloco novo, por exemplo:

```
## 🟩 OUTROS SEGUROS (FORA DO PACOTE DE CARGA) — NUNCA DISPENSE
A Jacometo trabalha com TODOS os tipos de seguro (auto, vida, empresarial,
passageiros, residencial, saúde, etc.). Se o lead buscar um seguro diferente
do pacote obrigatório de carga:
- NUNCA diga para procurar outra corretora nem que "não se aplica ao seu caso".
- Acolha e colete, de forma natural (uma pergunta por vez):
  1. Qual seguro/necessidade (o que quer proteger).
  2. Nome e melhor contato (telefone/e-mail).
  3. Se é Pessoa Física ou Jurídica — se PJ, pedir o CNPJ.
- Ao ter os dados, informe que vai repassar ao RESPONSÁVEL da Jacometo,
  que fará o atendimento especializado. Ex.: "Perfeito! Já vou repassar seus
  dados ao nosso responsável, que fala com você em breve."
- Depois disso, acione o handoff para atendimento humano.
```

### 3. Ajuste do modelo de primeira resposta do site
O "MODELO DE PRIMEIRA RESPOSTA — LEAD DO SITE" (linha ~4977) assume sempre seguro de carga. Adicionar uma ressalva: se o lead deixar claro que quer outro seguro, seguir o protocolo de "OUTROS SEGUROS" em vez do modelo de carga.

## Observações
- Não altera o produto oficial de carga (segue fonte única, R$ 644,28/mês) — apenas deixa de dispensar leads de outros ramos.
- Os dados coletados ficam registrados na conversa e o lead é encaminhado via handoff humano já existente.
- Mudança concentrada em `nina-orchestrator/index.ts` (prompt). Nenhuma mudança de schema.

## Verificação
Após aplicar: simular um lead como o da Regieli ("empresa de van de passageiros") e confirmar que a Iris coleta seguro desejado + contato + PF/PJ (CNPJ se PJ) e diz que vai repassar ao responsável, sem mandar procurar outra corretora.