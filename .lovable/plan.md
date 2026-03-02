

## Disparar segunda mensagem de teste via simulate-webhook

Para testar a qualificação em 2 etapas da Orbi, preciso executar a edge function `simulate-webhook` com o mesmo número de telefone e a mensagem "quero saber dos planos disponíveis".

### O que será feito:
1. Chamar `simulate-webhook` com `phone: "5511999887766"` e `message: "quero saber dos planos disponíveis"` (sem nome, para reusar o contato existente)
2. Aguardar o processamento pela nina-orchestrator
3. Verificar a resposta gerada na tabela `messages` para confirmar se a Orbi pediu **espécie e idade do pet** (Etapa 1 da qualificação)
4. Se necessário, disparar uma terceira mensagem respondendo com espécie/idade para validar a Etapa 2 (plano atual + preocupação)

