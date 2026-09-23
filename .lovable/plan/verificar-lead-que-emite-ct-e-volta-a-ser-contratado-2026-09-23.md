# Verificar: lead que emite CT-e volta a ser "contratado"

## Objetivo

Percorrer uma conversa real (histórico já existente no sistema) de um lead que emite CT-e e comprovar, passo a passo, que o perfil é classificado como **contratado** e que uma correção posterior ("agora eu emito o CT-e") destrava o rótulo — sem lock permanente em "subcontratado".

Nenhuma mensagem será enviada a nenhum lead. Nenhuma alteração de dados.

## Como vou verificar

### 1. Escolher a conversa real
Buscar no histórico uma conversa em que o lead afirma que emite CT-e (inclusive as frases que causavam o erro: "Não, eu EMITO o CT-e", "não tenho sistema, mas emito meu CT-e"). Se não houver uma com a frase exata, uso a conversa mais próxima e complemento com as frases reais reportadas no problema.

### 2. Rodar a conversa pelo classificador
Reproduzir a sequência de mensagens do lead, na ordem, pelas mesmas funções que o atendimento usa hoje, e registrar o perfil resultante a cada mensagem.

### 3. Testar o destravamento
Partindo de uma conversa já marcada como "subcontratado", aplicar a correção explícita do lead ("agora eu emito o meu CT-e") e confirmar que o perfil muda para "contratado".

### 4. Confirmar que a proteção continua valendo
Checar que menções soltas que não são correção (ex.: falar do seguro do caminhão, foto de documento) **não** trocam o perfil — a trava só abre para afirmação explícita de emissão.

### 5. Relatório
Tabela com: mensagem do lead → perfil antes → perfil depois → passou/falhou. Se algum caso falhar, aponto a linha responsável e proponho a correção em seguida (sem aplicar nada sem sua aprovação).

## Detalhes técnicos

- Leitura das tabelas `conversations`, `messages` e `contacts` apenas para SELECT.
- Execução das funções `extractQualificationFromMessages` (index.ts ~L1578-1596) e da lógica de merge com a trava de `subcontratado` (~L3787-3815) em um script de verificação isolado, sem chamar o modelo de IA, sem escrever no banco e sem disparar envio de WhatsApp.
- O script de verificação fica em `supabase/functions/nina-orchestrator/` como teste (`cte-classificacao.test.ts`), no mesmo padrão do `subcontratado.test.ts` já existente, para poder ser reexecutado depois.
- Nenhuma migração, nenhum redeploy, nenhuma mudança no prompt nesta etapa.
