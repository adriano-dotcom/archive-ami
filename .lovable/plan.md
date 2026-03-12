

## Revisão do Prompt do Agente Orbi vs Site Oficial orbepet.com.br

### Discrepâncias Encontradas

Comparei o site oficial com o prompt do agente no banco de dados e encontrei **5 problemas significativos**:

---

### 1. PIX vs Conta Bancária (CRÍTICO - informação conflitante)

- **Site oficial:** "Reembolso rápido direto na sua conta via PIX" — PIX é destaque principal
- **Prompt do agente:** "⚠️ Nunca fale em PIX como forma de reembolso. É conta bancária."
- **Impacto:** O agente está CONTRADIZENDO o site da empresa. Clientes que leram o site e perguntarem sobre PIX receberão uma resposta errada.
- **Ação:** Atualizar o prompt para confirmar PIX como forma de reembolso

### 2. Prazo de Reembolso (MODERADO)

- **Site oficial:** "até 7 dias úteis"
- **Prompt do agente:** "até 10 dias úteis"
- **Ação:** Atualizar para 7 dias úteis conforme site

### 3. Plano Órbita Galáxia Ausente (CRÍTICO)

- **Site oficial:** Lista 4 planos, incluindo **Órbita Galáxia** (R$ 138,32/mês, limite anual R$ 6.000)
  - Inclui tudo do Total + Castração (até R$500) + Acupuntura e fisioterapia (até R$500)
- **Prompt do agente:** Só lista 3 planos (Essencial, Plus, Total)
- **Ação:** Adicionar o Galáxia ao prompt com tabela de coberturas e ajustar a estratégia de ancoragem

### 4. Promoção 15% OFF + Carência Zero para Emergências (IMPORTANTE)

- **Site oficial:** Promoção ativa com 15% OFF para novas contratações + carência zero para emergências (acidentes, intoxicações, quadros agudos)
- **Prompt do agente:** Não menciona nenhuma promoção
- **Ação:** Adicionar seção de promoção ativa ao prompt (pode ser desativada depois)

### 5. Preços Desatualizados

Os preços no prompt são os com desconto. O site mostra preço cheio riscado + preço promocional:
- Essencial: ~~R$44,00~~ → R$37,40 (site) vs R$37,62 (prompt)
- Plus: ~~R$106,00~~ → R$89,82 (ok)
- Total: ~~R$127,00~~ → R$107,82 (ok)
- Galáxia: ~~R$163,00~~ → R$138,32 (falta no prompt)

**Ação:** Ajustar preço do Essencial e incluir referência ao preço cheio para ancoragem

---

### Plano de Implementação

**Método:** Atualização SQL direta na tabela `agents` (coluna `system_prompt`) para o agente Orbi

As alterações no prompt incluem:
1. **Trocar regra anti-PIX** por regra pró-PIX ("Reembolso via PIX em até 7 dias úteis")
2. **Atualizar prazo** de 10 para 7 dias úteis em todas as menções
3. **Adicionar tabela do Galáxia** com coberturas completas (castração R$500, acupuntura/fisioterapia R$500)
4. **Adicionar seção de promoção** com 15% OFF e carência zero para emergências
5. **Atualizar estratégia de ancoragem** para incluir 4 planos na ordem: Plus → Essencial → Total → Galáxia
6. **Corrigir preço Essencial** para R$37,40 (com desconto)
7. **Adicionar social proof** ("5.000+ pets protegidos, avaliação 4.9/5")
8. **Atualizar FAQ** com informações do site (carência zero emergência, PIX)

**Também no `nina-orchestrator`** (`buildEnhancedPrompt`):
- Nenhuma alteração necessária — o prompt é injetado diretamente do banco e as seções de conhecimento especializado já estão genéricas

### Resultado
- Agente 100% alinhado com o site oficial orbepet.com.br
- Sem contradições sobre PIX, prazos ou planos disponíveis
- Promoção ativa disponível para uso em vendas
- 4 planos completos no repertório do agente

