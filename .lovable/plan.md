

## Editar Campos do Formulário e Cores de Fundo

### O que será feito

1. **Editor de campos do formulário** — Na aba "Conteúdo" (ou nova aba "Formulário"), permitir ativar/desativar quais campos aparecem no formulário da LP (nome, email, WhatsApp, nome do pet). O banco já tem a coluna `form_fields` (jsonb, default `["name","email","phone","pet_name"]`).

2. **Cores de fundo** — Na aba "Aparência", adicionar color pickers para cor de fundo da hero section e cor de fundo das seções (benefícios, etc.), além das cores primária/secundária que já existem.

### Mudanças

**Migração SQL** — Adicionar 2 colunas à tabela `landing_pages`:
- `hero_bg_color text default '#FFFFFF'`
- `section_bg_color text default '#F9FAFB'`

**`LandingPageEditor.tsx`**:
- Adicionar `form_fields` e as 2 novas cores ao tipo `LandingPageForm` e `emptyForm`
- Na aba "Conteúdo", adicionar seção "Campos do Formulário" com checkboxes para cada campo (nome, email, whatsapp, nome do pet), onde email é obrigatório
- Na aba "Aparência", adicionar pickers para `hero_bg_color` e `section_bg_color`
- Incluir `form_fields`, `hero_bg_color`, `section_bg_color` no payload de save
- Carregar esses valores no `openEdit` do `LandingPagesAdmin.tsx`
- Atualizar o `LivePreview` para usar as cores de fundo

**`LandingPagePublic.tsx`**:
- Carregar `form_fields` do banco e renderizar condicionalmente apenas os campos selecionados
- Usar `hero_bg_color` e `section_bg_color` nos estilos inline das seções

**`LandingPagesAdmin.tsx`**:
- Passar `form_fields` no `openEdit`

### Arquivos modificados
- `src/components/landing-pages/LandingPageEditor.tsx`
- `src/components/landing-pages/LandingPagePublic.tsx`
- `src/components/landing-pages/LandingPagesAdmin.tsx`
- Nova migração SQL (2 colunas)

