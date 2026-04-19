
Plano: atualizar `orbe_plans_catalog` com os dados oficiais das 3 tabelas enviadas e desativar o "Essencial". Os dados vão alimentar automaticamente o prompt do Orbi via `nina-orchestrator` (já lê `coverages`, `limits_per_event`, `annual_limit`, `waiting_period_days`, `max_pet_age_years`).

## Mudanças

### 1. Desativar plano antigo
- `Essencial` → `is_active = false`

### 2. Atualizar `Órbita Plus` (limite anual R$ 3.300)
- `monthly_price`: manter R$ 89,82 (não consta nas tabelas; ajusto se você passar)
- `annual_limit`: 3300
- `max_pet_age_years`: 10
- `coverages`: ["Consulta veterinária", "Atendimento ambulatorial", "Transporte do pet ao veterinário", "Consulta com especialista", "Exames laboratoriais e imagem", "Cirurgias", "Assistência funeral", "Aplicação de vacina (1x/ano)", "Concierge: envio de ração, leva-e-traz, indicação de banho e tosa", "Tag localizadora", "Clube de vantagens", "Teleconsulta pet ilimitada"]
- `limits_per_event` (com valor + carência por item):
  ```
  consulta_veterinaria: {valor: 200, carencia_dias: 30}
  atendimento_ambulatorial: {valor: 300, carencia_dias: 30}
  transporte_veterinario: {valor: 150, carencia_dias: 30}
  consulta_especialista: {valor: 200, carencia_dias: 30}
  exames_laboratoriais_imagem: {valor: 350, carencia_dias: 60}
  cirurgias: {valor: 1000, carencia_dias: 60}
  assistencia_funeral: {valor: 1000, carencia_dias: 30}
  vacina: {valor: 150, carencia_dias: 60, limite: "1 atendimento/ano"}
  concierge: {valor: "sem limite - custo do cliente", carencia_dias: 0, observacao: "24h"}
  ```

### 3. Renomear/atualizar `Total` → `Órbita Total` (limite anual R$ 4.200)
- `plan_name`: "Órbita Total"
- `annual_limit`: 4200
- `max_pet_age_years`: 10
- `coverages`: lista equivalente + "Internação", "Castração"
- `limits_per_event`:
  ```
  consulta_veterinaria: {valor: 250, carencia_dias: 30}
  atendimento_ambulatorial: {valor: 300, carencia_dias: 30}
  transporte_veterinario: {valor: 100, carencia_dias: 30}
  exames_laboratoriais_imagem: {valor: 500, carencia_dias: 60}
  consulta_especialista: {valor: 200, carencia_dias: 30}
  cirurgias: {valor: 1000, carencia_dias: 60}
  internacao: {valor: 200, carencia_dias: 60}
  assistencia_funeral: {valor: 1000, carencia_dias: 30}
  vacina: {valor: 150, carencia_dias: 60, limite: "1 atendimento/ano"}
  castracao: {valor: 500, carencia_dias: 180}
  concierge: {valor: "sem limite - custo do cliente", carencia_dias: 0}
  ```

### 4. Atualizar `Órbita Galáxia` (limite anual R$ 6.000)
- `annual_limit`: 6000
- `max_pet_age_years`: 10
- `coverages`: cobertura completa incluindo "Transporte em caso de localização", "Transporte e hotel para o pet (acidente/enfermidade do tutor)", "Acupuntura e fisioterapia", "Limpeza de cálculo dentário", "Castração"
- `limits_per_event`:
  ```
  consulta_veterinaria: {valor: 200, carencia_dias: 30}
  atendimento_ambulatorial: {valor: 350, carencia_dias: 30}
  transporte_veterinario: {valor: 100, carencia_dias: 30}
  exames_laboratoriais_imagem: {valor: 500, carencia_dias: 60}
  transporte_localizacao: {valor: 100, carencia_dias: 30}
  cirurgias: {valor: 1000, carencia_dias: 60}
  transporte_hotel_pet: {valor: 100, carencia_dias: 30}
  internacao: {valor: 1000, carencia_dias: 60}
  acupuntura_fisioterapia: {valor: 500, carencia_dias: 180, limite: "1/ano"}
  assistencia_funeral: {valor: 1000, carencia_dias: 30}
  vacina: {valor: 150, carencia_dias: 60, limite: "1/ano"}
  limpeza_dentaria: {valor: 500, carencia_dias: 180, limite: "1/ano"}
  castracao: {valor: 500, carencia_dias: 180}
  concierge: {valor: "sem limite - custo do cliente", carencia_dias: 0}
  ```

### 5. Regras gerais (em todos os 3 planos)
- `preexisting_conditions_rule`: "Doenças preexistentes possuem carência de 12 meses para qualquer serviço dos planos."
- Acrescentar nota global no prompt do Orbi via `nina-orchestrator`: "Limite anual é o teto financeiro do plano; cada serviço respeita também o limite por evento e a carência."

### 6. Ajuste no prompt builder (`nina-orchestrator/index.ts`)
Atualizar o bloco que serializa `limits_per_event` para suportar o novo formato com objeto `{valor, carencia_dias, limite, observacao}` em vez de só número, exibindo algo como:
```
- Consulta veterinária: R$ 200 (carência 30 dias)
- Vacina: R$ 150 (carência 60 dias, 1 atendimento/ano)
```
Também passar a exibir `preexisting_conditions_rule` quando presente.

## Pendências antes de executar

1. **Preços mensais**: as imagens não trazem `monthly_price`. Mantenho os atuais (Plus R$ 89,82 / Total R$ 107,82 / Galáxia R$ 138,32) ou você passa os novos?
2. **Idade máxima**: o cabeçalho diz "até 10 anos". Mantenho 10 para todos (hoje Plus/Total estão em 12 e Galáxia em 14)?

Posso executar com os defaults atuais (preços mantidos, idade ajustada para 10 conforme PDFs) assim que aprovado.
