

## Métricas de Conversão do Funil

Adicionar um painel de métricas acima do Kanban com taxa de conversão entre estágios e um gráfico de barras horizontal.

### Implementação

**1. Painel de métricas colapsável** no `SalesFunnel.tsx`:
- Toggle "Métricas" no top bar (ícone BarChart3) que expande/colapsa uma seção acima do Kanban
- Calculado client-side a partir dos dados já carregados (`contactsByStage`)

**2. Métricas exibidas:**
- **KPI cards em linha**: Total de leads, Taxa geral de conversão (new→customer), Taxa de perda
- **Conversão entre estágios adjacentes** (5 transições): Novo→Qualificado, Qualificado→Proposta, Proposta→Negociação, Negociação→Vendido, e taxa de perda (churned/total)
- Cada transição mostra: contagem do estágio anterior, contagem do próximo, e % de passagem

**3. Gráfico de barras horizontal** usando Recharts (já instalado):
- Eixo Y: as 5 transições ("Novo → Qualificado", etc.)
- Eixo X: percentual de conversão (0-100%)
- Barras coloridas com a cor do estágio de destino
- Tooltip com detalhes (X de Y leads passaram)

**4. Cálculo da taxa:**
- Para cada par de estágios consecutivos: `taxa = (soma dos leads no estágio atual + todos os estágios posteriores) / (soma do estágio anterior + todos os posteriores)`
- Ou seja, conta quantos leads "passaram" daquele ponto em diante vs o total que chegou até ali

### Arquivos modificados
- `src/components/SalesFunnel.tsx` — adicionar seção de métricas com toggle, KPI cards e gráfico Recharts

Sem novas tabelas, sem novas dependências. Tudo calculado client-side com os dados existentes.

