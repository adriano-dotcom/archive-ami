

## Plano: Criar tabela `plans` e inserir dados dos planos OrbePet

A tabela `plans` ainda não existe no banco. Preciso criar a estrutura e depois inserir os 3 planos (Essencial, Órbita Plus, Total).

### Etapa 1 — Migração: Criar tabela `plans`

Colunas baseadas no SQL enviado + campos extras do JSON (`orbi_pitch`, `whatsapp_template_name`):

| Coluna | Tipo | Notas |
|--------|------|-------|
| `id` | `text` PRIMARY KEY | IDs textuais (ex: `plan_essencial_001`) |
| `name` | `text` NOT NULL | |
| `slug` | `text` UNIQUE NOT NULL | |
| `tagline` | `text` | |
| `description` | `text` | |
| `monthly_price` | `numeric` NOT NULL DEFAULT 0 | |
| `annual_limit` | `numeric` NOT NULL DEFAULT 0 | |
| `coverage_details` | `jsonb` DEFAULT '{}' | Coberturas detalhadas |
| `benefits` | `jsonb` DEFAULT '{}' | Benefícios inclusos |
| `ideal_for` | `text[]` DEFAULT '{}' | Perfis ideais |
| `orbi_pitch` | `text` | Pitch do bot para apresentação |
| `whatsapp_template_name` | `text` | Nome do template WhatsApp |
| `color` | `text` DEFAULT '#6A0DAD' | |
| `is_active` | `boolean` DEFAULT true | |
| `sort_order` | `integer` DEFAULT 0 | |
| `reembolso_prazo_dias_uteis` | `integer` DEFAULT 10 | |
| `reembolso_via` | `text` DEFAULT 'conta_bancaria' | |
| `created_at` | `timestamptz` DEFAULT now() | |
| `updated_at` | `timestamptz` DEFAULT now() | |

RLS: leitura para usuários autenticados, gerenciamento completo para admins.

### Etapa 2 — Insert: 3 planos

Usar o insert tool para inserir os 3 registros (Essencial R$37,62, Órbita Plus R$89,82, Total R$107,82) com todos os dados de cobertura, benefícios e pitch do JSON enviado.

### Seção Técnica

```sql
-- Migration
CREATE TABLE public.plans (
  id text PRIMARY KEY,
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  tagline text,
  description text,
  monthly_price numeric NOT NULL DEFAULT 0,
  annual_limit numeric NOT NULL DEFAULT 0,
  coverage_details jsonb DEFAULT '{}',
  benefits jsonb DEFAULT '{}',
  ideal_for text[] DEFAULT '{}',
  orbi_pitch text,
  whatsapp_template_name text,
  color text DEFAULT '#6A0DAD',
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  reembolso_prazo_dias_uteis integer DEFAULT 10,
  reembolso_via text DEFAULT 'conta_bancaria',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view plans"
  ON public.plans FOR SELECT
  TO authenticated
  USING (is_authenticated_user());

CREATE POLICY "Admins can manage plans"
  ON public.plans FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));
```

Depois, 3 INSERTs via insert tool com os dados completos dos arquivos enviados.

