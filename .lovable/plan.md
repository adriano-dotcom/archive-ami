

## Aperfeiçoar o Criador de Landing Pages de Alta Conversão

Transformar o formulário atual (um dialog pequeno com campos básicos) em um editor completo e visual, com suporte a personalização de benefícios, depoimentos, imagem hero, cores e preview ao vivo.

### 1. Migração de Banco de Dados

Adicionar novas colunas à tabela `landing_pages`:

```sql
ALTER TABLE landing_pages
  ADD COLUMN IF NOT EXISTS primary_color text DEFAULT '#6A0DAD',
  ADD COLUMN IF NOT EXISTS secondary_color text DEFAULT '#F3E8FF',
  ADD COLUMN IF NOT EXISTS button_style text DEFAULT 'rounded',
  ADD COLUMN IF NOT EXISTS header_text text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS footer_text text DEFAULT NULL;
```

Criar bucket de storage para imagens das landing pages:

```sql
INSERT INTO storage.buckets (id, name, public) VALUES ('landing-pages', 'landing-pages', true);

CREATE POLICY "Anyone can view landing page images"
ON storage.objects FOR SELECT USING (bucket_id = 'landing-pages');

CREATE POLICY "Authenticated users can upload landing page images"
ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'landing-pages');

CREATE POLICY "Authenticated users can update landing page images"
ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'landing-pages');

CREATE POLICY "Authenticated users can delete landing page images"
ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'landing-pages');
```

### 2. Novo Editor Full-Page (`LandingPagesAdmin.tsx`)

Substituir o dialog pequeno por uma página de edição em tela cheia com abas:

- **Aba "Conteúdo"**: Título, subtítulo, CTA, material, agradecimento (campos existentes)
- **Aba "Benefícios"**: Editor dinâmico de cards (ícone, título, descrição) com adicionar/remover/reordenar
- **Aba "Depoimentos"**: Editor de depoimentos (nome, texto, avatar) com adicionar/remover
- **Aba "Aparência"**: Cor primária (color picker), cor secundária, estilo de botão (rounded/square/pill), upload de imagem hero
- **Aba "Preview"**: Renderização em tempo real da landing page com os dados do formulário, exibida em um iframe ou componente inline

### 3. Upload de Imagem Hero

- Usar o novo bucket `landing-pages` para upload de imagens
- Componente de upload com preview da imagem dentro da aba "Aparência"
- Salvar a URL pública no campo `hero_image_url` que já existe na tabela

### 4. Editor de Benefícios e Depoimentos

- Array dinâmico no formulário com botões para adicionar/remover itens
- Seletor de ícone para benefícios (shield, heart, star, paw, check, award)
- Os dados são salvos nos campos JSON `benefits` e `testimonials` já existentes

### 5. Personalização de Cores e Tema

- Input tipo color para cor primária e secundária
- Select para estilo de botão
- Salvar nas novas colunas `primary_color`, `secondary_color`, `button_style`

### 6. Atualizar `LandingPagePublic.tsx`

- Ler as novas colunas e aplicar as cores dinamicamente via CSS custom properties
- Renderizar depoimentos da base em vez de ignorá-los
- Exibir imagem hero quando `hero_image_url` estiver preenchido
- Usar `button_style` para variações do CTA

### Arquivos Modificados
- `src/components/landing-pages/LandingPagesAdmin.tsx` — editor completo com abas
- `src/components/landing-pages/LandingPagePublic.tsx` — renderizar personalizações
- Nova migração SQL — colunas + bucket de storage

