

## Varredura completa de cores — Fases 2-5

94 arquivos restantes com ~11.000 ocorrências de cores hardcoded. Fases 1 e 6 já foram aplicadas.

### Escopo por fase

**Fase 2 — Chat (maior arquivo: ChatInterface.tsx com 3152 linhas)**
- `ChatInterface.tsx` — ~150 ocorrências (bg-slate-950, text-white, border-slate-800, text-cyan-500, bg-slate-800/40, etc.)
- `ContactDetailsDrawer.tsx`, `TypingIndicator.tsx`
- `chat/ConversationSummaryNotes.tsx`, `HandoffSummaryCard.tsx`, `LeadScoreBadge.tsx`, `MessageToneAssistant.tsx`, `PDFPreviewModal.tsx`, `VideoThumbnailPreview.tsx`, `WaitingTimeBadge.tsx`

**Fase 3 — Contatos e Segurados**
- `Contacts.tsx`, `CreateContactModal.tsx`, `EditContactModal.tsx`
- `contacts/VirtualizedContactsTable.tsx`, `ContactCollectionHistory.tsx`, `DuplicateContactsReportModal.tsx`
- `segurados/*.tsx` (~15 arquivos: tabelas, modais, importação)

**Fase 4 — Funcionalidades secundárias**
- `collections/*.tsx` (~10 arquivos)
- `WhatsAppDashboard.tsx`, `whatsapp-dashboard/*.tsx` (6 arquivos)
- `SalesFunnel.tsx`, `BotFlows.tsx`, `Reports.tsx`, `Scheduling.tsx`, `MeetingRoom.tsx`
- `CallHistoryPanel.tsx`, `WhatsAppCallHistoryPanel.tsx`, `CallTimelineCard.tsx`

**Fase 5 — Modais e suporte**
- `SendWhatsAppTemplateModal.tsx`, `BulkSendTemplateModal.tsx`, `ImportContactsModal.tsx`
- `EmailComposeModal.tsx`, `EmailTemplateEditorModal.tsx`
- `settings/*.tsx` restantes (AgentsSettings, ApiSettings, WhatsAppTemplatesSettings, etc.)
- `OnboardingWizard.tsx`, `OnboardingBanner.tsx`, `Sidebar.tsx`, `Team.tsx`
- `ActiveCallIndicator.tsx`, `AudioPlayer.tsx`, `CallConfirmationModal.tsx`, `IncomingCallModal.tsx`
- `TagSelector.tsx`, `QuickQuestionsDropdown.tsx`, `KeyboardShortcutsHelp.tsx`

### Mapeamento (mesmo já definido)

```text
bg-slate-950       → bg-background
bg-slate-900       → bg-card
bg-slate-900/50    → bg-card/50
bg-slate-800       → bg-muted
bg-slate-800/50    → bg-muted/50
bg-slate-800/40    → bg-muted/40
text-white         → text-foreground
text-slate-100-200 → text-foreground
text-slate-300-600 → text-muted-foreground
border-slate-700/800 → border-border
text-cyan-400/500  → text-primary
bg-cyan-500/10     → bg-primary/10
bg-cyan-600        → bg-primary
hover:bg-slate-700/800 → hover:bg-accent
hover:bg-cyan-700  → hover:bg-primary/80
placeholder:text-slate-* → placeholder:text-muted-foreground
```

### Exceções preservadas
- Cores funcionais de status: `text-red-*`, `text-green-*`, `text-amber-*`, `text-yellow-*`
- Gradientes decorativos de agentes (violet, fuchsia, purple, pink, rose, amber)
- Gradientes de botões ativos (from-cyan-400 to-blue-500 → from-primary to-blue-500)
- Cores de diferenciação por seção (blue, indigo, orange)

### Nota técnica
- O `ChatInterface.tsx` tem 3152 linhas — será o arquivo com mais edits
- Arquivos `Sidebar.tsx` e `Team.tsx` já tiveram correções parciais, agora serão finalizados
- Total estimado: ~60-70 arquivos precisam de edits

