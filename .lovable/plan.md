# Respostas rápidas 100% alinhadas à landing page

Objetivo: todo o conteúdo das respostas prontas passa a vir exclusivamente da página oficial `rctr-c.rc-dc.rc-v.jacometo.com.br`. Qualquer afirmação que não esteja na página é removida.

## O que sai (informação divergente hoje)

- "3 apólices, cada uma com número próprio" — a página diz **uma única apólice** com um número para indicar no RNTRC.
- "Atendimento em horário comercial, de segunda a sexta" — horário não consta na página.
- Qualquer citação de produtos/coberturas que não estejam na página (ex.: listas de outros ramos de seguro).

## Conjunto novo (14 respostas, sem emoji, com atalho)

Abertura
- `/triagem` — Você roda como subcontratado de transportadoras ou fecha frete direto com o dono da carga?

Produto (texto da página)
- `/pacote` — RCTR-C, RC-DC e RC-V em uma única apólice da seguradora parceira (SUSEP), 100% online.
- `/coberturas` — RCTR-C: danos à carga em acidente. RC-DC: roubo e furto da carga. RC-V: danos a terceiros pelo veículo.
- `/preco` — R$ 911,66/ano (prêmio básico anual), vigência de 1 ano a partir da emissão, pagamento por Pix.
- `/prazo` — Emissão em até 2 horas após aceite da proposta e pagamento; depois você indica o número no RNTRC.
- `/comofunciona` — 4 passos: preencher online (CNPJ), aceitar a proposta, emissão em 2h, indicar no RNTRC.
- `/lei` — Lei 14.599/2023, obrigatória desde 09/01/2026, para toda transportadora com RNTRC ativo.
- `/seguradora` — Apólices emitidas pela seguradora parceira registrada na SUSEP; Jacometo é a corretora.
- `/elegibilidade` — É para CNPJ (MEI, ME, EPP) registrado no RNTRC como ETC que roda exclusivamente como subcontratado e emite CT-e de subcontratação.

Objeções (FAQ da página)
- `/jatenho` — Uma apólice ativa por vez; falar com a Central antes para fazer a troca na virada.
- `/rntrc` — RNTRC vencido/suspenso: proposta pode ser registrada, emissão depende da regularização na ANTT.
- `/fiscalizacao` — Conferência eletrônica: seguradoras informam apólices e a ANTT cruza com o RNTRC.

Fora do perfil
- `/contratado` — Quem fecha direto com o embarcador e emite CT-e/MDF-e próprios precisa do seguro de carga convencional (averbação por embarque, faturamento mensal, gerenciamento de risco, sob análise de perfil). Avisar a Central antes do embarque; sem isso, esses embarques não têm cobertura.
- `/encaminhar` — Pessoa física/TAC ou outro tipo de seguro: acolhe, coleta nome, telefone e e-mail (CNPJ se PJ) e informa que um responsável da Jacometo vai retornar. Sem citar produtos, preços ou coberturas.

Fechamento
- `/central` — Central Jacometo (43) 3321-5007 e site oficial para contratação, sem promessa de horário.

## Detalhes técnicos

- Substituição total das linhas de `public.quick_replies` (delete + insert) via ferramenta de dados, mantendo categorias, atalhos e a variável `{nome}`.
- Revisão dos textos fixos do `nina-orchestrator` para eliminar as mesmas divergências ("3 apólices com números próprios", horário de atendimento) e alinhar ao "uma única apólice".
- Verificação: consulta às respostas gravadas (sem emoji, preço e prazo corretos) e redeploy do agente.
