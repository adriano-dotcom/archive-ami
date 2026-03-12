

## Revisão do Prompt do Agente Orbi

### Diagnóstico

Após análise do prompt do agente (banco de dados) e da função `buildEnhancedPrompt` no `nina-orchestrator`, identifiquei **2 problemas críticos** e **1 lacuna de conteúdo**:

---

### Problema 1: Bloco de seguros de transporte ainda no código (CRÍTICO)

O `nina-orchestrator` (linhas 4219-4293) injeta automaticamente ~75 linhas de "CONHECIMENTO ESPECIALIZADO - SEGUROS DE TRANSPORTE" em **toda conversa**. Contém ATM, CT-e, averbação de carga, regra dos 15 dias — conteúdo da antiga corretora Jacometo, completamente irrelevante para saúde pet. Isso:
- Desperdiça tokens da janela de contexto
- Pode confundir o modelo e gerar respostas sobre seguros de carga

**Ação:** Remover todo o bloco de seguros de transporte (linhas 4219-4293) e substituir por uma seção curta e genérica sobre saúde pet.

---

### Problema 2: Campos de qualificação obsoletos (MODERADO)

Os campos de qualificação (linhas 4450-4465) ainda referenciam `tipo_carga`, `viagens_mes`, `valor_medio`, `antt`, `cte` — todos de transporte. Devem ser atualizados para campos pet.

**Ação:** Substituir os `fieldLabels` por campos relevantes:
- `pet_nome`, `pet_especie`, `pet_idade`, `pet_raca`
- `plano_interesse`, `preocupacao_principal`, `ja_tem_plano`

---

### Lacuna: Plano Órbita Galáxia não está no prompt do agente

O banco tem 4 produtos com extração completa: Essencial, Plus, Total e **Galáxia**. Porém, o prompt do agente no banco lista apenas 3 planos. O Galáxia não aparece na tabela de planos nem no script de ancoragem.

**Ação:** Não alterar o prompt do agente agora — o conteúdo completo do Galáxia já é injetado automaticamente via `product_knowledge`. A base de conhecimento cobre as perguntas detalhadas. Se quiser adicionar o Galáxia à tabela de planos do prompt, isso pode ser feito pelo painel de Agentes.

---

### Resumo das alterações

**Arquivo:** `supabase/functions/nina-orchestrator/index.ts`

1. **Remover** o bloco `CONHECIMENTO ESPECIALIZADO - SEGUROS DE TRANSPORTE` (linhas 4219-4293)
2. **Atualizar** os `fieldLabels` da qualificação (linhas 4450-4465) para campos pet
3. **Deploy** da edge function atualizada

### Resultado
- Prompt mais limpo e focado em saúde pet
- ~75 linhas de contexto irrelevante removidas = mais espaço para product knowledge
- Qualificação coerente com o negócio OrbePet
- As 4 condições gerais (Essencial, Plus, Total, Galáxia) continuam sendo injetadas automaticamente via product_knowledge

