

## Plano: Remover Lógica de Seguro de Carga (Cargo Insurance)

Remover toda a lógica de seguro de carga/ATM que é herança do CRM de seguros Jacometo. Não se aplica ao contexto OrbePet.

### Alterações

**1. `src/components/collections/installments/useInstallments.ts`**
- Remover constantes `CARGO_BRANCHES`, `CARGO_PRODUCTS`
- Remover export `isCargoInsurance`
- Remover estado `cargoOnlyFilter` das options e do filtro
- Remover `atmRiskCount` do memo
- Remover `is_cargo_insurance` do tipo `Installment.policy`

**2. `src/components/collections/InstallmentsList.tsx`**
- Remover import de `isCargoInsurance` e `Truck`
- Remover estado `cargoOnlyFilter`
- Remover função `getAtmRiskBadge`
- Remover botão "Só Carga" e uso de `atmRiskCount`
- Remover chamada `getAtmRiskBadge(inst)` na tabela
- Remover `cargoOnlyFilter` do useEffect de reset de página

**3. `supabase/functions/nina-orchestrator/index.ts`**
- Remover `CARGO_INSURANCE_KEYWORDS` e `hasExplicitCargoInterest()`
- Remover lógica de `awaiting_qualification_email` (branch de qualificação de carga)
- Remover uso de `cargo_focused_greeting` no greeting
- Remover `shouldRunCargoQualification` e lógica associada
- Manter `OUT_OF_SCOPE_INSURANCE_KEYWORDS` — pode ser útil para redirecionar leads que pedem seguros genéricos

**4. `supabase/functions/process-atm-alerts/index.ts`**
- Remover todo o conteúdo do arquivo ou simplificar para um no-op — a edge function de alertas ATM não faz sentido para OrbePet

**5. `src/components/settings/AgentsSettings.tsx`**
- Remover campo `cargo_focused_greeting` do tipo de agent e do formulário de criação

### Escopo
- 5 arquivos editados
- Nenhuma migração SQL necessária (colunas no banco ficam intactas)
- Edge functions `process-atm-alerts` será esvaziada mas não deletada

