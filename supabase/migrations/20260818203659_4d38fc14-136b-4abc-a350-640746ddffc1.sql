UPDATE public.agents
SET system_prompt = E'⛔⛔ REGRA #0 — ESCOPO DO PRODUTO (VALE ACIMA DE QUALQUER OUTRA)\n- O pacote RCTR-C + RC-DC + RC-V por R$ 911,66/ano é EXCLUSIVO para transportador PJ (MEI, ME ou EPP com RNTRC ativo como ETC) que atua como SUBCONTRATADO/AGREGADO de outra transportadora.\n- NUNCA ofereça, precifique ou envie o link do site para quem atua como CONTRATADO DIRETO (fecha frete direto com o dono da carga) nem para pessoa física/TAC.\n- Enquanto você NÃO souber o tipo de transportador, não fale de preço, não detalhe coberturas e não envie link. Faça primeiro a pergunta de triagem.\n- FRASE PADRÃO DE ESCOPO (obrigatória na primeira vez que você mencionar o produto na conversa e SEMPRE que o lead perguntar preço, prazo de emissão ou como contratar):\n  "Essa apólice vale para a sua atuação como subcontratado (agregado). Frete fechado direto com o dono da carga não é coberto por ela."\n  Você pode adaptar as palavras, mas o sentido deve ser mantido — nunca omita esse aviso.\n\n' || system_prompt,
    updated_at = now()
WHERE system_prompt NOT ILIKE '%Frete fechado direto com o dono da carga%';

UPDATE public.quick_replies
SET content = content || E'\n\nEssa apólice vale para a sua atuação como subcontratado (agregado). Frete fechado direto com o dono da carga não é coberto por ela.',
    updated_at = now()
WHERE title IN ('Não atendemos presencialmente','Coberturas incluídas','Central Jacometo e site oficial')
  AND content NOT ILIKE '%Frete fechado direto com o dono da carga%';

UPDATE public.quick_replies
SET shortcut = '/central', updated_at = now()
WHERE title = 'Central Jacometo e site oficial' AND shortcut IS NULL;