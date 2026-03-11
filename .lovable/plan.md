

## Plano: Substituir Logo OrbePet e Limpar Referências Visuais

### Alterações

**1. Copiar o logo uploaded para `src/assets/orbepet-logo.png`**

**2. `src/pages/Auth.tsx` (linha ~245-248)**
- Substituir o emoji `🐾` pelo logo OrbePet importado como imagem
- Manter o container com backdrop blur, ajustar tamanho (~48px)

**3. `src/components/Sidebar.tsx`**
- **Logo** (linha 52-65): Substituir emoji `🐾` pela imagem do logo (~32px), remover texto `"JACOMETO SEGUROS"` e trocar por `"CRM"` 
- **LogoIcon** (linha 68-75): Substituir emoji pela imagem do logo

**4. Remover `src/assets/jacometo-logo.png`** (arquivo legado, se existir)

### Resultado
- Login page e sidebar usarão o logo real OrbePet (cachorro + gato yin-yang azul)
- Última referência textual a "JACOMETO SEGUROS" na sidebar será removida

