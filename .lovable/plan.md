

## Plano: Dividir perguntas de qualificação em 2 mensagens e encurtar respostas

### Problema
A Orbi envia todas as 4 perguntas de qualificação numa única mensagem longa, o que fica pesado no WhatsApp.

### Solução
Atualizar o **system prompt** (tanto em `nina_settings.system_prompt_override` quanto em `agents.system_prompt`) para instruir a Orbi a:

1. **Dividir a qualificação em 2 etapas:**
   - **Mensagem 1:** Nome do pet + espécie (cão/gato) + idade
   - **Mensagem 2:** Já tem plano? + O que mais preocupa na saúde?

2. **Respostas mais curtas:** Adicionar regra explícita de max 2-3 linhas por mensagem no WhatsApp, sem listas numeradas longas.

### Mudanças

**1. SQL Migration** — Atualizar a seção "QUALIFICAÇÃO" do prompt em ambas as tabelas:
- Substituir o bloco `### 2. QUALIFICAÇÃO` por instrução de 2 etapas
- Reforçar regra de mensagens curtas no bloco `TOM E ESTILO`

Trecho do prompt que será atualizado:
```
### 2. QUALIFICAÇÃO
Após saber o nome do pet, divida em DUAS mensagens separadas (nunca todas as perguntas de uma vez):

**Primeira mensagem:** Pergunte espécie (cão ou gato) e idade aproximada.
Exemplo: "O [nome] é um cão ou gatinho? E quantos anos ele tem? 🐾"

**Segunda mensagem (após resposta):** Pergunte sobre plano atual e principal preocupação.
Exemplo: "Você já tem algum plano de saúde pro [nome]? E o que mais te preocupa: consultas do dia a dia ou coisas como cirurgias?"
```

E no bloco TOM E ESTILO:
```
- Máximo 2-3 linhas por mensagem
- NUNCA envie listas numeradas com mais de 2 itens numa mesma mensagem
- Prefira perguntas naturais em texto corrido, não em formato de lista
```

**2. Nenhuma mudança de código** — O `message_breaking_enabled` + `breakMessageIntoChunks` já cuida de separar mensagens por `\n\n`. O prompt é o que controla o comportamento.

### Nota técnica
A função `breakMessageIntoChunks` já existe e separa por `\n\n`, então se a IA gerar parágrafos separados eles já vão como mensagens distintas no WhatsApp. O foco é puramente no prompt.

