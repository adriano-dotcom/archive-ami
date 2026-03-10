

## Plano: Base de Conhecimento com PDFs de Condições Gerais

### Contexto
Hoje o `nina-orchestrator` monta o prompt do agente usando: system_prompt do agente + memória do cliente + parcelas + histórico. Não existe nenhuma base de conhecimento de produtos. Precisamos criar uma forma de armazenar o conteúdo dos PDFs e injetá-lo no contexto do agente.

### Abordagem Recomendada: Tabela Estruturada + Texto Extraído

Como são apenas ~3 produtos, a abordagem mais simples e eficaz é:

1. **Criar tabela `product_knowledge`** no banco com campos:
   - `id`, `name` (nome do produto), `insurer` (seguradora), `summary` (resumo curto), `full_content` (texto completo extraído do PDF), `source_file_url` (link do PDF no storage), `is_active`, `created_at`, `updated_at`

2. **Criar interface no painel de Configurações** (nova aba "Produtos"):
   - Upload de PDF → armazenar no bucket `whatsapp-media` (pasta `product-docs/`)
   - Extrair texto do PDF via IA (Gemini) ao fazer upload
   - CRUD dos documentos de produto (nome, seguradora, conteúdo editável)

3. **Integrar no nina-orchestrator**:
   - Antes de chamar a IA, buscar todos os `product_knowledge` ativos
   - Injetar o conteúdo como contexto adicional no `buildEnhancedPrompt`
   - Como são poucos produtos (~3), o texto cabe no contexto do modelo

### Por que NÃO usar RAG (pgvector)?
- Com apenas 3 documentos, o overhead de embeddings e busca semântica não compensa
- O conteúdo total dos 3 PDFs cabe dentro da janela de contexto do Gemini 2.5 Flash
- Abordagem mais simples = menos pontos de falha

### Tarefas de Implementação

1. **Migration SQL**: Criar tabela `product_knowledge` com RLS
2. **Edge function `extract-product-text`**: Recebe PDF do storage, extrai texto via Gemini
3. **Componente `ProductKnowledgeSettings`**: Aba em Configurações para upload/gerenciamento
4. **Atualizar `nina-orchestrator`**: Buscar e injetar conteúdo dos produtos no prompt

### Detalhes Técnicos

```text
Fluxo de Upload:
  Admin faz upload PDF → Storage (whatsapp-media/product-docs/)
                       → Edge function extrai texto do PDF
                       → Salva na tabela product_knowledge (full_content)

Fluxo de Resposta:
  Mensagem recebida → nina-orchestrator busca product_knowledge
                    → Injeta no system prompt como contexto
                    → Agente responde com base no conteúdo real
```

