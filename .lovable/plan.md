

## Varredura de Cores — Fases 3-5

Escopo: ~60 arquivos restantes com cores hardcoded para migrar para tokens semanticos.

### Arquivos por fase

**Fase 3 — Contatos e Segurados (~20 arquivos)**
- `Contacts.tsx` — bg-slate-950, text-white, border-slate-800, bg-slate-900, text-slate-400/200, bg-cyan-500/600
- `CreateContactModal.tsx` — bg-slate-900, border-slate-700, text-white
- `EditContactModal.tsx` — bg-slate-900, border-slate-700, text-white
- `contacts/VirtualizedContactsTable.tsx` — bg-slate-*, text-slate-*, border-slate-*
- `contacts/ContactCollectionHistory.tsx`
- `contacts/DuplicateContactsReportModal.tsx`
- `segurados/SeguradosTab.tsx` — bg-slate-900/50, border-slate-600/700
- `segurados/CompaniesTable.tsx`
- `segurados/SeguradosPFTable.tsx`
- `segurados/CreateCompanyModal.tsx`, `EditCompanyModal.tsx`, `CreateSeguradoPFModal.tsx`, `EditSeguradoPFModal.tsx`
- `segurados/CompanyDetailsDrawer.tsx`, `AddContactToCompanyModal.tsx`, `CompanySelector.tsx`
- `segurados/ImportCompaniesModal.tsx`, `ImportContactsSeguradosModal.tsx`, `ImportCompaniesWithContactsModal.tsx`
- `segurados/ImportDocumentAIModal.tsx`, `MergeCompaniesModal.tsx`, `DuplicateCompaniesReportModal.tsx`

**Fase 4 — Funcionalidades secundarias (~18 arquivos)**
- `collections/CollectionsDashboard.tsx` — bg-slate-950, border-white/5
- `collections/CollectionOverview.tsx` — bg-slate-900/50, text-slate-*, border-white/5
- `collections/InstallmentsList.tsx` — bg-slate-900/50, border-white/5
- `collections/ImportPanel.tsx` — bg-slate-900/50, border-white/5
- `collections/CollectionCampaigns.tsx`, `CollectionEmailCampaign.tsx`
- `collections/SendCollectionTemplateModal.tsx`, `SendInstallmentWhatsAppModal.tsx`
- `collections/installments/*.tsx` (~5 arquivos)
- `WhatsAppDashboard.tsx`, `whatsapp-dashboard/*.tsx` (6 arquivos)
- `Scheduling.tsx` — bg-slate-950, bg-slate-900, border-slate-800, text-white, text-cyan-500
- `MeetingRoom.tsx` — bg-slate-950, bg-slate-900, border-slate-800, text-white
- `CallHistoryPanel.tsx`, `WhatsAppCallHistoryPanel.tsx`, `CallTimelineCard.tsx`

**Fase 5 — Modais e suporte (~20 arquivos)**
- `SendWhatsAppTemplateModal.tsx`, `BulkSendTemplateModal.tsx`, `ImportContactsModal.tsx`
- `EmailComposeModal.tsx`, `EmailTemplateEditorModal.tsx`
- `settings/WhatsAppTemplatesSettings.tsx`, `AgentsSettings.tsx`, `ApiSettings.tsx`
- `settings/EmailTemplatesSettings.tsx`, `FollowupAutomationsSettings.tsx`
- `settings/AutomationsDashboard.tsx`, `SalesCoachingSettings.tsx`
- `settings/LearningInsightModal.tsx`, `LearningInsightsCard.tsx`
- `settings/PromptGeneratorSheet.tsx`, `VaultMigrationPanel.tsx`, `WhatsAppDiagnosticPanel.tsx`
- `settings/TemplateNotificationBell.tsx`
- `OnboardingWizard.tsx`, `OnboardingBanner.tsx`
- `Sidebar.tsx` (finalizar), `Team.tsx` (finalizar)
- `ActiveCallIndicator.tsx`, `AudioPlayer.tsx`, `CallConfirmationModal.tsx`, `IncomingCallModal.tsx`
- `TagSelector.tsx`, `QuickQuestionsDropdown.tsx`, `KeyboardShortcutsHelp.tsx`

### Mapeamento (mesmo das fases anteriores)

```text
bg-slate-950       → bg-background
bg-slate-900       → bg-card
bg-slate-900/50    → bg-card/50
bg-slate-800       → bg-muted
bg-slate-800/50    → bg-muted/50
text-white         → text-foreground
text-slate-50-200  → text-foreground
text-slate-300-600 → text-muted-foreground
border-slate-600-800 → border-border
border-white/5-10  → border-border
text-cyan-400/500  → text-primary
bg-cyan-500/600    → bg-primary
hover:bg-slate-700/800 → hover:bg-accent
placeholder:text-slate-* → placeholder:text-muted-foreground
```

### Preservado
- Cores de status (red, green, amber, yellow, emerald, blue)
- Gradientes decorativos (violet, fuchsia, purple, pink, rose)
- Cores de evento tipo (cyan/violet/emerald/orange em getEventTypeColor)

### Estrategia
- Processar em lotes paralelos de ~8-10 arquivos por commit
- Priorizar arquivos mais usados (Contacts, Collections, Settings) primeiro

