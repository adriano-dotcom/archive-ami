# Atualizar o treinamento da Iris com a nova landing page

Nova fonte única: `https://rctr-c.rc-dc.rc-v.jacometo.com.br/`

## O que muda

| Item | Hoje | Novo (LP) |
|---|---|---|
| Preço | R$ 644,28/mês | **R$ 911,66/ano** (prêmio básico anual, pago por Pix) |
| Emissão | até 5 dias úteis | **até 2 horas** após aceite da proposta + pagamento |
| Link de contratação | transporte.jacometoseguros.com.br | **rctr-c.rc-dc.rc-v.jacometo.com.br** |
| Cobertura | "não há cobertura nem indenização" | a carga é **averbada na apólice da transportadora contratante**, mantendo o aviso explícito de que embarques como contratado direto ficam sem cobertura nesta apólice |
| Público | MEI/ME/EPP | igual + **exclusivo PJ** (autônomo/TAC pessoa física não é elegível) |

## Novos fatos que a Iris passa a saber

- Elegibilidade: CNPJ (MEI/ME/EPP) com RNTRC ativo como ETC; roda **exclusivamente como subcontratado**; emite CT-e de subcontratação.
- Não elegível: fecha frete direto com o dono da carga, precisa averbar cada embarque, ou é pessoa física (TAC).
- Fiscalização é **eletrônica**: seguradoras informam as apólices e a ANTT cruza com o RNTRC; sem vínculo, o registro fica irregular/suspenso.
- Passos: preencher online (CNPJ) → aceitar a proposta → emissão em 2h → indicar o número da apólice no RNTRC.
- **Uma apólice ativa por vez** por registro; quem já tem seguro vigente deve falar com a Central antes, para trocar na virada.
- **RNTRC vencido/suspenso**: proposta pode ser registrada, mas a emissão depende de regularizar o registro na ANTT.
- Virou contratado direto: avisar a Central **antes do embarque** para migrar ao seguro convencional (averbação, faturamento mensal, gerenciamento de risco).
- Central de Atendimento Jacometo: **(43) 3321-5007** · WhatsApp (43) 99156-2099.
- Vigência de 1 ano · apólice de seguradora parceira registrada na SUSEP · Lei 14.599/2023, obrigatório desde 09/01/2026.

## Onde aplicar

1. **Catálogo no banco** (`orbe_plans_catalog`) — migração atualizando o único plano ativo: preço anual R$ 911,66, `emissao_horas: 2`, `pagamento: anual (Pix)`, remoção do flag `sem_indenizacao`, e coberturas reescritas sem "sem indenização efetiva".
2. **`supabase/functions/nina-orchestrator/index.ts`** — atualizar todos os pontos de preço/prazo/link/discurso:
   - bloco `plansCatalogContent` (regra crítica de preço, elegibilidade, canal único, bloco do subcontratado);
   - constante `CONTRACT_SITE_URL` e todas as URLs hardcoded;
   - mensagem de link enviada ao concluir a qualificação;
   - mensagem de handoff do fluxo contratado;
   - fatos do prompt base e a mensagem-modelo da primeira resposta ao lead do site;
   - texto do "Pacote 3 Seguros Obrigatórios" no resumo de qualificação.
   - Acrescentar bloco de FAQ (apólice única por registro, RNTRC irregular, PF não elegível, fiscalização eletrônica, migração).
3. **Base de conhecimento** (`product_knowledge`) — inserir/atualizar o registro com o conteúdo integral da nova LP como fonte única.
4. **Memórias** — atualizar `Core` do índice, `iris-persona` e `plans-catalog-source-of-truth` para o novo preço e condições, evitando que o valor antigo volte.

## Verificação

- Rodar a suíte de testes existente da função (`subcontratado.test.ts` e demais) e o typecheck Deno.
- Deploy do `nina-orchestrator`.
- Conferir por busca no arquivo que não sobrou nenhuma menção a "644,28", "5 dias úteis" ou ao domínio antigo.
