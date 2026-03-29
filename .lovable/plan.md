

## Definir novo BRIDGE_SECRET

### Ação
Gerar e configurar um novo `BRIDGE_SECRET` seguro para autenticação da Edge Function `mission-control-data`.

### Passos

1. **Gerar valor seguro**: Um token aleatório de 64 caracteres (hex) será gerado
2. **Configurar como secret**: Usar a ferramenta `add_secret` para salvar o novo valor como `BRIDGE_SECRET` no projeto
3. **Entregar ao usuário**: Fornecer o valor para configuração nos scripts do Mac

### Variáveis para os scripts

Após a configuração, você usará nos scripts do Mac:

```text
export ORBE_SUPABASE_URL="https://bbllbsbcogngjfrhhggq.supabase.co"
export ORBE_BRIDGE_SECRET="<valor_gerado>"
```

### Teste

```bash
curl -s -X POST "$ORBE_SUPABASE_URL/functions/v1/mission-control-data" \
  -H "Authorization: Bearer $ORBE_BRIDGE_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"view":"support_daily"}' | jq .
```

### Nenhum arquivo modificado
Apenas atualização do secret via ferramenta interna.

