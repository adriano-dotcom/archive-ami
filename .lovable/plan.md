# Triagem contratado × subcontratado no início do atendimento

Hoje a Iris (nina-orchestrator) já tem os dois caminhos, mas a primeira mensagem — só para leads do site — já abre apresentando o produto do subcontratado e deixa a pergunta de direção para o fim. Além disso, o gatilho "contratado" faz handoff imediato, sem coletar dados. Vamos inverter e padronizar.

## Comportamento novo (conforme respostas)

**1. Abertura = só a pergunta de triagem (todos os leads novos)**
Na PRIMEIRA mensagem de qualquer lead (site ou WhatsApp direto), a Iris cumprimenta curto e faz apenas UMA pergunta, sem pitch de produto:

> "Olá! Aqui é da Jacometo Corretora 🚛 Pra te direcionar certo: você atua como **contratado** (responsável pela carga, emite o próprio CT-e) ou como **subcontratado/agregado** de outra transportadora?"

Exceção mantida: se o lead já disser que quer OUTRO seguro (van, auto, vida etc.), segue o protocolo "Outros Seguros" (acolher + coletar + repassar, nunca dispensar).

**2. Se SUBCONTRATADO → fluxo de compliance (já existente)**
Depois da resposta, a Iris apresenta a apólice de compliance (o conteúdo que hoje está na abertura), com os avisos obrigatórios (sem averbação, sem cobertura RCTR-C/RC-DC/RC-V, sem indenização) e segue a qualificação: CNPJ → confirmar empresa/RNTRC → e-mail → confirmar celular → envia o link `https://transporte.jacometoseguros.com.br` e registra o lead (`lead_status='proposal'`, dispara replicação para o CRM). Sem mudança de destino, só deixa de ser a abertura.

**3. Se CONTRATADO → coletar dados e depois encaminhar (mudança principal)**
Em vez do handoff imediato, a Iris explica em 1 frase que ele precisa do produto COM cobertura/averbação e coleta CNPJ → e-mail → confirma celular. Só quando os 3 dados estiverem completos, envia a mensagem de encaminhamento, marca o lead para o corretor humano e dispara a replicação para o CRM (mesmo pipeline do subcontratado). Enquanto faltar dado, continua perguntando um por vez.

## Detalhes técnicos

Arquivo único: `supabase/functions/nina-orchestrator/index.ts` (sem mudança de schema — usa `nina_context`, `contacts.lead_status` e os triggers existentes).

1. **Abertura de triagem (substitui o bloco ~5063–5100):** trocar a condição `isSiteLead && isFirstContact` por apenas `isFirstContact`. Substituir o modelo que apresenta o produto do subcontratado por um modelo curto de triagem (só cumprimento + pergunta contratado × subcontratado), preservando a exceção "Outros Seguros" e a personalização por nome.

2. **Pitch do subcontratado movido para pós-resposta:** injetar o conteúdo atual da apólice de compliance (avisos obrigatórios) num bloco condicional que só entra quando `mergedQA.tipo_transportador === 'subcontratado'`, para a Iris apresentar o produto depois que o lead se identifica.

3. **Fluxo de qualificação no prompt (~3752–3763):** reescrever para o tipo ser a PERGUNTA 0 (triagem). Depois, ramificar: subcontratado segue CNPJ→e-mail→celular→link; contratado segue CNPJ→e-mail→celular→encaminhamento humano.

4. **Branch CONTRATADO (~3515–3541):** deixar de fazer handoff imediato. Adicionar `isContratadoDataComplete(contact)` (CNPJ + e-mail + celular). Se incompleto, não dispara handoff — deixa a IA continuar coletando (com instrução no prompt). Quando completo e `!contratado_handoff_done`: enviar mensagem de encaminhamento, `update contacts set lead_status='proposal'` (dispara `notify_lead_proposal` → `replicate-lead-to-crm`), marcar `contratado_handoff_done` e `is_active=false`, e acionar o `whatsapp-sender`.

5. **Deploy** da função `nina-orchestrator` e teste rápido simulando: (a) primeira mensagem → recebe só a pergunta de triagem; (b) "sou contratado" → coleta CNPJ/e-mail/celular e só então encaminha; (c) "sou subcontratado" → apresenta produto e segue até o link.
