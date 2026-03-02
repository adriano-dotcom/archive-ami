

## Plano de Implementação: OrbePet no Projeto Atual

O projeto será transformado incrementalmente em 6 fases, priorizando mudanças visuais primeiro (impacto imediato) e funcionalidades novas depois.

---

### Fase 1 — Rebranding Visual OrbePet

**Arquivos:** `src/index.css`, `src/components/Sidebar.tsx`, `src/App.tsx`

- Trocar variáveis CSS: primary → roxo `#6A0DAD` (273° 90% 36%), secondary → `#EDE0F5`, fundo → `#FAFAFA`
- Sidebar: substituir logo "Jacometo" por texto "OrbePet 🐾", trocar gradientes cyan → roxo
- AppLayout: trocar `bg-slate-950` → `bg-[#FAFAFA]`, remover ambient glows cyan/violet, ajustar para tema claro
- PageLoader: spinner roxo em vez de cyan
- Toaster: `theme="light"`

---

### Fase 2 — Reorganizar Menu e Rotas

**Arquivos:** `src/components/Sidebar.tsx`, `src/App.tsx`

Menu OrbePet:
1. **Dashboard** (`/dashboard`)
2. **Conversas** (`/chat`) — renomear de "Atendimento"
3. **Funil** (`/funil`) — novo
4. **Segurados** (`/segurados`) — manter
5. **Templates** (`/templates`) — mover de dentro de Settings
6. **Fluxos** (`/fluxos`) — novo
7. **Relatórios** (`/relatorios`) — novo
8. **Configurações** (`/settings`)

Remover do menu: Apólices & Cobrança (Collections), Agendamentos, Chamadas, WhatsApp, Equipe (mover para dentro de Config)

---

### Fase 3 — Banco de Dados (Migrações SQL)

Criar tabelas:

```text
plans
├── id (uuid PK)
├── name (text) — Essencial/Completo/Premium
├── price_monthly (numeric)
├── annual_limit (numeric)
├── coverages (jsonb) — array de coberturas com limites e carências
└── created_at, updated_at

subscriptions
├── id (uuid PK)
├── contact_id (uuid FK → contacts)
├── plan_id (uuid FK → plans)
├── status (text) — active/cancelled/overdue
├── start_date (date)
└── created_at, updated_at
```

Adicionar colunas à tabela `contacts`:
- `pet_name text`
- `pet_species text` (cão/gato)
- `pet_age integer`
- `stage text` default 'novo_lead' (funil: novo_lead/qualificado/proposta/negociacao/vendido/perdido)

RLS: mesmas policies dos contacts (team_member OR admin OR operator).

Seed data: inserir os 3 planos (Essencial R$37,62, Completo, Premium) com coberturas em JSONB.

---

### Fase 4 — Funil Kanban (`/funil`)

**Novo componente:** `src/components/SalesFunnel.tsx`

- 6 colunas: Novo Lead → Qualificado → Proposta → Negociação → Vendido → Perdido
- Cards mostram: nome, pet_name, plano de interesse, data de entrada, agente
- Drag-and-drop entre colunas (usando estado local + update no campo `stage` da tabela `contacts`)
- Filtros: agente, período, plano
- Query: `SELECT * FROM contacts WHERE stage IS NOT NULL ORDER BY updated_at`

---

### Fase 5 — Fluxos do Bot (`/fluxos`)

**Novo componente:** `src/components/BotFlows.tsx`

- Visualização estática de 4 fluxos (Captação, Vendas, Onboarding, Suporte)
- Cada fluxo = sequência de cards conectados por setas (CSS flexbox/grid, sem lib externa)
- Dados hardcoded inicialmente (fluxos são configuração fixa)
- Toggle ativar/desativar por fluxo (salva em `nina_settings.metadata` ou nova coluna)
- Modal de edição do texto de cada nó

---

### Fase 6 — Dashboard OrbePet + Relatórios

**Dashboard** (`src/components/Dashboard.tsx`):
- KPIs: NPS, leads esta semana, taxa de conversão, receita recorrente
- Funil visual mini (barras horizontais)
- Lista de conversas recentes com badges coloridos (🟣 Novo, 🟡 Aguardando, 🟢 Vendido, etc.)

**Relatórios** (`src/components/Reports.tsx` — novo):
- Abas: Conversões | Atendimento | Retenção | Receita
- Gráficos com recharts (já instalado)
- Filtro de período
- Exportar CSV

---

### Fase 7 — Adaptações de Linguagem e UX

- `ChatInterface.tsx`: balão bot = roxo claro com 🤖, balão agente = roxo escuro
- `ContactDetailsDrawer.tsx`: adicionar campos pet_name, pet_species, pet_age, stage, plano contratado
- Renomear globalmente: "segurado" mantém, mas remover "apólice/sinistro" → "plano/proteção/reembolso"
- Empty state: "Nenhuma conversa ativa no momento 🐾..."
- `Settings.tsx`: adicionar aba "Planos" para editar tabela `plans`

---

### Ordem de Execução Recomendada

| Passo | O que | Estimativa |
|-------|-------|-----------|
| 1 | Rebranding visual (CSS + Sidebar) | 1 sessão |
| 2 | Migrações SQL (plans, subscriptions, campos pet) | 1 sessão |
| 3 | Menu + rotas novas (funil, fluxos, relatórios) | 1 sessão |
| 4 | Funil Kanban | 1-2 sessões |
| 5 | Dashboard OrbePet + Relatórios | 1-2 sessões |
| 6 | Fluxos do Bot | 1 sessão |
| 7 | Adaptações de linguagem e UX | 1 sessão |

**Total estimado: 7-9 sessões de trabalho**

Quer começar pela Fase 1 (rebranding visual)?

