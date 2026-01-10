-- Remover tabelas de deals e pipelines (ordem correta por dependências)
DROP TABLE IF EXISTS deal_activities CASCADE;
DROP TABLE IF EXISTS deals CASCADE;
DROP TABLE IF EXISTS pipeline_stages CASCADE;
DROP TABLE IF EXISTS pipelines CASCADE;
DROP TABLE IF EXISTS callback_assignments CASCADE;