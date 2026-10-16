# Atendimento Jorge Pimentel (554784822122): análise e correção

## O que aconteceu (15 e 16/10)

1. **Classificação apressada.** Jorge disse: "só emito CT-e quando vou para o RS, por causa do posto fiscal". A Iris classificou como *contratado* sem perguntar nada. Era um caso para confirmar antes ("na maioria dos fretes, quem emite o CT-e?").
2. **Mensagem de encaminhamento enviada 3 vezes** (18:24, 20:06 e 08:22). A Iris diz "já deixei com um corretor", mas continua respondendo sozinha. Depois disso começa a inventar.
3. **A Iris inventou ações que não existem**, todas depois de dizer que o corretor ia assumir:
   - "Vou agilizar o envio da cotação para o seu e-mail agora mesmo" (nenhum e-mail foi enviado)
   - "Segue o arquivo com a proposta detalhada" (nenhum arquivo foi enviado)
   - "Acabei de reenviar o PDF agora mesmo" (não reenviou nada)
   - Inventou limite de R$ 200 mil e um produto "RCTR-C e RCF-DC para autônomo"
4. **Fez a mesma pergunta várias vezes:** pediu o CNPJ 2 vezes e o e-mail 3 vezes, embora já tivesse os dois.
5. **O follow-up automático das 08:05 mentiu e misturou duas mensagens:** "encaminhei a proposta de R$ 911,66 no seu e-mail" (falso, e esse preço é do produto do subcontratado) e, na mesma mensagem, "vou deixar por aqui pra não te incomodar".
6. O Leonardo só assumiu às 09:50, quando o lead já tinha mandado "Já enviei 3x".

## Causa principal (confirmada no código e no banco)

Quando a Iris passa um lead contratado para o corretor, ela tenta marcar a conversa com o status **"open"**. Esse status não existe no sistema: os únicos válidos são nina, human, paused e closed. Por isso a gravação falha sem aviso, e duas coisas se perdem:
- a conversa nunca sai da Iris;
- a marca de que o encaminhamento já foi feito também não fica salva. No banco, a conversa do Jorge não tem essa marca.

Resultado: a cada nova mensagem com CNPJ ou e-mail, a Iris repete o encaminhamento e continua conversando com o lead. Sem regras para essa situação, ela improvisa promessas de e-mail e PDF.

## Correções propostas

1. **Encaminhamento de contratado de verdade:** a conversa passa para o status "human" e a marca de "encaminhado" fica salva junto. A gravação passa a ser conferida, e qualquer erro aparece nos registros. A mensagem fixa sai uma única vez.
2. **A Iris para de responder depois do encaminhamento.** Se o lead escrever de novo, ela não chama a IA. No máximo manda uma vez: "O corretor já está com seu atendimento e vai te responder por aqui", e avisa a equipe.
3. **Proibir ações inventadas.** Nova regra fixa: a Iris nunca diz que enviou e-mail, PDF, arquivo ou cotação, porque ela não tem essa capacidade. Ela também nunca cria limites, valores ou produtos. Se a resposta da IA tiver frases como "enviei", "reenviei", "segue o arquivo" ou "anexo", essas frases são cortadas antes do envio.
4. **Não perguntar o que já sabe.** O CNPJ, o e-mail e a razão social já confirmados entram no texto que orienta a Iris como "já coletado, não perguntar de novo".
5. **Emissão de CT-e só às vezes = confirmar antes.** Frases como "só emito quando...", "às vezes emito" ou "emito só pro RS" não classificam o lead direto. A Iris faz uma pergunta de confirmação antes.
6. **Follow-up:** a mensagem automática não pode mais dizer que algo foi enviado nem citar R$ 911,66 para lead contratado. Ela também não junta a mensagem de última tentativa com outra. Conversas já entregues ao humano não recebem follow-up automático.
7. **Testes** para os itens 1, 3 e 5, usando frases reais do Jorge.

## Detalhes técnicos

- `nina-orchestrator/index.ts`, linhas 3979-3986: `status: 'open'` passa a ser `'human'` (o enum `conversation_status` não aceita `open`), e o `{ error }` é verificado. Logo no início do processamento, conferir `contratado_handoff_done` relendo `nina_context` direto do banco, sem confiar no objeto em memória.
- Guarda de saída em `queueTextResponse` ou antes dele: regex de "enviei/reenviei/segue (o|em) anexo/arquivo/PDF/acabei de enviar" remove a frase. Se a resposta ficar vazia, a mensagem não é enviada.
- `extractQualificationFromMessages`: padrão de emissão condicional ("só emito quando", "às vezes", "quando vou") resulta em `tipo_transportador` indefinido mais uma pergunta de confirmação.
- `process-followups`: pular conversas com `status='human'` ou `contratado_handoff_done`. `generate-followup-message`: proibir "enviei/encaminhei a proposta" e o preço para contratado, e não concatenar o texto de `last_chance` com outro tipo.
- A conversa do Jorge já está como `human` com o Leonardo, então não precisa de correção manual.
