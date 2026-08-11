# Saída da fase de teste: limpar respostas rápidas e alinhar a Iris

## Diagnóstico (verificado agora)

**Respostas prontas (3 cadastradas)** — todas desatualizadas e fora do padrão atual:

| Problema | Detalhe |
|---|---|
| Emojis | Todas usam 🚛 ✅ ⚠️ 👉 💙 — viola a regra "nunca enviar emoji ao contato" (o filtro remove no envio da IA, mas o operador cola o texto direto) |
| Discurso errado | Todas dizem "*NÃO cobre* RCTR-C, RC-DC e RC-V" / "não há indenização em sinistro" — discurso antigo, substituído por: a carga é averbada na apólice da transportadora contratante |
| Sem preço/prazo | Nenhuma cita R$ 911,66/ano (Pix), vigência 1 ano, emissão em até 2h, nem o site oficial |
| Títulos ruins | O título é o próprio começo do texto ("Olá! *Jacometo Corretora* 🚛"), impossível de achar na busca |
| Sem organização | `category` e `shortcut` nulos nas 3 |

**Prompt da Iris (`nina-orchestrator`)** — conteúdo já correto (R$ 911,66/ano, 2h, PJ com RNTRC, protocolo "Outros Seguros", triagem contratado × subcontratado), mas os textos-modelo/fixos ainda trazem emojis no código-fonte (abertura de triagem, handoff do contratado, exemplo do protocolo Outros Seguros). O filtro global limpa antes do envio, porém o modelo "aprende" o estilo errado e o texto-fonte fica inconsistente com a regra.

## O que fazer

### 1. Substituir as respostas prontas (via migração no banco)
Apagar as 3 atuais e cadastrar um conjunto novo, sem emoji, com título curto, categoria e atalho:

| Categoria | Título | Atalho |
|---|---|---|
| Abertura | Triagem: contratado ou subcontratado | /triagem |
| Produto | Apólice do subcontratado (o que é) | /subcontratado |
| Produto | Preço e forma de pagamento | /preco |
| Produto | Como contratar (passo a passo + link) | /contratar |
| Produto | Prazo de emissão e vigência | /prazo |
| Objeções | Já tenho seguro / troca na virada | /jatenho |
| Objeções | RNTRC vencido ou suspenso | /rntrc |
| Objeções | Sou autônomo (TAC/pessoa física) | /pessoafisica |
| Contratado | Contratado direto: seguro convencional | /contratado |
| Outros | Outro tipo de seguro: coletar e repassar | /outros |
| Encerramento | Repasse ao responsável / handoff | /handoff |
| Encerramento | Contatos da Central Jacometo | /central |

Todos os textos usam variáveis já suportadas (`{nome}`, `{empresa}`, `{cnpj}`, `{rntrc}`, `{telefone}`), negrito do WhatsApp e os dados oficiais: R$ 911,66/ano via Pix, emissão em até 2h, vigência 1 ano, exclusivo PJ com RNTRC ativo, site oficial de contratação, Central (43) 3321-5007 / WhatsApp (43) 99156-2099.

### 2. Limpar emojis dos textos fixos do agente
Em `supabase/functions/nina-orchestrator/index.ts`: remover emojis dos modelos de mensagem enviados ao contato (abertura de triagem, apresentação do subcontratado, handoff do contratado, exemplo do protocolo Outros Seguros e mensagem do link). Os títulos internos do prompt (que a IA nunca envia) podem manter os marcadores.

### 3. Verificação antes de considerar pronto
- Conferir que nenhuma resposta pronta contém emoji nem a frase "não há indenização".
- Rodar `subcontratado.test.ts` e fazer o deploy do `nina-orchestrator`.
- Testar no chat: abrir o painel de respostas prontas, buscar por atalho e inserir com variáveis preenchidas.

## Detalhes técnicos
- Migração SQL em `supabase/migrations/` fazendo `DELETE FROM quick_replies` das 3 linhas atuais + `INSERT` do novo conjunto (`title`, `content`, `category`, `shortcut`).
- Nenhuma mudança de schema — `quick_replies` já tem `category` e `shortcut`.
- Edição de texto apenas nos blocos de prompt do `nina-orchestrator`; a lógica de fluxo permanece intacta.
