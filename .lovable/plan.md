# Verificar resposta da Iris para lead "Olá!" + pergunta

## Objetivo
Confirmar, no fluxo ao vivo, que quando um lead do site inicia a conversa com
*"Olá! Vim pelo site e tenho dúvidas sobre os 3 seguros obrigatórios do transportador."*
a Iris **responde a pergunta com a IA** (coberturas RCTR-C / RC-DC / RC-V, pacote único),
e **não** devolve apenas o `greeting_message` fixo.

## O que já foi confirmado na análise de código
- `isPureGreeting()` (linha ~859) remove saudações e, se sobrar texto (a pergunta), retorna `false`.
- A condição do greeting fixo (linha ~3522) só dispara quando
  `isFirstInteraction && agent?.greeting_message && isPureGreeting(message.content)`.
- Para a frase-teste, `isPureGreeting` retorna `false` → o caminho de IA é usado. Lógica correta.

## Passos da verificação (ao vivo, sem tocar em WhatsApp real)
1. Disparar a mensagem-teste pelo pipeline usando a Edge Function `simulate-webhook`
   (injeta a mensagem como se viesse do site/WhatsApp) com um telefone de teste
   dedicado, em uma conversa nova (primeira interação).
2. Aguardar o processamento do `nina-orchestrator`.
3. Inspecionar o resultado sem enviar nada real:
   - Ler os logs do `nina-orchestrator` e confirmar que **não** aparece
     `First interaction - using greeting_message`.
   - Ler `send_queue` / `messages` da conversa de teste e confirmar que a resposta
     enfileirada é uma resposta de IA sobre os 3 seguros (RCTR-C, RC-DC, RC-V),
     e não o texto de saudação fixo.
4. Repetir com um caso de controle: mensagem só de saudação ("Olá, bom dia")
   deve gerar o `greeting_message` fixo — garantindo que não quebramos o comportamento esperado.
5. Registrar o veredito (passou / falhou) com evidência dos logs e da fila.

## Observações
- É uma verificação: nenhuma alteração de código é prevista, a menos que o teste
  revele uma falha, caso em que proponho o ajuste em um novo plano.
- O teste usa `simulate-webhook` para não enviar mensagens a números reais.

## Confirmação necessária
- Posso usar `simulate-webhook` com um telefone de teste para rodar essa verificação ao vivo?
  Se preferir, indique um número/telefone específico para o teste.
