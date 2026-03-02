

## Plano: Transformar em Central Completa de Atendimento — Jacometo Seguros

### Contexto Atual

O projeto atual é um sistema de cobrança e CRM com WhatsApp, contendo:
- Dashboard de métricas
- Chat ao vivo (WhatsApp)
- Contatos e Segurados (PF/PJ)
- Cobrança (parcelas, campanhas)
- Agendamentos, Equipe, Configurações
- WhatsApp Dashboard

O objetivo é reorganizar tudo para funcionar como uma **Central de Atendimento** da corretora, focada no segurado.

---

### O que muda

**1. Rebranding da Sidebar e Navegação**
- Subtítulo de "SISTEMA DE COBRANÇA ÔMEGA" → "CENTRAL DE ATENDIMENTO"
- Reorganizar menu para fluxo de atendimento:
  - **Painel** (Dashboard com KPIs de atendimento)
  - **Atendimento** (Chat ao vivo — renomear)
  - **Segurados** (unificar Contatos + Segurados PF/PJ em uma única entrada)
  - **Apólices & Cobrança** (manter Collections)
  - **Agendamentos**
  - **Chamadas** (novo — histórico de chamadas WhatsApp como seção principal)
  - **Equipe** (admin)
  - **WhatsApp** (admin)
  - **Configurações**

**2. Dashboard Reformulado**
- Adicionar KPIs de atendimento ao topo:
  - Atendimentos em aberto
  - Tempo médio de resposta
  - Chamadas recebidas hoje
  - Segurados atendidos hoje
- Manter gráficos existentes mas renomear para contexto de atendimento

**3. Nova Rota: Segurados (unificada)**
- Mover a aba Segurados (que hoje está embutida em algum lugar) para rota `/segurados` com acesso direto na sidebar
- Já existe o componente `SeguradosTab` completo com PF/PJ, empresas, importação

**4. Nova Rota: Chamadas**
- Criar rota `/calls` com o componente `WhatsAppCallHistoryPanel` como página principal
- Mostrar histórico de todas as chamadas recebidas/realizadas
- Integrar com a funcionalidade de receber chamadas que já existe

**5. Textos e Labels**
- Renomear "Chat Ao Vivo" → "Atendimento"
- Renomear "Contatos" → "Segurados"
- Renomear "Cobrança" → "Apólices & Cobrança"
- Atualizar textos do Dashboard

---

### Arquivos a criar/modificar

| Arquivo | Ação |
|---------|------|
| `src/components/Sidebar.tsx` | Reorganizar menu, renomear labels, mudar subtítulo |
| `src/App.tsx` | Adicionar rotas `/segurados` e `/calls` |
| `src/components/CallsPage.tsx` | **Novo** — página de histórico de chamadas |
| `src/components/Dashboard.tsx` | Atualizar títulos e labels para contexto de atendimento |
| `src/components/collections/CollectionsDashboard.tsx` | Renomear título para "Apólices & Cobrança" |

### Sem mudanças no banco de dados
Todas as tabelas necessárias já existem. A transformação é puramente de interface e navegação.

