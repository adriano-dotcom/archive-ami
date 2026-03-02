

## Análise de Adequação: Projeto Atual vs. OrbePet

### O que o prompt OrbePet pede vs. o que já existe neste projeto

| Módulo OrbePet | Existe no projeto atual? | Adequação |
|---|---|---|
| **Dashboard com KPIs** | ✅ `Dashboard.tsx` com cards e gráficos | Alta — precisa trocar labels e adicionar funil de conversão |
| **Caixa de entrada (Chat)** | ✅ `ChatInterface.tsx` completo com 3 painéis | **Muito alta** — já tem lista de conversas, chat com balões, ficha de contato |
| **Perfil do contato** | ✅ `ContactDetailsDrawer.tsx` | Alta — falta aba de Plano/Pet |
| **Funil de vendas (Kanban)** | ❌ Não existe | **Precisa criar** — novo componente com drag-and-drop |
| **Templates e Scripts** | ✅ `WhatsAppTemplatesSettings.tsx` | Alta — já gerencia templates HSM |
| **Fluxos do Bot** | ❌ Não existe | **Precisa criar** — visualização de flowchart dos 4 fluxos |
| **Segurados** | ✅ `SeguradosTab.tsx` com PF/PJ | Média — precisa adaptar para pets (nome do pet, espécie, plano) |
| **Relatórios** | ⚠️ Parcial — Dashboard tem gráficos mas não há página dedicada | Precisa expandir |
| **Configurações** | ✅ `Settings.tsx` com múltiplas abas | Alta — já tem WhatsApp, equipe, API |
| **Auth com roles** | ✅ `useAuth`, `useUserRole`, `AdminRoute` | **Muito alta** — já tem admin/operator |
| **Realtime** | ✅ Mensagens e chamadas com Realtime | **Muito alta** |
| **Chamadas WhatsApp** | ✅ Completo com WebRTC | **Bônus** — OrbePet não pede, mas já existe |
| **Webhook WhatsApp** | ✅ `whatsapp-webhook` edge function | **Muito alta** |
| **Follow-up automations** | ✅ `followup_automations` table + edge functions | **Muito alta** — OrbePet pede exatamente isso |

---

### O que precisa ser **criado do zero**

1. **Funil Kanban** (`/funil`) — visualização drag-and-drop com estágios: Novo Lead → Qualificado → Proposta → Negociação → Vendido → Perdido
2. **Fluxos do Bot** (`/fluxos`) — visualização de flowchart dos 4 fluxos automáticos
3. **Tabela de Planos** (`plans`) — dados dos planos pet (Essencial/Completo/Premium) com coberturas em JSONB
4. **Tabela de Assinaturas** (`subscriptions`) — vínculo contato ↔ plano com status
5. **Página de Relatórios** (`/relatorios`) — gráficos de conversão, atendimento, retenção, receita

### O que precisa de **adaptação significativa**

1. **Identidade visual** — trocar tema cyan/slate para roxo `#6A0DAD` + fundo claro `#FAFAFA`
2. **Contatos** — adicionar campos pet: `pet_name`, `pet_species`, `pet_age`, `city`, `stage` (funil)
3. **Sidebar** — reorganizar menu para os módulos OrbePet (Dashboard, Conversas, Funil, Segurados, Templates, Fluxos, Relatórios, Config)
4. **Branding** — trocar "Jacometo / Central de Atendimento" para "OrbePet 🐾"
5. **Linguagem** — substituir termos de seguros (apólice, sinistro) por termos pet (plano, proteção, tutor)

### O que pode ser **reutilizado quase intacto**

- `ChatInterface.tsx` (90%+ reaproveitável)
- `WhatsAppCallHistoryPanel` + `IncomingCallModal`
- Todas as edge functions de WhatsApp
- `useConversations`, `useContacts`, `useAuth`
- Sistema de templates e follow-ups
- Estrutura de RLS e roles
- Sistema de notificações e badges de não-lidas

---

### Veredicto

**Adequação: ~65-70%** — O projeto atual cobre solidamente o core de CRM conversacional WhatsApp (chat, contatos, templates, automações, chamadas, auth). Os gaps principais são:

- **Funil Kanban** (componente novo)
- **Fluxos visuais do bot** (componente novo)
- **Domínio pet** (tabelas plans/subscriptions + campos pet nos contatos)
- **Rebranding visual** (tema roxo + layout claro)
- **Relatórios dedicados** (página nova)

### Recomendação

A melhor abordagem é usar **este projeto como base** no outro Lovable e fazer as adaptações incrementalmente:

1. Copiar a infraestrutura core (chat, webhook, auth, templates)
2. Aplicar rebranding OrbePet (cores, logo, linguagem)
3. Criar as tabelas `plans` e `subscriptions`
4. Adicionar campos pet à tabela `contacts`
5. Construir Funil Kanban e Fluxos do Bot como novos módulos
6. Expandir Dashboard e criar página de Relatórios

Quer que eu prepare o plano de implementação detalhado para o novo projeto OrbePet?

