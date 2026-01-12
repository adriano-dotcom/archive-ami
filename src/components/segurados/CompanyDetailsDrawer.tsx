import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Building2, User, Phone, Mail, Star, StarOff, Plus, Pencil, 
  MessageCircle, MapPin, FileText, Clock, DollarSign, Loader2 
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { api } from '@/services/api';
import { toast } from 'sonner';
import { AddContactToCompanyModal } from './AddContactToCompanyModal';
import { EditSeguradoPFModal } from './EditSeguradoPFModal';
import { displayPhoneInternational } from '@/utils/phoneFormatter';
import { EmailComposeModal } from '@/components/EmailComposeModal';

interface Company {
  id: string;
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  city: string | null;
  state: string | null;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  cep?: string | null;
  inscricao_estadual?: string | null;
  inscricao_municipal?: string | null;
  notes?: string | null;
  contacts_count: number;
  billing_contacts_count: number;
  policies_count: number;
  overdue_value: number;
  max_days_overdue: number;
}

interface CompanyContact {
  id: string;
  name: string | null;
  call_name: string | null;
  phone_number: string;
  email: string | null;
  cpf: string | null;
  role: string | null;
  is_billing_contact: boolean | null;
}

interface CompanyDetailsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company: Company | null;
  onEdit?: () => void;
  onRefresh?: () => void;
}

export const CompanyDetailsDrawer: React.FC<CompanyDetailsDrawerProps> = ({
  open,
  onOpenChange,
  company,
  onEdit,
  onRefresh
}) => {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<CompanyContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [editingContact, setEditingContact] = useState<CompanyContact | null>(null);
  const [emailModalContact, setEmailModalContact] = useState<CompanyContact | null>(null);
  const [togglingBilling, setTogglingBilling] = useState<string | null>(null);

  useEffect(() => {
    if (open && company) {
      loadContacts();
    }
  }, [open, company?.id]);

  const loadContacts = async () => {
    if (!company) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, name, call_name, phone_number, email, cpf, role, is_billing_contact')
        .eq('company_id', company.id)
        .order('is_billing_contact', { ascending: false })
        .order('name');

      if (error) throw error;
      setContacts(data || []);
    } catch (error) {
      console.error('Error loading contacts:', error);
      toast.error('Erro ao carregar contatos');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChat = async (contactId: string) => {
    try {
      const conversationId = await api.getOrCreateConversation(contactId);
      navigate(`/chat?conversation=${conversationId}`);
      onOpenChange(false);
    } catch (error) {
      console.error('Error opening conversation:', error);
      toast.error('Erro ao abrir conversa');
    }
  };

  const handleSendEmail = (contact: CompanyContact) => {
    if (!contact.email) {
      toast.error('Este contato não possui email cadastrado');
      return;
    }
    setEmailModalContact(contact);
  };

  const handleToggleBillingContact = async (contact: CompanyContact) => {
    setTogglingBilling(contact.id);
    try {
      const newValue = !contact.is_billing_contact;
      
      const { error } = await supabase
        .from('contacts')
        .update({ is_billing_contact: newValue })
        .eq('id', contact.id);

      if (error) throw error;

      // Update local state
      setContacts(prev => 
        prev.map(c => c.id === contact.id ? { ...c, is_billing_contact: newValue } : c)
      );

      toast.success(newValue ? 'Contato marcado como cobrança' : 'Contato desmarcado como cobrança');
      onRefresh?.();
    } catch (error) {
      console.error('Error toggling billing contact:', error);
      toast.error('Erro ao atualizar contato');
    } finally {
      setTogglingBilling(null);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const formatCNPJ = (cnpj: string) => {
    const cleaned = cnpj.replace(/\D/g, '');
    return cleaned.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  };

  const getOverdueColor = (days: number) => {
    if (days === 0) return 'text-slate-400';
    if (days <= 30) return 'text-yellow-400';
    if (days <= 60) return 'text-orange-400';
    return 'text-red-400';
  };

  if (!company) return null;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-lg bg-slate-950 border-slate-800 overflow-hidden flex flex-col">
          <SheetHeader className="border-b border-slate-800 pb-4">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-xl bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                <Building2 className="w-7 h-7 text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <SheetTitle className="text-lg text-white truncate">
                  {company.nome_fantasia || company.razao_social}
                </SheetTitle>
                <p className="text-sm text-slate-400 font-mono mt-1">
                  {formatCNPJ(company.cnpj)}
                </p>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={onEdit}
                className="gap-2 border-slate-700"
              >
                <Pencil className="w-4 h-4" />
                Editar
              </Button>
            </div>
          </SheetHeader>

          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-6 py-4">
              {/* Dados da Empresa */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider">
                  Dados da Empresa
                </h3>
                <div className="bg-slate-900/50 rounded-lg p-4 space-y-3">
                  <div>
                    <span className="text-xs text-slate-500">Razão Social</span>
                    <p className="text-sm text-white">{company.razao_social}</p>
                  </div>
                  {company.nome_fantasia && (
                    <div>
                      <span className="text-xs text-slate-500">Nome Fantasia</span>
                      <p className="text-sm text-white">{company.nome_fantasia}</p>
                    </div>
                  )}
                  {(company.inscricao_estadual || company.inscricao_municipal) && (
                    <div className="flex gap-4">
                      {company.inscricao_estadual && (
                        <div>
                          <span className="text-xs text-slate-500">IE</span>
                          <p className="text-sm text-white">{company.inscricao_estadual}</p>
                        </div>
                      )}
                      {company.inscricao_municipal && (
                        <div>
                          <span className="text-xs text-slate-500">IM</span>
                          <p className="text-sm text-white">{company.inscricao_municipal}</p>
                        </div>
                      )}
                    </div>
                  )}
                  {(company.city || company.state) && (
                    <div className="flex items-center gap-2 text-slate-400">
                      <MapPin className="w-4 h-4" />
                      <span className="text-sm">
                        {[company.street, company.number, company.neighborhood, company.city, company.state]
                          .filter(Boolean)
                          .join(', ')}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Resumo de Cobrança */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider">
                  Resumo de Cobrança
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-slate-900/50 rounded-lg p-3 text-center">
                    <FileText className="w-5 h-5 text-blue-400 mx-auto mb-1" />
                    <p className="text-xl font-bold text-white">{company.policies_count}</p>
                    <p className="text-xs text-slate-500">Apólices</p>
                  </div>
                  <div className="bg-slate-900/50 rounded-lg p-3 text-center">
                    <DollarSign className="w-5 h-5 text-red-400 mx-auto mb-1" />
                    <p className="text-lg font-bold text-white">{formatCurrency(company.overdue_value)}</p>
                    <p className="text-xs text-slate-500">Em aberto</p>
                  </div>
                  <div className="bg-slate-900/50 rounded-lg p-3 text-center">
                    <Clock className={`w-5 h-5 mx-auto mb-1 ${getOverdueColor(company.max_days_overdue)}`} />
                    <p className={`text-xl font-bold ${getOverdueColor(company.max_days_overdue)}`}>
                      {company.max_days_overdue}d
                    </p>
                    <p className="text-xs text-slate-500">Maior atraso</p>
                  </div>
                </div>
              </div>

              {/* Contatos da Empresa */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider">
                    Contatos da Empresa ({contacts.length})
                  </h3>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowAddContact(true)}
                    className="gap-1 h-7 text-xs border-slate-700"
                  >
                    <Plus className="w-3 h-3" />
                    Novo
                  </Button>
                </div>

                {loading ? (
                  <div className="space-y-3">
                    {[1, 2].map((i) => (
                      <Skeleton key={i} className="h-24 bg-slate-800" />
                    ))}
                  </div>
                ) : contacts.length === 0 ? (
                  <div className="bg-slate-900/50 rounded-lg p-6 text-center">
                    <User className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                    <p className="text-slate-400 text-sm">Nenhum contato vinculado</p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowAddContact(true)}
                      className="mt-3 gap-2 border-slate-700"
                    >
                      <Plus className="w-4 h-4" />
                      Adicionar Contato
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {contacts.map((contact) => (
                      <div
                        key={contact.id}
                        className="bg-slate-900/50 rounded-lg p-4 border border-slate-800 hover:border-slate-700 transition-colors"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-white">
                              {contact.name || 'Sem nome'}
                            </span>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => handleToggleBillingContact(contact)}
                                  disabled={togglingBilling === contact.id}
                                  className="p-0.5 hover:bg-slate-700 rounded transition-colors disabled:opacity-50"
                                >
                                  {togglingBilling === contact.id ? (
                                    <Loader2 className="w-4 h-4 text-yellow-400 animate-spin" />
                                  ) : contact.is_billing_contact ? (
                                    <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                                  ) : (
                                    <StarOff className="w-4 h-4 text-slate-500 hover:text-yellow-400" />
                                  )}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                {contact.is_billing_contact 
                                  ? 'Remover como contato de cobrança' 
                                  : 'Marcar como contato de cobrança'}
                              </TooltipContent>
                            </Tooltip>
                          </div>
                          {contact.role && (
                            <Badge variant="secondary" className="text-xs bg-slate-800">
                              {contact.role}
                            </Badge>
                          )}
                        </div>
                        
                        <div className="space-y-1 text-sm text-slate-400 mb-3">
                          <div className="flex items-center gap-2">
                            <Phone className="w-3.5 h-3.5" />
                            <span>{displayPhoneInternational(contact.phone_number)}</span>
                          </div>
                          {contact.email && (
                            <div className="flex items-center gap-2">
                              <Mail className="w-3.5 h-3.5" />
                              <span className="truncate">{contact.email}</span>
                            </div>
                          )}
                        </div>

                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenChat(contact.id)}
                            className="gap-1 h-7 text-xs border-emerald-700 text-emerald-400 hover:bg-emerald-500/10"
                          >
                            <MessageCircle className="w-3 h-3" />
                            WhatsApp
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSendEmail(contact)}
                            className="gap-1 h-7 text-xs border-blue-700 text-blue-400 hover:bg-blue-500/10"
                            disabled={!contact.email}
                          >
                            <Mail className="w-3 h-3" />
                            Email
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingContact(contact)}
                            className="gap-1 h-7 text-xs text-slate-400"
                          >
                            <Pencil className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Modal para adicionar contato */}
      <AddContactToCompanyModal
        open={showAddContact}
        onOpenChange={setShowAddContact}
        companyId={company.id}
        companyName={company.nome_fantasia || company.razao_social}
        onSuccess={() => {
          loadContacts();
          onRefresh?.();
        }}
      />

      {/* Modal para editar contato */}
      {editingContact && (
        <EditSeguradoPFModal
          open={!!editingContact}
          segurado={{
            id: editingContact.id,
            name: editingContact.name,
            phone_number: editingContact.phone_number,
            email: editingContact.email,
            cpf: editingContact.cpf,
            city: null,
            state: null
          }}
          onOpenChange={(open) => !open && setEditingContact(null)}
          onSuccess={() => {
            setEditingContact(null);
            loadContacts();
            onRefresh?.();
          }}
        />
      )}

      {/* Modal para email de cobrança */}
      {emailModalContact && company && (
        <EmailComposeModal
          isOpen={!!emailModalContact}
          onClose={() => setEmailModalContact(null)}
          contactEmail={emailModalContact.email || ''}
          contactName={emailModalContact.name || ''}
          company={company.nome_fantasia || company.razao_social}
          value={company.overdue_value}
          contactPhone={emailModalContact.phone_number}
          collectionContext={{
            totalOverdue: company.overdue_value,
            maxDaysOverdue: company.max_days_overdue,
            installmentsCount: company.policies_count,
            companyName: company.nome_fantasia || company.razao_social
          }}
        />
      )}
    </>
  );
};
