

## Atualizar Reembolso: Consultas e Exames Veterinários

### Contexto
O sistema de reembolso é para **tutores de pets** que pagaram consultas ou exames veterinários e solicitam reembolso do plano de saúde pet. Não é "refund de e-commerce".

### Mudanças

**1. Database — Adicionar coluna `claim_type`**
```sql
ALTER TABLE reimbursement_claims 
  ADD COLUMN claim_type text DEFAULT 'consulta';
-- Valores: 'consulta', 'exame', 'cirurgia', 'internacao', 'outro'
```
Atualizar a view `orbe_reembolsos_v` para incluir `claim_type`.

**2. Edge Function `receive-ecommerce-webhook`**
- No evento `refund_request`, aceitar campo `claim_type` (consulta, exame, etc.)
- Salvar na coluna `claim_type` da `reimbursement_claims`
- Atualizar descrição padrão para "Reembolso de {tipo} veterinário(a)"

**3. UI — `ReimbursementFunnel.tsx`**
- Adicionar `claim_type` ao tipo `ReimbursementClaim` e à query
- Mostrar badge colorido no card com o tipo (🩺 Consulta, 🔬 Exame, etc.)
- Adicionar filtro por tipo no topo (tabs ou dropdown)
- KPI adicional: breakdown por tipo

**4. Textos e labels**
- Trocar referências genéricas para contexto veterinário (tutor, pet, clínica, consulta/exame)

