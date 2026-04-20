

## Mostrar plano vendido e valor/mês na lista de Tutores

### Problema
Na rota `/tutores`, a coluna **Planos** mostra apenas `0` para tutores vendidos via Orbe Plano Pet, porque conta `policies` (apólices legadas) e ignora a `subscription` gravada em `contacts.client_memory`.

### Mudanças

**1. `src/hooks/useSeguradosData.ts`** — propagar dados da assinatura

Adicionar ao tipo `SeguradoPF` e ao retorno de `fetchSeguradosPFOptimized`:
```ts
subscription?: {
  plan_name?: string;
  monthly_amount?: number;
  monthly_amount_formatted?: string;
  payment_method?: string;
  started_at?: string;
} | null;
pet_name?: string | null;
```
- Ler de `contact.client_memory?.subscription` (já vem na query, basta passar adiante).
- Ler `pet_name` de `client_memory?.pet_profile?.name` ou coluna `pet_name` se existir (verificar; fallback null).

**2. `src/components/segurados/SeguradosPFTable.tsx`** — renderizar coluna Planos rica

Espelhando o estilo da 2ª imagem (cliente):
- Quando `segurado.subscription?.plan_name` existir, a célula da coluna **Planos** mostra:
  ```
  Órbita Plus
  R$ 89,82 / mês
  ```
  com badge verde sutil (`bg-green-500/10 text-green-400`) e ícone `Sparkles`.
- Se não houver subscription mas houver `policies_count > 0`: manter o número atual.
- Se ambos forem zero: mostrar `-` em cinza (em vez do `0` atual, que confunde).

Atualizar também a interface `SeguradoPF` local da tabela para incluir `subscription` opcional.

**3. Ordenação da coluna Planos**
Ajustar `case 'apolices'` para ordenar por `policies_count + (subscription ? 1 : 0)` — assim tutores com plano ativo sobem.

### Fora de escopo (não mexer agora)
- Pet name na coluna Tutor: a 2ª imagem mostra coluna **Pet** separada. Posso adicionar numa próxima iteração se quiser; hoje a tabela não tem essa coluna e adicioná-la exige reflow do header.
- Coluna "Valor/Mês" separada: optei por embutir o valor abaixo do plano para não quebrar o layout atual de 7 colunas.

### Resultado esperado

Para `Gabriel Seguchi Goes` (vendido, plano Órbita Plus R$ 89,82) a coluna **Planos** passa a mostrar:

```
✨ Órbita Plus
R$ 89,82 / mês
```

em vez de `0`.

