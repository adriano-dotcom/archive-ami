# Fazer o link `?proposta=` abrir o formulário preenchido

## Diagnóstico confirmado

Abri `https://rctr-c.rc-dc.rc-v.jacometo.com.br/?proposta=19d4c9846fceb58b363cb17ceb068565` e o site carrega a landing normal, sem nenhum dado do Paulo. O site simplesmente ignora o parâmetro `proposta` — ele nunca foi programado para lê-lo. A proposta existe e está correta do lado do CRM.

## O que já está pronto (neste projeto)

- Rascunho do Paulo/LSLOG salvo com CNPJ, razão social, RNTRC, endereço, responsável, CPF, e-mail e telefone.
- Endpoint público de consulta funcionando: `GET .../functions/v1/proposal-prefill?token=<32 hex>`, que devolve todos esses campos em JSON, com validação de token, expiração, limite de tentativas por IP e marcação de "aberto".

## O que falta (no projeto do site)

O ajuste tem que ser feito no projeto **"Projeto 3 Seguros Obrigatorio"** (a landing page). Escopo lá:

1. Ao carregar a página, ler `?proposta=<token>` da URL.
2. Chamar `proposal-prefill` com esse token no backend do CRM.
3. Preencher automaticamente o formulário de contratação com o que voltar: CNPJ, razão social, RNTRC, endereço completo, responsável, CPF, e-mail, telefone e "sem seguro vigente".
4. Rolar direto para a etapa de conferência, deixando o lead apenas revisar, aceitar e transmitir.
5. Tratar os casos de erro do endpoint com mensagem clara e o formulário em branco: token inválido, link expirado, proposta já transmitida.
6. Manter o comportamento atual quando não houver `?proposta=` na URL.

## Detalhes técnicos

- O site precisa apontar para o backend deste CRM (URL do projeto + chave publicável) para chamar `proposal-prefill`; o endpoint já responde CORS `*` e não exige login.
- Formato do retorno: `{ cnpj, razao_social, rntrc, rntrc_situacao, endereco: { logradouro, numero, bairro, municipio, uf, cep }, responsavel, cpf, email, telefone, seguro_vigente }`.
- Códigos de erro: 400 token inválido, 404 não encontrada, 410 expirada, 409 já transmitida, 429 excesso de requisições.
- Opcional (segunda etapa): ao transmitir, o site chamar um endpoint para marcar o rascunho como `transmitted`, para o CRM refletir a conclusão no painel do lead.

## Como executar

Preciso abrir o projeto da landing page para fazer essa alteração — o código do site não está neste projeto. Ao aprovar, eu troco para "Projeto 3 Seguros Obrigatorio" e implemento o item acima; depois testamos com o próprio link do Paulo.
