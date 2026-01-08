import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, User, Search, Filter, RefreshCw } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CompaniesTable } from './CompaniesTable';
import { SeguradosPFTable } from './SeguradosPFTable';
import { supabase } from '@/integrations/supabase/client';
import { api } from '@/services/api';
import { toast } from 'sonner';

interface Company {
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
}

interface SeguradoPF {
  id: string;
  name: string | null;
  phone_number: string;
  email: string | null;
  cpf: string | null;
  city: string | null;
  state: string | null;
  policies_count: number;
  insurers: string[];
  overdue_value: number;
  max_days_overdue: number;
}

export const SeguradosTab: React.FC = () => {
  const navigate = useNavigate();
  const [activeSubTab, setActiveSubTab] = useState<'pj' | 'pf'>('pj');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [seguradosPF, setSeguradosPF] = useState<SeguradoPF[]>([]);

  const loadCompanies = async () => {
    try {
      // Fetch companies with aggregated data
      const { data: companiesData, error } = await supabase
        .from('companies')
        .select(`
          id,
          cnpj,
          razao_social,
          nome_fantasia,
          city,
          state
        `)
        .order('razao_social');

      if (error) throw error;

      // For each company, get counts and overdue data
      const enrichedCompanies = await Promise.all(
        (companiesData || []).map(async (company) => {
          // Get contacts count
          const { count: contactsCount } = await supabase
            .from('contacts')
            .select('*', { count: 'exact', head: true })
            .eq('company_id', company.id);

          // Get billing contacts count
          const { count: billingCount } = await supabase
            .from('contacts')
            .select('*', { count: 'exact', head: true })
            .eq('company_id', company.id)
            .eq('is_billing_contact', true);

          // Get policies count
          const { count: policiesCount } = await supabase
            .from('policies')
            .select('*', { count: 'exact', head: true })
            .eq('company_id', company.id);

          // Get overdue installments data
          const { data: installments } = await supabase
            .from('installments')
            .select('value, days_overdue, policy_id')
            .in('status', ['overdue', 'pending'])
            .gt('days_overdue', 0);

          // Filter installments by company policies
          const { data: companyPolicies } = await supabase
            .from('policies')
            .select('id')
            .eq('company_id', company.id);

          const policyIds = new Set((companyPolicies || []).map(p => p.id));
          const companyInstallments = (installments || []).filter(i => policyIds.has(i.policy_id));

          const overdueValue = companyInstallments.reduce((sum, i) => sum + (Number(i.value) || 0), 0);
          const maxDaysOverdue = Math.max(0, ...companyInstallments.map(i => i.days_overdue || 0));

          return {
            ...company,
            contacts_count: contactsCount || 0,
            billing_contacts_count: billingCount || 0,
            policies_count: policiesCount || 0,
            overdue_value: overdueValue,
            max_days_overdue: maxDaysOverdue
          };
        })
      );

      setCompanies(enrichedCompanies);
    } catch (error) {
      console.error('Error loading companies:', error);
      toast.error('Erro ao carregar empresas');
    }
  };

  const loadSeguradosPF = async () => {
    try {
      // Fetch contacts that are NOT linked to companies but have policies
      const { data: contacts, error } = await supabase
        .from('contacts')
        .select(`
          id,
          name,
          phone_number,
          email,
          cpf,
          city,
          state
        `)
        .is('company_id', null)
        .order('name');

      if (error) throw error;

      // For each contact, check if they have policies and get overdue data
      const enrichedSegurados = await Promise.all(
        (contacts || []).map(async (contact) => {
          // Get policies for this contact
          const { data: policies, error: policiesError } = await supabase
            .from('policies')
            .select('id, insurer')
            .eq('contact_id', contact.id);

          if (policiesError || !policies || policies.length === 0) {
            return null; // Skip contacts without policies
          }

          const policyIds = policies.map(p => p.id);
          const insurers = [...new Set(policies.map(p => p.insurer))];

          // Get overdue installments
          const { data: installments } = await supabase
            .from('installments')
            .select('value, days_overdue')
            .in('policy_id', policyIds)
            .in('status', ['overdue', 'pending'])
            .gt('days_overdue', 0);

          const overdueValue = (installments || []).reduce((sum, i) => sum + (Number(i.value) || 0), 0);
          const maxDaysOverdue = Math.max(0, ...(installments || []).map(i => i.days_overdue || 0));

          return {
            ...contact,
            policies_count: policies.length,
            insurers,
            overdue_value: overdueValue,
            max_days_overdue: maxDaysOverdue
          };
        })
      );

      // Filter out null values (contacts without policies)
      setSeguradosPF(enrichedSegurados.filter((s): s is SeguradoPF => s !== null));
    } catch (error) {
      console.error('Error loading segurados PF:', error);
      toast.error('Erro ao carregar segurados PF');
    }
  };

  const loadData = async () => {
    setLoading(true);
    await Promise.all([loadCompanies(), loadSeguradosPF()]);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenConversation = async (contactId: string) => {
    try {
      const conversationId = await api.getOrCreateConversation(contactId);
      navigate(`/chat?conversation=${conversationId}`);
    } catch (error) {
      console.error('Error opening conversation:', error);
      toast.error('Erro ao abrir conversa');
    }
  };

  const handleSelectCompany = (company: Company) => {
    // TODO: Open company details drawer
    toast.info(`Detalhes da empresa: ${company.razao_social}`);
  };

  const handleSelectSegurado = (segurado: SeguradoPF) => {
    // TODO: Open contact details drawer
    toast.info(`Detalhes do segurado: ${segurado.name}`);
  };

  // Filter data based on search term
  const filteredCompanies = companies.filter(c => 
    c.razao_social.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.nome_fantasia?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.cnpj.includes(searchTerm)
  );

  const filteredSeguradosPF = seguradosPF.filter(s =>
    s.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.cpf?.includes(searchTerm) ||
    s.phone_number.includes(searchTerm)
  );

  return (
    <div className="space-y-4">
      {/* Header with search and filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500 w-4 h-4" />
          <Input
            placeholder="Buscar por nome, documento ou telefone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 bg-slate-900/50 border-white/10"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadData}
          disabled={loading}
          className="border-white/10 gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {/* Sub-tabs for PJ and PF */}
      <Tabs value={activeSubTab} onValueChange={(v) => setActiveSubTab(v as 'pj' | 'pf')}>
        <TabsList className="bg-slate-900/50 border border-white/10">
          <TabsTrigger 
            value="pj" 
            className="gap-2 data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-400"
          >
            <Building2 className="w-4 h-4" />
            Empresas (PJ)
            <span className="ml-1 px-1.5 py-0.5 text-xs bg-slate-800 rounded-full">
              {filteredCompanies.length}
            </span>
          </TabsTrigger>
          <TabsTrigger 
            value="pf" 
            className="gap-2 data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400"
          >
            <User className="w-4 h-4" />
            Pessoas (PF)
            <span className="ml-1 px-1.5 py-0.5 text-xs bg-slate-800 rounded-full">
              {filteredSeguradosPF.length}
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pj" className="mt-4">
          <Card className="bg-slate-900/30 border-white/5">
            <CompaniesTable
              companies={filteredCompanies}
              loading={loading}
              onSelectCompany={handleSelectCompany}
            />
          </Card>
        </TabsContent>

        <TabsContent value="pf" className="mt-4">
          <Card className="bg-slate-900/30 border-white/5">
            <SeguradosPFTable
              segurados={filteredSeguradosPF}
              loading={loading}
              onSelectSegurado={handleSelectSegurado}
              onOpenConversation={handleOpenConversation}
            />
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
