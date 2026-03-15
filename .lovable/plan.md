

## Landing Pages de Captura + Nutrição de Leads — Plano Completo

Este é um sistema grande. Vou dividir em fases incrementais para construir de forma sólida.

### Fase 1 — Landing Pages de Captura (prioridade)

**Nova tabela `landing_pages`:**
```text
id, slug, title, subtitle, cta_text, hero_image_url,
lead_magnet_type (ebook|guide|checklist|webinar),
lead_magnet_title, lead_magnet_file_url,
thank_you_message, is_active, utm_source, utm_campaign,
created_at, updated_at
```

**Nova tabela `lead_captures`:**
```text
id, landing_page_id, contact_id, name, email, phone,
pet_name, pet_species, lead_magnet_downloaded,
utm_source, utm_campaign, utm_content, utm_term,
created_at
```

**Rotas públicas (sem autenticação):**
- `/lp/:slug` — Página pública de captura com formulário (nome, email, WhatsApp, nome do pet)
- Design alinhado com identidade OrbePet (azul/branco, logo, fotos de pets)

**Rota admin:**
- `/landing-pages` — CRUD de landing pages no painel (criar, editar, ativar/desativar, ver leads capturados)

**Edge Function `capture-lead`:**
- Recebe dados do formulário (público, sem JWT)
- Cria/atualiza contato na tabela `contacts` com `lead_source = 'landing_page'` e UTMs
- Registra em `lead_captures`
- Dispara template WhatsApp de boas-vindas (se tiver telefone)
- Agenda email de entrega do material

### Fase 2 — Nutrição Automatizada

**Nova tabela `nurture_sequences`:**
```text
id, name, trigger_type (lead_capture|tag_added|manual),
landing_page_id, is_active, steps (jsonb[])
```

Cada step: `{ day: 1, channel: 'email'|'whatsapp', template_id, subject, content }`

**Edge Function `process-nurture` (cron diário):**
- Verifica leads capturados e avança na sequência
- Dia 0: entrega material + boas-vindas WhatsApp
- Dia 2: email com conteúdo educativo
- Dia 5: WhatsApp com depoimento/caso de sucesso
- Dia 7: email com comparativo de planos
- Dia 10: WhatsApp com oferta especial

### Fase 3 — Webhook de Compra do Site

**Edge Function `website-purchase-webhook`:**
- Endpoint público que o site orbepet.com.br chama ao processar uma compra
- Cria contato como `lead_status = 'customer'`
- Dispara template WhatsApp de boas-vindas do cliente
- Remove da sequência de nutrição (se existir)

### Fase 4 — Dashboard de Performance

- Métricas por landing page: visitas, conversões, taxa de conversão
- Funil de nutrição: quantos em cada etapa, taxa de abertura
- Integração com o funil Kanban existente

### Implementação Imediata (Fase 1)

Vou começar criando:

1. **Migração SQL** — Tabelas `landing_pages` e `lead_captures` com RLS
2. **Edge Function `capture-lead`** — Endpoint público para receber formulários
3. **Componente `LandingPagePublic`** — Página pública responsiva com formulário de captura
4. **Componente `LandingPagesAdmin`** — Painel de gestão no admin
5. **Rotas no App.tsx** — `/lp/:slug` (pública) e `/landing-pages` (protegida)
6. **Menu lateral** — Nova entrada "Landing Pages" no Sidebar

A landing page terá design profissional com: hero section, benefícios do material, formulário de captura, depoimentos, e footer com logo OrbePet. Totalmente responsiva para mobile.

