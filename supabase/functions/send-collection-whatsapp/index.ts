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

// Count expected params from template text
function countExpectedParams(text?: string | null): number {
  if (!text) return 0;
  const matches = [...text.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])).filter((n) => Number.isFinite(n));
  return matches.length ? Math.max(...matches) : 0;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // --- Authorization: require admin/operator (or internal service role) ---
    const authHeader = req.headers.get('Authorization') || '';
    const isServiceRole = authHeader === `Bearer ${supabaseKey}`;
    if (!isServiceRole) {
      const token = authHeader.replace('Bearer ', '');
      if (!token) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const authClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData, error: userErr } = await authClient.auth.getUser(token);
      if (userErr || !userData?.user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data: roles } = await supabase
        .from('user_roles').select('role').eq('user_id', userData.user.id);
      const allowed = (roles || []).some((r: { role: string }) => r.role === 'admin' || r.role === 'operator');
      if (!allowed) {
        return new Response(JSON.stringify({ error: 'Forbidden - requires admin or operator role' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

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
      .select('contact_id')
      .eq('channel', 'whatsapp')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .in('status', ['sent', 'delivered']);

    const recentSentContacts = new Set(recentAttempts?.map(a => a.contact_id) || []);

    // ============ GROUP INSTALLMENTS BY CONTACT ============
    // Consolidate multiple installments from same company into one message
    const groupedByContact = new Map<string, InstallmentWithRelations[]>();
    
    for (const inst of installments as unknown as InstallmentWithRelations[]) {
      const contact = getFirst(inst.contact);
      if (!contact || !contact.phone_number) continue;
      
      const key = contact.id;
      if (!groupedByContact.has(key)) {
        groupedByContact.set(key, []);
      }
      groupedByContact.get(key)!.push(inst);
    }

    console.log(`Grouped ${installments.length} installments into ${groupedByContact.size} contacts`);

    let sentCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    // Update batch status to processing
    await supabase
      .from('collection_batches')
      .update({ 
        status: 'processing',
        started_at: new Date().toISOString(),
        total_count: groupedByContact.size
      })
      .eq('id', batch_id);

    // Process each contact group (consolidated)
    for (const [contactId, contactInstallments] of groupedByContact) {
      // Skip if already sent to this contact in last 24h
      if (recentSentContacts.has(contactId)) {
        console.log(`Skipping contact ${contactId}: already sent in last 24h`);
        continue;
      }

      // Skip if already sent to this contact in this batch
      if (sentContactIds.has(contactId)) {
        console.log(`Skipping contact ${contactId}: already sent in this batch`);
        continue;
      }

      // Sort by due_date (oldest first) to get first policy
      contactInstallments.sort((a, b) => 
        new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
      );

      const firstInstallment = contactInstallments[0];
      const contact = getFirst(firstInstallment.contact)!;
      const firstPolicy = getFirst(firstInstallment.policy);

      // Calculate consolidated values
      const totalValue = contactInstallments.reduce((sum, inst) => sum + inst.value, 0);
      const oldestDueDate = firstInstallment.due_date;
      const firstPolicyNumber = firstPolicy?.policy_number;
      const installmentCount = contactInstallments.length;

      console.log(`Contact ${contact.name}: ${installmentCount} installments, total=${formatCurrency(totalValue)}, oldest=${oldestDueDate}`);

      try {
        // Get or create conversation
        let { data: conversation } = await supabase
          .from('conversations')
          .select('id')
          .eq('contact_id', contact.id)
          .eq('is_active', true)
          .order('created_at', { ascending: true })
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
        const companyId = firstPolicy?.company_id || contact.company_id;
        if (companyId && companyMap.has(companyId)) {
          const company = companyMap.get(companyId)!;
          companyName = company.nome_fantasia || company.razao_social;
        }

        // Fetch template to determine expected body variables
        const { data: templateInfo } = await supabase
          .from('whatsapp_templates')
          .select('components')
          .eq('name', template_name)
          .eq('language', language)
          .eq('status', 'APPROVED')
          .single();

        const tplBody = templateInfo?.components?.find((c: any) => c.type === 'BODY');
        const expectedBodyVars = countExpectedParams(tplBody?.text);

        console.log(`Template ${template_name} expects ${expectedBodyVars} body variables`);

        // Map template variables with CONSOLIDATED data:
        // Header {{1}} = First name
        const headerVariables = [getFirstName(contact.name)];
        
        // Body variables - DYNAMIC based on template:
        // If 3 vars (pessoa física): apólice, valor, vencimento
        // If 4 vars (pessoa jurídica): empresa, apólice, valor, vencimento
        let bodyVariables: string[];

        if (expectedBodyVars === 3) {
          // Template pessoa física: apenas apólice, valor, vencimento
          bodyVariables = [
            firstPolicyNumber || 'N/A',     // {{1}} - Apólice
            formatCurrency(totalValue),      // {{2}} - Valor
            formatDate(oldestDueDate)        // {{3}} - Vencimento
          ];
          console.log(`Using PF format (3 vars): ${bodyVariables.join(', ')}`);
        } else if (expectedBodyVars === 4) {
          // Template empresa: empresa, apólice, valor, vencimento
          bodyVariables = [
            companyName,                     // {{1}} - Empresa
            firstPolicyNumber || 'N/A',      // {{2}} - Apólice
            formatCurrency(totalValue),      // {{3}} - Valor
            formatDate(oldestDueDate)        // {{4}} - Vencimento
          ];
          console.log(`Using PJ format (4 vars): ${bodyVariables.join(', ')}`);
        } else {
          // Fallback: try to match expected count
          const allVars = [companyName, firstPolicyNumber || 'N/A', formatCurrency(totalValue), formatDate(oldestDueDate)];
          bodyVariables = allVars.slice(0, Math.max(expectedBodyVars, 1));
          console.log(`Using fallback format (${expectedBodyVars} vars): ${bodyVariables.join(', ')}`);
        }

        console.log(`Sending consolidated message to ${contact.phone_number}: ${installmentCount} installments, value=${formatCurrency(totalValue)}`);

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
          // Log attempt for EACH installment in the group (for tracking)
          // Include full installment data in metadata so history is preserved even after deletion
          for (const inst of contactInstallments) {
            const instPolicy = getFirst(inst.policy);
            await supabase.from('collection_attempts').insert({
              batch_id,
              contact_id: contact.id,
              installment_id: inst.id,
              channel: 'whatsapp',
              template_name,
              message_id: sendResult.message_id,
              status: 'sent',
              sent_at: new Date().toISOString(),
              message_content: sendResult.content,
              metadata: {
                consolidated: true,
                installments_count: installmentCount,
                total_value: totalValue,
                oldest_due_date: oldestDueDate,
                // Preserve installment data for history
                installment_data: {
                  installment_number: inst.installment_number,
                  value: inst.value,
                  due_date: inst.due_date,
                  days_overdue: inst.days_overdue,
                  policy_number: instPolicy?.policy_number || null,
                  insurer: instPolicy?.insurer || null
                },
                contact_name: contact.name,
                company_name: companyName
              }
            });
          }

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
        console.error(`Failed to send to contact ${contactId}:`, error);
        
        const firstPolicy = getFirst(firstInstallment.policy);
        // Log failed attempt for first installment - include installment data for history
        await supabase.from('collection_attempts').insert({
          batch_id,
          contact_id: contactId,
          installment_id: firstInstallment.id,
          channel: 'whatsapp',
          template_name,
          status: 'failed',
          error_message: error instanceof Error ? error.message : 'Unknown error',
          metadata: {
            consolidated: true,
            installments_count: installmentCount,
            total_value: totalValue,
            // Preserve installment data for history
            installment_data: {
              installment_number: firstInstallment.installment_number,
              value: firstInstallment.value,
              due_date: firstInstallment.due_date,
              days_overdue: firstInstallment.days_overdue,
              policy_number: firstPolicy?.policy_number || null,
              insurer: firstPolicy?.insurer || null
            },
            contact_name: contact.name
          }
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
