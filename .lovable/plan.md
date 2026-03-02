

## Plano: Varredura completa de cores hardcoded para tokens semanticos

### Escopo

101 arquivos com ~11.600 ocorrencias de cores hardcoded (`slate-*`, `white`, `black`, `cyan-*`). Este e um trabalho grande que sera feito em fases por prioridade visual.

### Mapeamento de substituicoes

```text
BACKGROUNDS
  bg-slate-950      → bg-background
  bg-slate-900      → bg-card
  bg-slate-900/50   → bg-card/50
  bg-slate-800      → bg-muted
  bg-white          → bg-background
  bg-black          → bg-background

TEXT
  text-white         → text-foreground
  text-slate-50      → text-foreground
  text-slate-100     → text-foreground
  text-slate-200     → text-foreground
  text-slate-300     → text-muted-foreground
  text-slate-400     → text-muted-foreground
  text-slate-500     → text-muted-foreground
  text-slate-600     → text-muted-foreground
  text-black         → text-foreground

BORDERS
  border-slate-700   → border-border
  border-slate-800   → border-border
  border-white/5     → border-border
  border-white/10    → border-border

ACCENTS (cyan → primary)
  text-cyan-400      → text-primary
  text-cyan-500      → text-primary
  bg-cyan-500/10     → bg-primary/10
  bg-cyan-500/20     → bg-primary/20
  ring-cyan-500/50   → ring-ring

INPUTS
  bg-slate-950 border-slate-700  → bg-input border-input
  placeholder:text-slate-600     → placeholder:text-muted-foreground

HOVER/INTERACTIVE
  hover:bg-slate-800  → hover:bg-accent
  hover:bg-slate-700  → hover:bg-accent
  hover:bg-white      → hover:bg-accent
```

### Fases de execucao

**Fase 1 — Paginas principais (mais visiveis)**
- `Settings.tsx` (parcialmente feito)
- `AgentSettings.tsx`
- `ApiSettings.tsx`
- `AgentsSettings.tsx`
- `GeneralSettings.tsx`
- `Dashboard.tsx`
- `Sidebar.tsx`
- `Team.tsx` (parcialmente feito)

**Fase 2 — Chat e conversas**
- `ChatInterface.tsx`
- `chat/*.tsx` (subcomponentes)
- `ContactDetailsDrawer.tsx`
- `TypingIndicator.tsx`

**Fase 3 — Contatos e segurados**
- `Contacts.tsx`, `CreateContactModal.tsx`, `EditContactModal.tsx`
- `segurados/*.tsx` (todos os modais e tabelas)
- `contacts/*.tsx`

**Fase 4 — Funcionalidades secundarias**
- `collections/*.tsx`
- `CallsPage.tsx`, `CallHistoryPanel.tsx`
- `WhatsAppDashboard.tsx`, `whatsapp-dashboard/*.tsx`
- `SalesFunnel.tsx`, `BotFlows.tsx`, `Reports.tsx`
- `Scheduling.tsx`, `MeetingRoom.tsx`

**Fase 5 — Modais e componentes de suporte**
- `SendWhatsAppTemplateModal.tsx`, `BulkSendTemplateModal.tsx`
- `ImportContactsModal.tsx`
- `settings/*.tsx` restantes
- `OnboardingWizard.tsx`, `OnboardingBanner.tsx`
- `EmailComposeModal.tsx`

**Fase 6 — Componentes UI base**
- `ui/input.tsx`, `ui/textarea.tsx`, `ui/tooltip.tsx`, `ui/popover.tsx`
- Remover prefixos `dark:` redundantes (ja que dark mode e global)

### Notas tecnicas
- As variaveis do tema ja estao bem definidas no `index.css` (`:root` e `.dark`)
- Com `class="dark"` global, prefixos `dark:bg-slate-900` sao redundantes e devem ser removidos
- Cores funcionais (`text-red-400`, `text-green-400`, `text-amber-500`) serao mantidas — sao indicadores de status
- Cores de acento especificas (`text-blue-400`, `text-indigo-400`) podem ser mantidas para diferenciacao visual entre secoes
- O Toaster em `App.tsx` deve trocar `theme="light"` para `theme="dark"`

### Estimativa
~101 arquivos, trabalho sera dividido em 6 lotes para evitar erros. Cada fase sera aplicada e verificada antes de avancar.

