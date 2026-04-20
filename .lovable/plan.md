
## Mostrar plano e mensalidade no card "Vendido" do funil

### Onde alterar
`src/components/SalesFunnel.tsx` → componente `FunnelCard` (linhas 62–135).

### O dado já existe
Quando uma compra entra pelo webhook `receive-ecommerce-webhook`, gravamos em `contacts.client_memory.subscription`:
```ts
{
  plan_name: "Órbita Plus",
  monthly_amount: 89.82,
  monthly_amount_formatted: "R$ 89,82",
  payment_method: "cartao",
  started_at: "...",
  order_id: "..."
}
```
O `FunnelCard` já lê `client_memory` (linha 69). Falta só renderizar.

### O que muda no card

Quando `contact.lead_status === 'customer'` E existir `client_memory.subscription`, adicionar um bloco visível logo abaixo da linha de telefone/tempo:

```text
┌─────────────────────────────┐
│ GA  Gabriel Seguchi Goes    │
│ 📞 (41) 99559-0302  🕐 1d   │
│ ┌─────────────────────────┐ │
│ │ ✨ Órbita Plus          │ │  ← novo bloco
│ │ R$ 89,82 / mês • Cartão │ │
│ └─────────────────────────┘ │
│ [score] [tags]              │
└─────────────────────────────┘
```

Estilo: badge destacado com `bg-green-500/10 border-green-500/30 text-green-600` para combinar com a coluna "Vendido". Ícone de selo/estrela (`Sparkles` do lucide). Forma de pagamento traduzida (`cartao` → "Cartão", `pix_mensal` → "PIX mensal", `pix_anual` → "PIX anual").

### Snippet a inserir (após a linha de telefone/tempo, antes do bloco de score)

```tsx
const subscription = clientMemory?.subscription;
const paymentLabels: Record<string, string> = {
  cartao: 'Cartão',
  pix_mensal: 'PIX mensal',
  pix_anual: 'PIX anual',
  cartao_credito: 'Cartão',
  pix: 'PIX',
};

{subscription?.plan_name && (
  <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-green-500/10 border border-green-500/30">
    <Sparkles className="w-3 h-3 text-green-600 shrink-0" />
    <div className="min-w-0 flex-1">
      <p className="text-[11px] font-semibold text-green-600 truncate">
        {subscription.plan_name}
      </p>
      <p className="text-[10px] text-green-600/80 truncate">
        {subscription.monthly_amount_formatted ||
          (subscription.monthly_amount
            ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
                .format(subscription.monthly_amount)
            : '—')}
        {' / mês'}
        {subscription.payment_method && ` • ${paymentLabels[subscription.payment_method] ?? subscription.payment_method}`}
      </p>
    </div>
  </div>
)}
```

E adicionar `Sparkles` ao import de `lucide-react` (linha 4).

### Bônus opcional (sem custo extra)
- Mostrar o mesmo bloco também na coluna **Negociação** se a venda já tiver sido registrada (caso raro de status fora de sincronia).
- Se `subscription.started_at` existir, exibir tooltip "Cliente desde DD/MM/AAAA" no hover do badge.

Posso seguir só com o bloco principal (sem bônus) se preferir manter mínimo.
