# Iris segue os 4 passos do formulário oficial

A Iris passa a conduzir a conversa exatamente na mesma ordem e com os mesmos campos do checkout do site oficial, confirmando o que vem da consulta de CNPJ/RNTRC antes de gerar o link pré-preenchido.

O sócio/responsável legal é o campo "Responsável" + "CPF" do formulário — não haverá coleta separada de sócio nem campos novos no site.

## Sequência da conversa (espelhando o site)

Passo 1 — Empresa

1. CNPJ
2. Iris consulta e devolve razão social, RNTRC e situação para o lead confirmar
3. Endereço (logradouro, número, complemento, bairro, município, UF, CEP) — apresentado para confirmação; se a consulta não trouxer, ela pergunta

Passo 2 — Contato
4. Nome completo do responsável (sócio/responsável legal)
5. CPF do responsável
6. E-mail
7. Telefone / WhatsApp

Passo 3 — Pagamento  
8. Confirma o prêmio anual de R$ 911,66 (Pix) e pergunta: já possui algum desses seguros hoje? (sim/não) este passo vou deixar fixo no formulario ja preenchido para economizar perguntas 

Passo 4 — Conferência  
9. Iris  so eniva um resumo com todos os dados coletados para o lead validar manda so resumo dos dados coletado   
10. Envia o link pessoal com a proposta já preenchida; os três aceites (LGPD, declaração e autorização de emissão automatizada) e o "transmitir" continuam sendo feitos pelo próprio lead no site

Regras mantidas: uma pergunta por vez, sem emoji, nunca inventar dado, nunca marcar aceite pelo lead, link oficial sempre que o lead falar de preço, prazo ou interesse.

## Detalhes técnicos

- `supabase/functions/nina-orchestrator/index.ts`: reescrever o bloco de coleta da proposta como uma máquina de passos com a ordem acima; estender a extração para endereço (campos individuais) e confirmação explícita de razão social/RNTRC; adicionar a etapa de resumo antes do envio do link.
- `proposal_drafts`: gravar/atualizar o rascunho a cada campo confirmado (upsert por conversa) em vez de só no fim, para que o operador veja o progresso; `endereco` continua em jsonb com as chaves logradouro, numero, complemento, bairro, municipio, uf, cep.
- `proposal-prefill` já devolve esses campos; nenhuma mudança de contrato é necessária.
- Painel do lead no chat (`ContactProfilePanel`): mostrar qual passo está pendente e os campos já confirmados.
- Nenhuma alteração no projeto do site.