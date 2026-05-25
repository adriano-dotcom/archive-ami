## Objetivo

Atualizar a regra crítica de carência no prompt do Orbi para listar **explicitamente** cada evento e sua carência em dias, sem permitir inferência ou generalização pela IA.

## Arquivo

`supabase/functions/nina-orchestrator/index.ts` — bloco onde `plansCatalogContent` recebe a regra crítica de carência (próximo à linha 3600, logo após o cabeçalho do catálogo de planos).

## Mudança

Substituir o parágrafo único atual ("REGRA CRÍTICA DE CARÊNCIA…") por uma tabela textual fixa, baseada nos dados reais do `orbe_plans_catalog`:

```
🚫 REGRA CRÍTICA DE CARÊNCIA — use EXATAMENTE estes valores, nunca invente "carência zero" ou "proteção imediata":

• Telemedicina / Concierge 24h: 0 dias (única cobertura imediata)
• Consulta veterinária: 30 dias
• Consulta com especialista: 30 dias
• Atendimento ambulatorial: 30 dias
• Transporte veterinário: 30 dias
• Assistência funeral: 30 dias
• Exames laboratoriais e de imagem: 60 dias
• Vacina: 60 dias
• Cirurgias (inclui emergências, acidentes, intoxicações): 60 dias
• Internação: 60 dias
• Castração: 180 dias
• Carência geral padrão do plano: 30 dias

PROIBIDO afirmar que emergências, acidentes ou intoxicações têm carência zero. A única cobertura disponível desde o primeiro dia é a telemedicina 24h.
```

## Fora de escopo

- Não alterar os dados do `orbe_plans_catalog` (já estão corretos).
- Não mexer em sanitização de resposta, follow-ups, ou outros prompts.
- Não alterar lógica de injeção dinâmica do catálogo (continua sendo SSOT por plano); a tabela acima é um reforço determinístico para impedir alucinação.

## Validação

1. Após deploy do `nina-orchestrator`, simular conversa perguntando "tem carência para emergência?" — resposta deve citar 60 dias (cirurgias) e oferecer telemedicina 24h.
2. Confirmar que não aparece mais "carência zero" para emergências/acidentes nos logs do Orbi.
