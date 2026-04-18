
User wants to wipe all dynamic data (chats, contacts/tutors, conversations, messages, queues, funnel data) to start fresh. This is similar to the previous cleanup done at project start (memory: data-cleanup-reset).

Tables to clean (dynamic operational data):
- messages
- conversations
- conversation_states
- contacts (tutores)
- companies
- call_logs
- ecommerce_orders
- installments
- installment_history
- collection_attempts
- collection_batches
- collection_email_logs
- followup_logs
- lead_captures
- lead_nurture_enrollments
- appointments
- learning_insights
- nina_processing_queue
- message_processing_queue
- message_grouping_queue
- send_queue (if exists)
- import_logs
- import_audit_logs

Preserve (structural/config):
- agents, nina_settings, plans, subscriptions
- user_roles, team_members, pending_invites
- followup_automations, email_templates, whatsapp_templates
- landing_pages, nurture_sequences, campaigns
- import_mappings

I'll present a concise plan with confirmation needed since this is destructive.
