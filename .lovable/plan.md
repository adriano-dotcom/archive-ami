

## Configurar Cron Job para process-followups

### Problema
A Edge Function `process-followups` existe e funciona, mas não há nenhum cron job que a invoque. Resultado: nenhum follow-up automático é disparado.

### Solução
Criar um cron job via SQL (usando `cron.schedule` + `net.http_post`) que chame `process-followups` a cada 5 minutos durante o horário comercial.

### Detalhes

**Cron job a criar** (via read_query/insert, NÃO migration — contém dados sensíveis):
```sql
SELECT cron.schedule(
  'process-followups-every-5min',
  '*/5 * * * *',  -- a cada 5 minutos, 24/7
  $$
  SELECT net.http_post(
    url:='https://bbllbsbcogngjfrhhggq.supabase.co/functions/v1/process-followups',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer <anon_key>"}'::jsonb,
    body:='{"triggered_by": "cron"}'::jsonb
  ) as request_id;
  $$
);
```

A função já tem lógica interna de `active_hours` e `active_days`, então rodar a cada 5 min é seguro — ela fará skip fora do horário configurado na automação.

**Também recomendado**: Criar cron jobs para as outras funções órfãs:
- `process-scheduled-emails` — verificar e enviar emails agendados (1x por hora)
- `send-daily-callbacks` — enviar lembretes de callback (1x às 8h)
- `cleanup-queues` — limpar filas processadas (1x por dia às 3h)

### Arquivos
Nenhum arquivo modificado. Apenas execução de SQL para criar os cron jobs.

