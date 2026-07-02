import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Company {
  id: string;
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  city: string | null;
  state: string | null;
  contacts_count: number;
  billing_contacts_count: number;
  policies_count: number;
  overdue_value: number;
  max_days_overdue: number;
  seller_id: string | null;
  seller_name: string | null;
}

export interface SeguradoSubscription {
  plan_name?: string;
  monthly_amount?: number;
  monthly_amount_formatted?: string;
  payment_method?: string;
  started_at?: string;
}

export interface Lead {
  id: string;
  name: string | null;
  phone_number: string;
  email: string | null;
  cpf: string | null;
  cnpj: string | null;
  city: string | null;
  state: string | null;
  lead_status: string | null;
  lead_source: string | null;
  tags: string[] | null;
  created_at: string;
  last_activity: string | null;
}

export interface SeguradoPF {
  id: string;
  name: string | null;
  phone_number: string;
  email: string | null;
  cpf: string | null;
  city: string | null;
  state: string | null;
  lead_source?: string | null;
  policies_count: number;
  insurers: string[];
  overdue_value: number;
  max_days_overdue: number;
  subscription?: SeguradoSubscription | null;
  pet_name?: string | null;
}

// Helper para detectar se nome parece ser de empresa
const isCompanyName = (name: string | null): boolean => {
  if (!name) return false;
  const upperName = name.toUpperCase();
  const companyIndicators = ['LTDA', 'S/A', 'S.A.', ' SA ', ' ME', 'EIRELI', 'EPP', 'TRANSPORTES', 'TRANSPORTE', 'LOGISTICA', 'LOGÍSTICA', 'COMERCIO', 'COMÉRCIO', 'INDUSTRIA', 'INDÚSTRIA', 'SERVICOS', 'SERVIÇOS', 'DISTRIBUIDORA', 'ATACADO', 'METALURGICA', 'METALÚRGICA', 'CONSTRUTORA', 'ENGENHARIA', 'LOCADORA', 'AGROPECUARIA', 'AGROPECUÁRIA', 'SUCATAO', 'SUCATÃO', 'METAIS'];
  return companyIndicators.some(ind => upperName.includes(ind));
};

// Fetch companies with optimized batch queries
async function fetchCompaniesOptimized(): Promise<Company[]> {
  // 1. Fetch all companies in one query
  const { data: companiesData, error } = await supabase
    .from('companies')
    .select(`
      id,
      cnpj,
      razao_social,
      nome_fantasia,
      city,
      state,
      seller_id,
      sellers!companies_seller_id_fkey (
        name
      )
    `)
    .order('razao_social');

  if (error) throw error;
  if (!companiesData || companiesData.length === 0) return [];

  const companyIds = companiesData.map(c => c.id);

  // 2. Fetch all contacts counts in batch - ONE query
  const { data: allContacts } = await supabase
    .from('contacts')
    .select('company_id, is_billing_contact')
    .in('company_id', companyIds);

  // 3. Fetch all policies in batch - ONE query
  const { data: allPolicies } = await supabase
    .from('policies')
    .select('id, company_id')
    .in('company_id', companyIds);

  // 4. Fetch all overdue installments in ONE query
  const policyIds = allPolicies?.map(p => p.id) || [];
  const { data: allInstallments } = policyIds.length > 0
    ? await supabase
        .from('installments')
        .select('policy_id, value, days_overdue')
        .in('policy_id', policyIds)
        .in('status', ['overdue', 'pending'])
        .gt('days_overdue', 0)
    : { data: [] };

  // 5. Build lookup maps for O(1) access
  const contactsByCompany = new Map<string, { total: number; billing: number }>();
  allContacts?.forEach(c => {
    if (!c.company_id) return;
    const existing = contactsByCompany.get(c.company_id) || { total: 0, billing: 0 };
    existing.total++;
    if (c.is_billing_contact) existing.billing++;
    contactsByCompany.set(c.company_id, existing);
  });

  const policiesByCompany = new Map<string, string[]>();
  allPolicies?.forEach(p => {
    if (!p.company_id) return;
    const existing = policiesByCompany.get(p.company_id) || [];
    existing.push(p.id);
    policiesByCompany.set(p.company_id, existing);
  });

  const policyToCompany = new Map<string, string>();
  allPolicies?.forEach(p => {
    if (p.company_id) policyToCompany.set(p.id, p.company_id);
  });

  const overdueByCompany = new Map<string, { value: number; maxDays: number }>();
  allInstallments?.forEach(i => {
    if (!i.policy_id) return;
    const companyId = policyToCompany.get(i.policy_id);
    if (!companyId) return;
    const existing = overdueByCompany.get(companyId) || { value: 0, maxDays: 0 };
    existing.value += Number(i.value) || 0;
    existing.maxDays = Math.max(existing.maxDays, i.days_overdue || 0);
    overdueByCompany.set(companyId, existing);
  });

  // 6. Build enriched companies
  return companiesData.map(company => {
    const contacts = contactsByCompany.get(company.id) || { total: 0, billing: 0 };
    const policies = policiesByCompany.get(company.id) || [];
    const overdue = overdueByCompany.get(company.id) || { value: 0, maxDays: 0 };

    return {
      id: company.id,
      cnpj: company.cnpj,
      razao_social: company.razao_social,
      nome_fantasia: company.nome_fantasia,
      city: company.city,
      state: company.state,
      seller_id: company.seller_id,
      seller_name: (company as any).sellers?.name || null,
      contacts_count: contacts.total,
      billing_contacts_count: contacts.billing,
      policies_count: policies.length,
      overdue_value: overdue.value,
      max_days_overdue: overdue.maxDays
    };
  });
}

// Fetch segurados PF with optimized batch queries
async function fetchSeguradosPFOptimized(): Promise<SeguradoPF[]> {
  // 1. Fetch all contacts without company - ONE query
  const { data: contacts, error } = await supabase
    .from('contacts')
    .select(`
      id,
      name,
      phone_number,
      email,
      cpf,
      city,
      state,
      lead_source,
      lead_status,
      client_memory
    `)
    .is('company_id', null)
    .order('name');

  if (error) throw error;
  if (!contacts || contacts.length === 0) return [];

  // Filter out company names early
  const validContacts = contacts.filter(c => !isCompanyName(c.name));
  const contactIds = validContacts.map(c => c.id);

  // 2. Fetch all policies for these contacts - ONE query
  const { data: allPolicies } = await supabase
    .from('policies')
    .select('id, contact_id, insurer')
    .in('contact_id', contactIds);

  // 3. Build policy lookup
  const policiesByContact = new Map<string, { ids: string[]; insurers: Set<string> }>();
  allPolicies?.forEach(p => {
    if (!p.contact_id) return;
    const existing = policiesByContact.get(p.contact_id) || { ids: [], insurers: new Set() };
    existing.ids.push(p.id);
    if (p.insurer) existing.insurers.add(p.insurer);
    policiesByContact.set(p.contact_id, existing);
  });

  // 4. Fetch all overdue installments in ONE query
  const allPolicyIds = allPolicies?.map(p => p.id) || [];
  const { data: allInstallments } = allPolicyIds.length > 0
    ? await supabase
        .from('installments')
        .select('policy_id, value, days_overdue')
        .in('policy_id', allPolicyIds)
        .in('status', ['overdue', 'pending'])
        .gt('days_overdue', 0)
    : { data: [] };

  // 5. Build installment lookup by policy -> contact
  const policyToContact = new Map<string, string>();
  allPolicies?.forEach(p => {
    if (p.contact_id) policyToContact.set(p.id, p.contact_id);
  });

  const overdueByContact = new Map<string, { value: number; maxDays: number }>();
  allInstallments?.forEach(i => {
    if (!i.policy_id) return;
    const contactId = policyToContact.get(i.policy_id);
    if (!contactId) return;
    const existing = overdueByContact.get(contactId) || { value: 0, maxDays: 0 };
    existing.value += Number(i.value) || 0;
    existing.maxDays = Math.max(existing.maxDays, i.days_overdue || 0);
    overdueByContact.set(contactId, existing);
  });

  // 6. Filter and build enriched segurados
  return validContacts
    .filter(contact => {
      const hasPolicies = policiesByContact.has(contact.id);
      const isCobrancaImport = contact.lead_source === 'import_cobranca';
      const isCustomer = (contact as any).lead_status === 'customer';
      const hasSubscription = !!((contact as any).client_memory?.subscription?.plan_name);
      const isEcommerce = contact.lead_source === 'ecommerce';
      return hasPolicies || isCobrancaImport || isCustomer || hasSubscription || isEcommerce;
    })
    .map(contact => {
      const policies = policiesByContact.get(contact.id) || { ids: [], insurers: new Set() };
      const overdue = overdueByContact.get(contact.id) || { value: 0, maxDays: 0 };
      const memory = (contact as any).client_memory || {};
      const subscription = memory.subscription || null;
      const petName = memory.pet_profile?.name || memory.pet?.name || null;

      return {
        id: contact.id,
        name: contact.name,
        phone_number: contact.phone_number,
        email: contact.email,
        cpf: contact.cpf,
        city: contact.city,
        state: contact.state,
        lead_source: contact.lead_source,
        policies_count: policies.ids.length,
        insurers: [...policies.insurers],
        overdue_value: overdue.value,
        max_days_overdue: overdue.maxDays,
        subscription,
        pet_name: petName,
      };
    });
}

// Fetch all segurados data (companies + PF)
export async function fetchSeguradosData() {
  const [companies, seguradosPF] = await Promise.all([
    fetchCompaniesOptimized(),
    fetchSeguradosPFOptimized()
  ]);
  return { companies, seguradosPF };
}

// Main hook with cache
export function useSeguradosData() {
  return useQuery({
    queryKey: ['segurados-data'],
    queryFn: fetchSeguradosData,
    staleTime: 5 * 60 * 1000, // 5 minutes - data is considered fresh
    gcTime: 30 * 60 * 1000, // 30 minutes - keep in cache
    refetchOnWindowFocus: false, // Don't refetch on tab focus
  });
}

// Hook to prefetch segurados data
export function usePrefetchSeguradosData() {
  const queryClient = useQueryClient();
  
  return () => {
    queryClient.prefetchQuery({
      queryKey: ['segurados-data'],
      queryFn: fetchSeguradosData,
      staleTime: 5 * 60 * 1000,
    });
  };
}

// Hook to invalidate cache (for use after mutations)
export function useInvalidateSeguradosData() {
  const queryClient = useQueryClient();
  
  return () => {
    queryClient.invalidateQueries({ queryKey: ['segurados-data'] });
  };
}
