import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Ramos SUSEP de seguro de transporte/carga
const CARGO_BRANCHES = ['309', '31', '32', '33', '0309', '031', '032', '033'];

// Produtos de seguro de carga (parcial match)
const CARGO_PRODUCTS = [
  'transportador', 'rctr', 'rctr-c', 'rc-dc', 
  'carga', 'transporte', 'embarcador'
];

interface PolicyData {
  id: string;
  policy_number: string | null;
  branch: string | null;
  product: string | null;
  is_cargo_insurance: boolean | null;
  company_id: string | null;
}

interface ContactData {
  id: string;
  name: string | null;
  phone_number: string;
  company_id: string | null;
}

interface InstallmentData {
  id: string;
  days_overdue: number | null;
  value: number;
  due_date: string;
  contact_id: string | null;
  policy_id: string | null;
  contact: ContactData | ContactData[] | null;
  policy: PolicyData | PolicyData[] | null;
}

// Helper to extract first item from potential array
function getFirst<T>(value: T[] | T | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] || null : value;
}

// Check if policy is cargo insurance
function isCargoInsurance(policy: PolicyData | null): boolean {
  if (!policy) return false;
  
  // Manual flag takes priority
  if (policy.is_cargo_insurance === true) return true;
  
  // Check branch (SUSEP codes for transport)
  if (policy.branch && CARGO_BRANCHES.includes(policy.branch)) return true;
  
  // Check product name
  if (policy.product) {
    const productLower = policy.product.toLowerCase();
    return CARGO_PRODUCTS.some(p => productLower.includes(p));
  }
  
  return false;
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

    console.log('Starting ATM alert processing...');

    // Fetch installments overdue >= 15 days (focus on 15-45 days for urgency)
    const { data: installments, error: installmentsError } = await supabase
      .from('installments')
      .select(`
        id,
        days_overdue,
        value,
        due_date,
        contact_id,
        policy_id,
        contact:contacts(id, name, phone_number, company_id),
        policy:policies(id, policy_number, branch, product, is_cargo_insurance, company_id)
      `)
      .gte('days_overdue', 15)
      .lte('days_overdue', 45)
      .in('status', ['overdue', 'pending', 'negotiating']);

    if (installmentsError) {
      throw new Error(`Failed to fetch installments: ${installmentsError.message}`);
    }

    if (!installments || installments.length === 0) {
      console.log('No installments found with 15-45 days overdue');
      return new Response(
        JSON.stringify({ success: true, processed: 0, alerts_sent: 0, message: 'No eligible installments' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${installments.length} installments with 15-45 days overdue`);

    // Filter only cargo insurance installments
    const cargoInstallments = (installments as unknown as InstallmentData[]).filter(inst => {
      const policy = getFirst(inst.policy);
      return isCargoInsurance(policy);
    });

    console.log(`Found ${cargoInstallments.length} CARGO insurance installments`);

    if (cargoInstallments.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, alerts_sent: 0, message: 'No cargo insurance installments' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check for recent ATM alerts (within 7 days) to avoid spam
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentAlerts } = await supabase
      .from('collection_attempts')
      .select('contact_id')
      .eq('channel', 'whatsapp')
      .gte('created_at', sevenDaysAgo)
      .contains('metadata', { type: 'atm_alert' });

    const recentAlertContacts = new Set(recentAlerts?.map(a => a.contact_id) || []);
    console.log(`Found ${recentAlertContacts.size} contacts with recent ATM alerts`);

    // Group by contact
    const groupedByContact = new Map<string, InstallmentData[]>();
    
    for (const inst of cargoInstallments) {
      const contact = getFirst(inst.contact);
      if (!contact || !contact.phone_number) continue;
      
      // Skip if received alert recently
      if (recentAlertContacts.has(contact.id)) continue;
      
      if (!groupedByContact.has(contact.id)) {
        groupedByContact.set(contact.id, []);
      }
      groupedByContact.get(contact.id)!.push(inst);
    }

    console.log(`Will send ATM alerts to ${groupedByContact.size} contacts`);

    // Get company info
    const companyIds = new Set<string>();
    for (const inst of cargoInstallments) {
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

    let alertsSent = 0;
    let alertsFailed = 0;
    const errors: string[] = [];

    // Process each contact
    for (const [contactId, contactInstallments] of groupedByContact) {
      // Sort by due_date to get oldest
      contactInstallments.sort((a, b) => 
        new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
      );

      const firstInstallment = contactInstallments[0];
      const contact = getFirst(firstInstallment.contact)!;
      const firstPolicy = getFirst(firstInstallment.policy);

      // Calculate totals
      const totalValue = contactInstallments.reduce((sum, inst) => sum + inst.value, 0);
      const oldestDueDate = firstInstallment.due_date;
      const policyNumber = firstPolicy?.policy_number || 'N/A';

      console.log(`Processing contact ${contact.name}: ${contactInstallments.length} cargo installments, ${formatCurrency(totalValue)}`);

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
              metadata: { origin: 'atm_alert' }
            })
            .select('id')
            .single();

          if (convError) throw new Error(`Failed to create conversation: ${convError.message}`);
          conversation = newConv;
        }

        // Get company name
        let companyName = contact.name || 'Cliente';
        const companyId = firstPolicy?.company_id || contact.company_id;
        if (companyId && companyMap.has(companyId)) {
          const company = companyMap.get(companyId)!;
          companyName = company.nome_fantasia || company.razao_social;
        }

        // Template variables for alerta_atm_15dias:
        // Header {{1}} = First name
        // Body {{1}} = Company/Contact name  
        // Body {{2}} = Policy number
        // Body {{3}} = Total value
        // Body {{4}} = Oldest due date
        const headerVariables = [getFirstName(contact.name)];
        const bodyVariables = [
          companyName,
          policyNumber,
          formatCurrency(totalValue),
          formatDate(oldestDueDate)
        ];

        console.log(`Sending ATM alert to ${contact.phone_number}`);

        // Call send-whatsapp-template
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
              template_name: 'alerta_atm_15dias',
              language: 'pt_BR',
              header_variables: headerVariables,
              variables: bodyVariables,
              is_prospecting: false
            })
          }
        );

        const sendResult = await sendResponse.json();

        if (sendResult.success) {
          // Log ATM alert attempt for each installment
          for (const inst of contactInstallments) {
            await supabase.from('collection_attempts').insert({
              contact_id: contact.id,
              installment_id: inst.id,
              channel: 'whatsapp',
              template_name: 'alerta_atm_15dias',
              message_id: sendResult.message_id,
              status: 'sent',
              sent_at: new Date().toISOString(),
              message_content: sendResult.content,
              metadata: {
                type: 'atm_alert',
                cargo_insurance: true,
                days_overdue: inst.days_overdue,
                total_value: totalValue,
                oldest_due_date: oldestDueDate,
                policy_number: policyNumber
              }
            });
          }

          alertsSent++;
          console.log(`ATM alert sent successfully to ${contact.name}`);

        } else {
          throw new Error(sendResult.error || 'Failed to send template');
        }

      } catch (error) {
        console.error(`Failed to send ATM alert to ${contactId}:`, error);
        
        // Log failed attempt
        await supabase.from('collection_attempts').insert({
          contact_id: contactId,
          installment_id: firstInstallment.id,
          channel: 'whatsapp',
          template_name: 'alerta_atm_15dias',
          status: 'failed',
          error_message: error instanceof Error ? error.message : 'Unknown error',
          metadata: {
            type: 'atm_alert',
            cargo_insurance: true
          }
        });

        alertsFailed++;
        errors.push(`${contact.name}: ${error instanceof Error ? error.message : 'Unknown'}`);
      }

      // Small delay between sends
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    console.log(`ATM alert processing completed: ${alertsSent} sent, ${alertsFailed} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        processed: cargoInstallments.length,
        contacts: groupedByContact.size,
        alerts_sent: alertsSent,
        alerts_failed: alertsFailed,
        errors: errors.length > 0 ? errors.slice(0, 10) : undefined
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in process-atm-alerts:', error);
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
