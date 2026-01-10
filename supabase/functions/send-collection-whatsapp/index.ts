import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CollectionSendRequest {
  batch_id: string;
  template_name: string;
  language?: string;
  installment_ids?: string[];
  filters?: {
    range?: string;
    min_days?: number;
    max_days?: number;
    status?: string[];
  };
  delay_between_ms?: number;
}

interface ContactData {
  id: string;
  name: string | null;
  phone_number: string;
  company_id: string | null;
}

interface PolicyData {
  id: string;
  policy_number: string | null;
  insurer: string | null;
  company_id: string | null;
}

interface InstallmentWithRelations {
  id: string;
  installment_number: number;
  value: number;
  due_date: string;
  days_overdue: number | null;
  status: string;
  contact_id: string | null;
  policy_id: string | null;
  contact: ContactData[] | ContactData | null;
  policy: PolicyData[] | PolicyData | null;
}

// Helper to extract first item from potential array
function getFirst<T>(value: T[] | T | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] || null : value;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value);
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('pt-BR');
}

function getFirstName(fullName: string | null): string {
  if (!fullName) return 'Cliente';
  return fullName.split(' ')[0];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body: CollectionSendRequest = await req.json();
    const { 
      batch_id, 
      template_name, 
      language = 'pt_BR', 
      installment_ids,
      filters,
      delay_between_ms = 2000 
    } = body;

    console.log(`Starting collection WhatsApp campaign: batch=${batch_id}, template=${template_name}`);

    // Build query for installments
    let query = supabase
      .from('installments')
      .select(`
        id,
        installment_number,
        value,
        due_date,
        days_overdue,
        status,
        contact_id,
        policy_id,
        contact:contacts(id, name, phone_number, company_id),
        policy:policies(id, policy_number, insurer, company_id)
      `);

    // Apply filters
    if (installment_ids && installment_ids.length > 0) {
      query = query.in('id', installment_ids);
    } else if (filters) {
      query = query.in('status', filters.status || ['overdue', 'negotiating']);
      
      if (filters.range) {
        switch (filters.range) {
          case '1-30':
            query = query.gte('days_overdue', 1).lte('days_overdue', 30);
            break;
          case '31-60':
            query = query.gte('days_overdue', 31).lte('days_overdue', 60);
            break;
          case '61-90':
            query = query.gte('days_overdue', 61).lte('days_overdue', 90);
            break;
          case '90+':
            query = query.gt('days_overdue', 90);
            break;
        }
      }
      
      if (filters.min_days !== undefined) {
        query = query.gte('days_overdue', filters.min_days);
      }
      if (filters.max_days !== undefined) {
        query = query.lte('days_overdue', filters.max_days);
      }
    }

    const { data: installments, error: installmentsError } = await query;

    if (installmentsError) {
      throw new Error(`Failed to fetch installments: ${installmentsError.message}`);
    }

    if (!installments || installments.length === 0) {
      return new Response(
        JSON.stringify({ success: true, sent: 0, failed: 0, message: 'No installments to process' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${installments.length} installments to process`);

    // Get company info for all relevant companies
    const companyIds = new Set<string>();
    for (const inst of installments as unknown as InstallmentWithRelations[]) {
      const contact = getFirst(inst.contact);
      const policy = getFirst(inst.policy);
      if (contact?.company_id) companyIds.add(contact.company_id);
      if (policy?.company_id) companyIds.add(policy.company_id);
    }

    const { data: companies } = await supabase
      .from('companies')
      .select('id, razao_social, nome_fantasia')
      .in('id', Array.from(companyIds));

    const companyMap = new Map(companies?.map(c => [c.id, c]) || []);

    // Track sent contacts to avoid duplicates
    const sentContactIds = new Set<string>();
    
    // Check for recent sends (within 24h) to avoid spam
    const { data: recentAttempts } = await supabase
      .from('collection_attempts')
      .select('contact_id, installment_id')
      .eq('channel', 'whatsapp')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .in('status', ['sent', 'delivered']);

    const recentSentMap = new Set(recentAttempts?.map(a => `${a.contact_id}-${a.installment_id}`) || []);

    let sentCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    // Update batch status to processing
    await supabase
      .from('collection_batches')
      .update({ 
        status: 'processing',
        started_at: new Date().toISOString(),
        total_count: installments.length
      })
      .eq('id', batch_id);

    // Process each installment
    for (const installment of installments as unknown as InstallmentWithRelations[]) {
      const contact = getFirst(installment.contact);
      const policy = getFirst(installment.policy);
      
      if (!contact || !contact.phone_number) {
        console.log(`Skipping installment ${installment.id}: no contact or phone`);
        failedCount++;
        continue;
      }

      // Skip if already sent to this contact-installment in last 24h
      const key = `${contact.id}-${installment.id}`;
      if (recentSentMap.has(key)) {
        console.log(`Skipping ${key}: already sent in last 24h`);
        continue;
      }

      // Skip if already sent to this contact in this batch
      if (sentContactIds.has(contact.id)) {
        console.log(`Skipping contact ${contact.id}: already sent in this batch`);
        continue;
      }

      try {
        // Get or create conversation
        let { data: conversation } = await supabase
          .from('conversations')
          .select('id')
          .eq('contact_id', contact.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!conversation) {
          const { data: newConv, error: convError } = await supabase
            .from('conversations')
            .insert({
              contact_id: contact.id,
              status: 'nina',
              is_active: true,
              metadata: { origin: 'cobranca' }
            })
            .select('id')
            .single();

          if (convError) {
            throw new Error(`Failed to create conversation: ${convError.message}`);
          }
          conversation = newConv;
        }

        // Get company name
        let companyName = contact.name || 'Cliente';
        const companyId = policy?.company_id || contact.company_id;
        if (companyId && companyMap.has(companyId)) {
          const company = companyMap.get(companyId)!;
          companyName = company.nome_fantasia || company.razao_social;
        }

        // Map template variables:
        // Header {{1}} = First name
        // Body {{1}} = Company/Contact name
        // Body {{2}} = Policy number
        // Body {{3}} = Value formatted
        // Body {{4}} = Due date formatted
        const headerVariables = [getFirstName(contact.name)];
        const bodyVariables = [
          companyName,
          policy?.policy_number || 'N/A',
          formatCurrency(installment.value),
          formatDate(installment.due_date)
        ];

        console.log(`Sending to ${contact.phone_number}: header=${headerVariables}, body=${bodyVariables}`);

        // Call send-whatsapp-template function
        const sendResponse = await fetch(
          `${supabaseUrl}/functions/v1/send-whatsapp-template`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              contact_id: contact.id,
              conversation_id: conversation.id,
              template_name,
              language,
              header_variables: headerVariables,
              variables: bodyVariables,
              is_prospecting: false
            })
          }
        );

        const sendResult = await sendResponse.json();

        if (sendResult.success) {
          // Log attempt
          await supabase.from('collection_attempts').insert({
            batch_id,
            contact_id: contact.id,
            installment_id: installment.id,
            channel: 'whatsapp',
            template_name,
            message_id: sendResult.message_id,
            status: 'sent',
            sent_at: new Date().toISOString(),
            message_content: sendResult.content
          });

          sentCount++;
          sentContactIds.add(contact.id);

          // Update batch counters
          await supabase
            .from('collection_batches')
            .update({ sent_count: sentCount })
            .eq('id', batch_id);

        } else {
          throw new Error(sendResult.error || 'Unknown error');
        }

      } catch (error) {
        console.error(`Failed to send to contact ${contact.id}:`, error);
        
        // Log failed attempt
        await supabase.from('collection_attempts').insert({
          batch_id,
          contact_id: contact.id,
          installment_id: installment.id,
          channel: 'whatsapp',
          template_name,
          status: 'failed',
          error_message: error instanceof Error ? error.message : 'Unknown error'
        });

        failedCount++;
        errors.push(`${contact.name || contact.phone_number}: ${error instanceof Error ? error.message : 'Unknown error'}`);

        // Update batch counters
        await supabase
          .from('collection_batches')
          .update({ failed_count: failedCount })
          .eq('id', batch_id);
      }

      // Delay between sends to avoid rate limiting
      if (delay_between_ms > 0) {
        await new Promise(resolve => setTimeout(resolve, delay_between_ms));
      }
    }

    // Update batch as completed
    await supabase
      .from('collection_batches')
      .update({ 
        status: 'completed',
        completed_at: new Date().toISOString(),
        sent_count: sentCount,
        failed_count: failedCount
      })
      .eq('id', batch_id);

    console.log(`Campaign completed: ${sentCount} sent, ${failedCount} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        sent: sentCount,
        failed: failedCount,
        errors: errors.length > 0 ? errors.slice(0, 10) : undefined
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in send-collection-whatsapp:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
