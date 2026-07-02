DELETE FROM send_queue WHERE conversation_id IN (SELECT id FROM conversations WHERE contact_id IN (SELECT id FROM contacts WHERE phone_number IN ('5543900000191','5543900000192')));
DELETE FROM nina_processing_queue WHERE conversation_id IN (SELECT id FROM conversations WHERE contact_id IN (SELECT id FROM contacts WHERE phone_number IN ('5543900000191','5543900000192')));
DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE contact_id IN (SELECT id FROM contacts WHERE phone_number IN ('5543900000191','5543900000192')));
DELETE FROM conversations WHERE contact_id IN (SELECT id FROM contacts WHERE phone_number IN ('5543900000191','5543900000192'));
DELETE FROM contacts WHERE phone_number IN ('5543900000191','5543900000192');