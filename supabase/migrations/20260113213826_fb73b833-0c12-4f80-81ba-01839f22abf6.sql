-- Preencher assigned_user_name nas conversas existentes que tem assigned_user_id mas nome NULL
UPDATE conversations c
SET assigned_user_name = tm.name
FROM team_members tm
WHERE c.assigned_user_id = tm.id
AND c.assigned_user_name IS NULL;