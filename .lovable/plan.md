

## Plano: Aplicar o prompt da Orbi no sistema

Nao e necessaria nenhuma mudanca de codigo. O prompt pode ser colado diretamente no campo "Prompt do Sistema" em **Configuracoes > Agente**.

### Passos
1. Ir em Configuracoes > aba Agente
2. No campo "Prompt do Sistema", colar o conteudo entre as linhas 10-243 do arquivo (a secao dentro do bloco de codigo)
3. Atualizar "Nome da Empresa" para **OrbePet**
4. Atualizar "Nome do SDR" para **Orbi**
5. Salvar

### Notas tecnicas (para a equipe)
- O campo `nina_settings.system_prompt_override` aceita texto longo, sem limite pratico
- As variaveis `{{ cliente_nome }}`, `{{ data_hora }}` ja sao substituidas pelo orchestrator — o prompt pode usa-las
- A configuracao de temperature/max_tokens deve ser ajustada na edge function `nina-orchestrator` se quiser seguir os valores recomendados (0.5 / 300 tokens)
- O modelo recomendado pode ser selecionado na UI (Flash, Pro 2.5, Pro 3 ou Adaptativo)

Se voce quiser que eu **cole o prompt automaticamente no banco** (via SQL), posso fazer isso tambem.

