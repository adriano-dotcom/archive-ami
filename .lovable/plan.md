

## Plano: Estratégia de Apresentação de Planos — Técnica de Ancoragem (Goldilocks)

### Técnica de Vendas Escolhida: **Center-Stage Effect + Anchoring**

A técnica mais adequada para venda de planos em 3 níveis é o **Center-Stage Effect** (também chamado de Goldilocks Pricing), combinado com **Anchoring**:

- **Apresentar primeiro o plano intermediário (Órbita Plus)** como âncora — ele se torna a referência mental de valor
- **Depois oferecer o Essencial** como alternativa econômica ("se quiser algo mais leve...")
- **Por último o Total** como upgrade ("e se quiser o máximo de proteção...")

Isso funciona porque:
1. O plano do meio parece o "mais equilibrado" e é escolhido pela maioria (estudos mostram 60-70% de conversão no meio)
2. O Essencial parece "barato demais" em comparação, e o Total parece um upgrade natural
3. Evita o efeito de "preço mais barato primeiro" que ancora o cliente em R$37

### O que será alterado

**1 alteração**: Atualizar o prompt do agente Orbi em **dois lugares** (são o mesmo texto):
- Tabela `nina_settings` → campo `system_prompt_override`
- Tabela `agents` → campo `system_prompt` (agente Orbi)

### Mudanças no prompt

**Seção "OS 3 PLANOS ORBEPET"** — Reordenar para: Plus → Essencial → Total

**Seção "RECOMENDAÇÃO DE PLANO" (item 3 do fluxo)** — Substituir a lógica por:

```
### 3. RECOMENDAÇÃO DE PLANO — TÉCNICA DE ANCORAGEM

⚠️ REGRA OBRIGATÓRIA: SEMPRE comece apresentando o **Órbita Plus** como primeira opção, 
independentemente do perfil do pet. Esta é a sua ÂNCORA de valor.

**Ordem de apresentação:**
1. **Primeiro:** Apresente o Órbita Plus como recomendação principal
2. **Depois:** Ofereça o Essencial como alternativa mais acessível
3. **Por último:** Mencione o Total como upgrade para proteção máxima

**Script de apresentação:**
> "Para o [nome do pet], recomendo o Órbita Plus — ele cobre consultas, exames, 
> cirurgias até R$1.000 e especialistas, tudo por R$89,82/mês. 
> É o plano mais escolhido pelos tutores! 💜"

> [Se o tutor achar caro]: "Entendo! Temos o Essencial por R$37,62/mês — 
> cobre consultas e exames do dia a dia. Perfeito pra começar!"

> [Se o tutor quiser mais]: "E se quiser a proteção máxima, o Total por R$107,82/mês 
> inclui tudo do Plus + internação e castração."

**Nunca comece pelo Essencial.** O Órbita Plus é sempre a primeira apresentação.
```

### Implementação

- Será uma **migração SQL** (UPDATE) em `nina_settings` e `agents` para atualizar o `system_prompt_override` e `system_prompt` respectivamente
- Nenhum código frontend ou edge function precisa mudar — o prompt é carregado dinamicamente do banco

