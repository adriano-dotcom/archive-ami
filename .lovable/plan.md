## Objetivo
1. Garantir que todos os rótulos visíveis e placeholders das telas de cadastro usem a terminologia Jacometo/Iris (seguro de cargas).
2. Excluir a página/rota de Reembolsos (`/reembolsos`).

## Situação atual (verificada)
A maioria das telas de cadastro já foi convertida em rodadas anteriores:
- `EditContactModal.tsx`: segmentos já exibem "🚛 Transportador (ETC)" e "🏢 Embarcador / Transportadora".
- `ContactProfilePanel.tsx` e `ContactDetailsDrawer.tsx`: campo já rotulado "Tipo de Carga" com placeholder "Ex.: carga geral, frigorificada, granel".
- `SeguradosTab` / tabelas: rótulos já em "Transportador / Empresa / Apólices".

Resta apenas 1 rótulo pet visível em tela de cadastro + a remoção de Reembolsos.

## Mudanças

### 1. Corrigir rótulo remanescente no cadastro
- `src/components/contacts/VirtualizedContactsTable.tsx` (linha 154): tooltip "Cliente ativo (tutor)" → "Cliente ativo".

### 2. Remover a página de Reembolsos
- `src/App.tsx`: remover o `lazy(() => import('./components/ReimbursementFunnel'))` e a `<Route path="/reembolsos" ... />`.
- `src/components/Sidebar.tsx`: remover o item de navegação `{ id: 'reembolsos', label: 'Reembolsos', icon: ReceiptText, ... }` e o import não utilizado do ícone `ReceiptText` (se ficar órfão).
- Excluir o arquivo `src/components/ReimbursementFunnel.tsx`.

### 3. Limpeza de texto visível (opcional, mesma família)
- `src/components/Reports.tsx`: remover o emoji 🐾 do texto "Conversões, atendimento, retenção e receita 🐾".

## Observações técnicas
- Valores de banco legados (`pet_tutor`, `clinica_petshop`, `pet_name`) são mantidos por compatibilidade — apenas os textos exibidos mudam.
- A rota `/reembolsos` não é referenciada em outros pontos além de App/Sidebar; a remoção é segura.
- Após a remoção, verifico o build para confirmar que não restaram imports órfãos.

## Fora de escopo
Textos pet em telas que não são de cadastro (e-mail, mídia, landing pages, automações de settings) não serão alterados aqui, salvo se você quiser incluí-los.