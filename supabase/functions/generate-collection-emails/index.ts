import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GenerateEmailsRequest {
  batchId?: string;
  filters: {
    status?: string[];
    minDays?: number;
    maxDays?: number;
    range?: string;
    installmentIds?: string[];
  };
  emailTone: 'friendly' | 'reminder' | 'urgent' | 'final';
}

interface InstallmentData {
  id: string;
  installment_number: number;
  value: number;
  due_date: string;
  days_overdue: number;
  policy_id: string | null;
  contact_id: string;
  policies?: Array<{
    insurer: string;
    product: string | null;
  }> | null;
}

interface ContactWithInstallments {
  contactId: string;
  contactName: string;
  email: string;
  companyName: string;
  companyCnpj: string;
  companyId: string | null;
  installments: InstallmentData[];
  totalValue: number;
}

// Format CNPJ: 12345678000199 -> 12.345.678/0001-99
const formatCnpj = (cnpj: string | null): string => {
  if (!cnpj) return 'N/A';
  const cleaned = cnpj.replace(/\D/g, '');
  if (cleaned.length !== 14) return cnpj;
  return cleaned.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
};

const getToneInstructions = (tone: string): string => {
  switch (tone) {
    case 'friendly':
      return 'Tom amigável e acolhedor. Primeiro contato. Ofereça ajuda para regularizar.';
    case 'reminder':
      return 'Tom profissional de lembrete. Seja direto mas cordial.';
    case 'urgent':
      return 'Tom de urgência. Enfatize os riscos de não regularizar.';
    case 'final':
      return 'Tom sério e formal. Último aviso antes de ações mais severas.';
    default:
      return 'Tom profissional e cordial.';
  }
};

// Helper function to get time-based greeting in Brasília timezone
const getTimeGreeting = (): string => {
  const now = new Date();
  const brasiliaOffset = -3;
  const utcHours = now.getUTCHours();
  const brasiliaHours = (utcHours + brasiliaOffset + 24) % 24;
  
  if (brasiliaHours >= 6 && brasiliaHours < 12) return "Bom dia";
  if (brasiliaHours >= 12 && brasiliaHours < 18) return "Boa tarde";
  return "Boa noite";
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableApiKey) {
      throw new Error("LOVABLE_API_KEY não configurada");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { filters, emailTone, batchId }: GenerateEmailsRequest = await req.json();

    console.log("Generating collection emails with filters:", filters, "tone:", emailTone);

    // Build query for overdue installments
    let query = supabase
      .from('installments')
      .select(`
        id,
        installment_number,
        value,
        due_date,
        days_overdue,
        policy_id,
        contact_id,
        policies (
          insurer,
          product
        )
      `);

    // If specific installment IDs are provided, use those directly
    if (filters.installmentIds && filters.installmentIds.length > 0) {
      console.log(`Filtering by ${filters.installmentIds.length} specific installment IDs`);
      query = query.in('id', filters.installmentIds);
    } else {
      // Apply status filter
      query = query.in('status', filters.status || ['overdue', 'negotiating']);

      // Apply range filter
      if (filters.range && filters.range !== 'all') {
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
      } else if (filters.minDays !== undefined || filters.maxDays !== undefined) {
        if (filters.minDays !== undefined) {
          query = query.gte('days_overdue', filters.minDays);
        }
        if (filters.maxDays !== undefined) {
          query = query.lte('days_overdue', filters.maxDays);
        }
      }
    }

    const { data: installments, error: installmentsError } = await query;

    if (installmentsError) {
      throw installmentsError;
    }

    if (!installments || installments.length === 0) {
      return new Response(
        JSON.stringify({ 
          generated: [], 
          skipped: 0, 
          errors: [],
          message: "Nenhuma parcela encontrada com os filtros especificados"
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${installments.length} installments`);

    // Get unique contact IDs and policy IDs for company lookup
    const contactIds = [...new Set(installments.map(i => i.contact_id).filter(Boolean))];
    const policyIds = [...new Set(installments.map(i => i.policy_id).filter(Boolean))];

    // Fetch contacts with email, company_id and cnpj for fallback
    const { data: contacts, error: contactsError } = await supabase
      .from('contacts')
      .select('id, name, call_name, email, company, company_id, cnpj')
      .in('id', contactIds);

    if (contactsError) {
      throw contactsError;
    }

    // Fetch policies with company_id to get company info
    const { data: policies } = await supabase
      .from('policies')
      .select('id, company_id')
      .in('id', policyIds);

    // Get unique company IDs from contacts and policies
    const companyIdsFromContacts = (contacts || []).map(c => c.company_id).filter(Boolean);
    const companyIdsFromPolicies = (policies || []).map(p => p.company_id).filter(Boolean);
    const allCompanyIds = [...new Set([...companyIdsFromContacts, ...companyIdsFromPolicies])];

    // Fetch companies with seller info
    const { data: companies } = await supabase
      .from('companies')
      .select('id, razao_social, nome_fantasia, cnpj, seller_id')
      .in('id', allCompanyIds);

    const companiesMap = new Map((companies || []).map(c => [c.id, c]));

    // Helper function to find email by company_id
    async function findEmailByCompanyId(companyId: string, contactName: string): Promise<{ email: string; contactName: string } | null> {
      // Try billing contact first
      const { data: billingContact } = await supabase
        .from('contacts')
        .select('name, call_name, email')
        .eq('company_id', companyId)
        .eq('is_billing_contact', true)
        .not('email', 'is', null)
        .limit(1)
        .single();

      if (billingContact?.email) {
        console.log(`Found billing contact email for company ${companyId}`);
        // Prioritize the found contact's name (call_name first, then name)
        return { 
          email: billingContact.email, 
          contactName: billingContact.call_name || billingContact.name || 'Cliente' 
        };
      }

      // Try any contact with email from same company
      const { data: anyContact } = await supabase
        .from('contacts')
        .select('name, call_name, email')
        .eq('company_id', companyId)
        .not('email', 'is', null)
        .limit(1)
        .single();

      if (anyContact?.email) {
        console.log(`Found related contact email for company ${companyId}`);
        // Prioritize the found contact's name (call_name first, then name)
        return { 
          email: anyContact.email, 
          contactName: anyContact.call_name || anyContact.name || 'Cliente' 
        };
      }

      return null;
    }

    // Validate email format
    const isValidEmail = (email: string): boolean => {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    };

    // Helper function to resolve email through company relationships
    async function resolveContactEmail(contact: any): Promise<{ email: string; contactName: string } | null> {
      const contactName = contact.name || contact.call_name || 'Cliente';

      // 1. Direct email on contact (only if valid format)
      if (contact.email && isValidEmail(contact.email)) {
        return { email: contact.email, contactName };
      }

      if (contact.email && !isValidEmail(contact.email)) {
        console.log(`Invalid email format for contact ${contact.id}: ${contact.email}`);
      }

      // 2. Search by company_id if available
      if (contact.company_id) {
        const result = await findEmailByCompanyId(contact.company_id, contactName);
        if (result) return result;
      }

      // 3. Fallback: If no company_id but has CNPJ, find company by CNPJ
      if (!contact.company_id && contact.cnpj) {
        console.log(`Trying CNPJ fallback for contact ${contact.id} with CNPJ ${contact.cnpj}`);
        
        const { data: company } = await supabase
          .from('companies')
          .select('id, razao_social')
          .eq('cnpj', contact.cnpj)
          .limit(1)
          .single();

        if (company?.id) {
          console.log(`Found company ${company.razao_social} by CNPJ ${contact.cnpj}`);
          const result = await findEmailByCompanyId(company.id, contactName);
          if (result) return result;
        }
      }

      return null;
    }

    // Group installments by contact
    const contactsWithInstallments: ContactWithInstallments[] = [];
    const skippedContacts: string[] = [];

    for (const contact of contacts || []) {
      const resolved = await resolveContactEmail(contact);
      
      if (!resolved) {
        console.log(`No email found for contact ${contact.id} (${contact.name || contact.company || 'unknown'})`);
        skippedContacts.push(contact.id);
        continue;
      }

      const contactInstallments = installments.filter(i => i.contact_id === contact.id);
      const totalValue = contactInstallments.reduce((sum, i) => sum + (i.value || 0), 0);

      // Get company info - PRIORITY: from policies first (correct company for the installments being collected)
      let company = null;
      
      // 1. First try to get company from one of the installment's policies
      const policyId = contactInstallments.find(i => i.policy_id)?.policy_id;
      if (policyId) {
        const policy = policies?.find(p => p.id === policyId);
        if (policy?.company_id) {
          company = companiesMap.get(policy.company_id);
          console.log(`Resolving company for contact ${contact.id} (${contact.name || 'unnamed'})`);
          console.log(`  - Using company from policy: ${company?.razao_social || 'not found'} (policy_id: ${policyId})`);
        }
      }
      
      // 2. Fallback to contact's company_id only if no policy company found
      if (!company && contact.company_id) {
        company = companiesMap.get(contact.company_id);
        console.log(`Resolving company for contact ${contact.id} (${contact.name || 'unnamed'})`);
        console.log(`  - Fallback to contact company: ${company?.razao_social || 'not found'} (company_id: ${contact.company_id})`);
      }

      const companyName = company?.nome_fantasia || company?.razao_social || contact.company || 'N/A';
      const companyCnpj = company?.cnpj || contact.cnpj || '';
      
      console.log(`  - Final company: ${companyName} (CNPJ: ${companyCnpj || 'none'})`);

      contactsWithInstallments.push({
        contactId: contact.id,
        contactName: resolved.contactName,
        email: resolved.email,
        companyName,
        companyCnpj,
        companyId: company?.id || contact.company_id || null,
        installments: contactInstallments as InstallmentData[],
        totalValue
      });
    }

    console.log(`Processing ${contactsWithInstallments.length} contacts with email, skipped ${skippedContacts.length}`);

    // Fetch seller info for all companies from sellers table
    const companyIds = [...new Set(contactsWithInstallments.map(c => c.companyId).filter(Boolean))];
    const sellerIds = [...new Set(
      companyIds.map(cid => companiesMap.get(cid)?.seller_id).filter(Boolean)
    )];

    let sellersMap = new Map<string, { name: string; email: string | null }>();
    if (sellerIds.length > 0) {
      const { data: sellers } = await supabase
        .from('sellers')
        .select('id, name, email')
        .in('id', sellerIds);
      
      sellersMap = new Map((sellers || []).map(s => [s.id, { name: s.name, email: s.email }]));
    }

    // Generate emails using AI
    const generatedEmails: any[] = [];
    const errors: any[] = [];

    for (const contactData of contactsWithInstallments) {
      try {
        const installmentsTable = contactData.installments.map(i => {
          const insurer = Array.isArray(i.policies) ? i.policies[0]?.insurer : (i.policies as any)?.insurer;
          return `| ${insurer || 'N/A'} | ${i.installment_number} | R$ ${i.value.toFixed(2)} | ${new Date(i.due_date).toLocaleDateString('pt-BR')} | ${i.days_overdue} dias |`;
        }).join('\n');

        const timeGreeting = getTimeGreeting();
        
        const prompt = `Você é um assistente de cobrança da Jacometo Seguros.
Gere um email de cobrança com ${getToneInstructions(emailTone)}

DADOS DO SEGURADO:
- Nome do Contato: ${contactData.contactName}
- Empresa: ${contactData.companyName}
- CNPJ: ${formatCnpj(contactData.companyCnpj)}
- Email: ${contactData.email}

PARCELAS EM ABERTO:
| Seguradora | Parcela | Valor | Vencimento | Atraso |
|------------|---------|-------|------------|--------|
${installmentsTable}

TOTAL: R$ ${contactData.totalValue.toFixed(2)}

REGRAS:
1. COMECE o email com a saudação: "${timeGreeting}, ${contactData.contactName}!"
2. Logo após a saudação, MENCIONE a empresa e o CNPJ formatado, ex: "Referente à empresa ${contactData.companyName} (CNPJ: ${formatCnpj(contactData.companyCnpj)})"
3. Liste TODAS as parcelas em uma tabela HTML bonita e responsiva COM A SEGURADORA de cada parcela
4. Mostre o total consolidado em destaque
5. Use estilo profissional com cores corporativas (azul marinho #1e3a5f)
6. Inclua chamada para ação clara para regularização
7. Tom: ${emailTone === 'friendly' ? 'amigável' : emailTone === 'reminder' ? 'lembrete cordial' : emailTone === 'urgent' ? 'urgente' : 'aviso final'}
8. SEM emojis
9. Assinatura: Jacometo Seguros - Equipe de Cobrança

Retorne APENAS um JSON válido no formato:
{"subject": "assunto do email", "body_html": "HTML completo do email"}`;

        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${lovableApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "user", content: prompt }
            ],
            temperature: 0.7,
          }),
        });

        if (!aiResponse.ok) {
          const errorText = await aiResponse.text();
          console.error(`AI error for contact ${contactData.contactId}:`, errorText);
          errors.push({ contactId: contactData.contactId, error: "Erro na geração do email" });
          continue;
        }

        const aiData = await aiResponse.json();
        const content = aiData.choices?.[0]?.message?.content || "";

        // Parse the JSON from AI response
        let emailData;
        try {
          // Try to extract JSON from the response
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            emailData = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error("No JSON found in response");
          }
        } catch (parseError) {
          console.error(`Parse error for contact ${contactData.contactId}:`, parseError);
          errors.push({ contactId: contactData.contactId, error: "Erro ao processar resposta da IA" });
          continue;
        }

        // Get seller info for this contact's company
        let sellerEmail: string | undefined;
        let sellerName: string | undefined;
        if (contactData.companyId) {
          const company = companiesMap.get(contactData.companyId);
          if (company?.seller_id) {
            const seller = sellersMap.get(company.seller_id);
            if (seller?.email) {
              sellerEmail = seller.email;
              sellerName = seller.name;
            }
          }
        }

        generatedEmails.push({
          contactId: contactData.contactId,
          contactName: contactData.contactName,
          email: contactData.email,
          subject: emailData.subject,
          bodyHtml: emailData.body_html,
          installments: contactData.installments.map(i => ({
            id: i.id,
            value: i.value,
            dueDate: i.due_date,
            daysOverdue: i.days_overdue
          })),
          totalValue: contactData.totalValue,
          installmentCount: contactData.installments.length,
          sellerEmail,
          sellerName
        });

      } catch (error: any) {
        console.error(`Error generating email for contact ${contactData.contactId}:`, error);
        errors.push({ contactId: contactData.contactId, error: error?.message || 'Unknown error' });
      }
    }

    console.log(`Generated ${generatedEmails.length} emails, ${errors.length} errors, ${skippedContacts.length} skipped`);

    return new Response(
      JSON.stringify({
        generated: generatedEmails,
        skipped: skippedContacts.length,
        errors,
        batchId
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error in generate-collection-emails:", error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
