

## Plano: Unificar abas Agente + Agentes em uma unica tela

### Contexto atual
- **`nina_settings`** (tab "Agente"): config global — prompt, modelo IA, horarios, delays, company_name/sdr_name, `is_active`
- **`agents`** (tab "Agentes"): lista de agentes — atualmente so tem 1 (Omega, is_default=true)
- O orchestrator checa `nina_settings.is_active` para decidir se responde WhatsApp, e carrega agentes ativos da tabela `agents`

### O que sera feito

1. **Remover tab "Agente" separada** — mover configs globais (modelo IA, horarios, delays, toggles) para dentro da tela unificada
2. **Tab unica "Agentes"** com:
   - **Status card no topo**: indicador visual se o agente esta ativo para WhatsApp (lendo `nina_settings.is_active` + `auto_response_enabled`)
   - **Configs globais** (modelo IA, horarios comerciais, delays) numa secao colapsavel ou fixa no topo
   - **Lista de agentes** da tabela `agents` (criar/editar/excluir como ja funciona)
3. **Atualizar prompt do Orbi**: substituir o `system_prompt_override` no `nina_settings` e o `system_prompt` do agente Omega pelo prompt da persona Orbi (pet)
4. **Renomear agente Omega → Orbi** na tabela `agents` e atualizar greeting_message
5. **Corrigir cores hardcoded** restantes no `AgentsSettings.tsx` (slate → tokens semanticos, como nas fases anteriores)

### Mudancas em arquivos

- **`Settings.tsx`**: remover tab "agent", renomear tab "agents" para exibir como unica
- **`AgentsSettings.tsx`**: incorporar as configs globais do `AgentSettings.tsx` (prompt, modelo, horarios, delays, company info) + status card de ativo/inativo + corrigir cores
- **`AgentSettings.tsx`**: arquivo sera removido (codigo migrado)
- **Migration SQL**: `UPDATE agents SET name='Orbi', slug='orbi', system_prompt=..., greeting_message=... WHERE is_default=true`; `UPDATE nina_settings SET sdr_name='Orbi', system_prompt_override=...`

### Status card WhatsApp
Um card no topo mostrando:
- 🟢 "Agente ativo — respondendo WhatsApp" (quando `nina_settings.is_active = true`)
- 🔴 "Agente inativo — nao responde WhatsApp" com botao para ativar
- Toggle inline para ligar/desligar

