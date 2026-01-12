import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PhoneInput } from '@/components/ui/phone-input';
import { toast } from 'sonner';
import { 
  Search, Loader2, User, Phone, Mail, MapPin, 
  FileText, CreditCard, Calendar, DollarSign, Building2 
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { KNOWN_INSURERS } from '@/constants/insurers';
import { Installment } from './useInstallments';

interface EditInstallmentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  installment: Installment | null;
  onSuccess: () => void;
}

interface ContactResult {
  id: string;
  name: string | null;
  phone_number: string;
  cpf: string | null;
  email: string | null;
  company_id: string | null;
}

const ESTADOS_BR = [
  { uf: 'AC', nome: 'Acre' }, { uf: 'AL', nome: 'Alagoas' },
  { uf: 'AP', nome: 'Amapá' }, { uf: 'AM', nome: 'Amazonas' },
  { uf: 'BA', nome: 'Bahia' }, { uf: 'CE', nome: 'Ceará' },
  { uf: 'DF', nome: 'Distrito Federal' }, { uf: 'ES', nome: 'Espírito Santo' },
  { uf: 'GO', nome: 'Goiás' }, { uf: 'MA', nome: 'Maranhão' },
  { uf: 'MT', nome: 'Mato Grosso' }, { uf: 'MS', nome: 'Mato Grosso do Sul' },
  { uf: 'MG', nome: 'Minas Gerais' }, { uf: 'PA', nome: 'Pará' },
  { uf: 'PB', nome: 'Paraíba' }, { uf: 'PR', nome: 'Paraná' },
  { uf: 'PE', nome: 'Pernambuco' }, { uf: 'PI', nome: 'Piauí' },
  { uf: 'RJ', nome: 'Rio de Janeiro' }, { uf: 'RN', nome: 'Rio Grande do Norte' },
  { uf: 'RS', nome: 'Rio Grande do Sul' }, { uf: 'RO', nome: 'Rondônia' },
  { uf: 'RR', nome: 'Roraima' }, { uf: 'SC', nome: 'Santa Catarina' },
  { uf: 'SP', nome: 'São Paulo' }, { uf: 'SE', nome: 'Sergipe' },
  { uf: 'TO', nome: 'Tocantins' }
];

const formatCPF = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
};

const formatCEP = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5, 8)}`;
};

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value || 0);
};

const validateCPF = (cpf: string): boolean => {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return false;
  if (/^(\d)\1+$/.test(digits)) return false;
  
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(digits[i]) * (10 - i);
  }
  let remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(digits[9])) return false;
  
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(digits[i]) * (11 - i);
  }
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  return remainder === parseInt(digits[10]);
};

export const EditInstallmentModal: React.FC<EditInstallmentModalProps> = ({
  open,
  onOpenChange,
  installment,
  onSuccess
}) => {
  const [saving, setSaving] = useState(false);
  const [contactMode, setContactMode] = useState<'search' | 'create'>('search');
  
  // Installment data
  const [status, setStatus] = useState('pending');
  const [insurer, setInsurer] = useState('');
  const [notes, setNotes] = useState('');
  
  // Contact search
  const [contactSearch, setContactSearch] = useState('');
  const [searchResults, setSearchResults] = useState<ContactResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedContact, setSelectedContact] = useState<ContactResult | null>(null);
  
  // New contact form
  const [loadingCEP, setLoadingCEP] = useState(false);
  const numberInputRef = useRef<HTMLInputElement>(null);
  const [newContact, setNewContact] = useState({
    name: '', cpf: '', phone: '', email: '',
    cep: '', street: '', number: '', complement: '',
    neighborhood: '', city: '', state: ''
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Reset form when installment changes
  useEffect(() => {
    if (installment && open) {
      setStatus(installment.status);
      setInsurer(installment.policy?.insurer || '');
      setNotes('');
      setContactSearch('');
      setSearchResults([]);
      setSelectedContact(installment.contact ? {
        id: installment.contact.id,
        name: installment.contact.name,
        phone_number: installment.contact.phone_number,
        cpf: null,
        email: null,
        company_id: null
      } : null);
      setContactMode('search');
      setNewContact({
        name: '', cpf: '', phone: '', email: '',
        cep: '', street: '', number: '', complement: '',
        neighborhood: '', city: '', state: ''
      });
      setErrors({});
    }
  }, [installment, open]);

  // Search contacts
  useEffect(() => {
    const searchContacts = async () => {
      if (!contactSearch || contactSearch.length < 2) {
        setSearchResults([]);
        return;
      }
      
      setSearching(true);
      try {
        const searchLower = contactSearch.toLowerCase();
        const searchDigits = contactSearch.replace(/\D/g, '');
        
        let query = supabase
          .from('contacts')
          .select('id, name, phone_number, cpf, email, company_id')
          .limit(10);
        
        if (searchDigits.length > 0) {
          query = query.or(`name.ilike.%${searchLower}%,phone_number.ilike.%${searchDigits}%,cpf.ilike.%${searchDigits}%`);
        } else {
          query = query.ilike('name', `%${searchLower}%`);
        }
        
        const { data, error } = await query;
        
        if (error) throw error;
        setSearchResults(data || []);
      } catch (error) {
        console.error('Error searching contacts:', error);
      } finally {
        setSearching(false);
      }
    };
    
    const debounce = setTimeout(searchContacts, 300);
    return () => clearTimeout(debounce);
  }, [contactSearch]);

  const fetchCEP = async (cep: string) => {
    const digits = cep.replace(/\D/g, '');
    if (digits.length !== 8) return;

    setLoadingCEP(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await response.json();

      if (data.erro) {
        toast.error('CEP não encontrado');
        return;
      }

      setNewContact(prev => ({
        ...prev,
        street: data.logradouro || prev.street,
        neighborhood: data.bairro || prev.neighborhood,
        city: data.localidade || prev.city,
        state: data.uf || prev.state
      }));
      toast.success('Endereço carregado!');
      numberInputRef.current?.focus();
    } catch (error) {
      console.error('Erro ao buscar CEP:', error);
      toast.error('Erro ao buscar CEP');
    } finally {
      setLoadingCEP(false);
    }
  };

  const handleCEPChange = (value: string) => {
    const formatted = formatCEP(value);
    setNewContact(prev => ({ ...prev, cep: formatted }));
    const digits = value.replace(/\D/g, '');
    if (digits.length === 8) {
      fetchCEP(digits);
    }
  };

  const validateNewContact = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (!newContact.name.trim() || newContact.name.trim().length < 2) {
      newErrors.name = 'Nome deve ter pelo menos 2 caracteres';
    }

    const phoneDigits = newContact.phone.replace(/\D/g, '');
    const isValidWithCountryCode = phoneDigits.startsWith('55') && phoneDigits.length >= 12 && phoneDigits.length <= 13;
    const isValidWithoutCountryCode = !phoneDigits.startsWith('55') && phoneDigits.length >= 10 && phoneDigits.length <= 11;
    
    if (!phoneDigits || (!isValidWithCountryCode && !isValidWithoutCountryCode)) {
      newErrors.phone = 'Telefone inválido';
    }

    const cpfDigits = newContact.cpf.replace(/\D/g, '');
    if (cpfDigits && cpfDigits.length > 0) {
      if (cpfDigits.length !== 11) {
        newErrors.cpf = 'CPF deve ter 11 dígitos';
      } else if (!validateCPF(cpfDigits)) {
        newErrors.cpf = 'CPF inválido';
      }
    }

    if (newContact.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newContact.email)) {
      newErrors.email = 'Email inválido';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!installment) return;
    
    setSaving(true);
    try {
      let contactId = selectedContact?.id || null;
      
      // Create new contact if needed
      if (contactMode === 'create' && newContact.name) {
        if (!validateNewContact()) {
          setSaving(false);
          return;
        }
        
        const phoneDigits = newContact.phone.replace(/\D/g, '');
        const cpfDigits = newContact.cpf.replace(/\D/g, '') || null;
        const cepDigits = newContact.cep.replace(/\D/g, '') || null;
        
        const { data: newContactData, error: contactError } = await supabase
          .from('contacts')
          .insert({
            name: newContact.name.trim(),
            phone_number: phoneDigits,
            cpf: cpfDigits,
            email: newContact.email.trim() || null,
            cep: cepDigits,
            street: newContact.street.trim() || null,
            number: newContact.number.trim() || null,
            complement: newContact.complement.trim() || null,
            neighborhood: newContact.neighborhood.trim() || null,
            city: newContact.city.trim() || null,
            state: newContact.state || null,
            is_billing_contact: true,
            lead_source: 'inbound',
            lead_status: 'customer'
          })
          .select('id')
          .single();
        
        if (contactError) throw contactError;
        contactId = newContactData.id;
        toast.success('Contato criado com sucesso!');
      }
      
      // Update installment
      const { error: installmentError } = await supabase
        .from('installments')
        .update({
          status,
          contact_id: contactId,
          notes: notes.trim() || null
        })
        .eq('id', installment.id);
      
      if (installmentError) throw installmentError;
      
      // Update policy insurer if changed
      if (installment.policy?.id && insurer && insurer !== installment.policy.insurer) {
        const updateData: { insurer: string; contact_id?: string | null } = { insurer };
        
        // Also update policy contact_id if we have a contact
        if (contactId && !installment.policy?.company?.id) {
          updateData.contact_id = contactId;
        }
        
        const { error: policyError } = await supabase
          .from('policies')
          .update(updateData)
          .eq('id', installment.policy.id);
        
        if (policyError) throw policyError;
      }
      
      toast.success('Parcela atualizada com sucesso!');
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving installment:', error);
      toast.error('Erro ao salvar alterações');
    } finally {
      setSaving(false);
    }
  };

  if (!installment) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col bg-slate-900 border-slate-800">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-100">
            <FileText className="w-5 h-5 text-blue-500" />
            Editar Parcela
          </DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-6 py-4">
            {/* Dados da Parcela */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <DollarSign className="w-4 h-4" /> Dados da Parcela
              </h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-800/50 rounded-lg p-3 space-y-1">
                  <span className="text-xs text-slate-500">Apólice</span>
                  <p className="text-slate-200 font-medium">{installment.policy?.policy_number || 'N/A'}</p>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-3 space-y-1">
                  <span className="text-xs text-slate-500">Parcela</span>
                  <p className="text-slate-200 font-medium">{installment.installment_number}</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-800/50 rounded-lg p-3 space-y-1">
                  <span className="text-xs text-slate-500">Valor</span>
                  <p className="text-amber-400 font-bold">{formatCurrency(installment.value)}</p>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-3 space-y-1">
                  <span className="text-xs text-slate-500">Vencimento</span>
                  <p className="text-slate-200 font-medium">
                    {format(new Date(installment.due_date), 'dd/MM/yyyy', { locale: ptBR })}
                  </p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-slate-300">Status</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className="bg-slate-950 border-slate-700 text-slate-100">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-700">
                      <SelectItem value="pending" className="text-slate-100 focus:bg-slate-800">Pendente</SelectItem>
                      <SelectItem value="overdue" className="text-slate-100 focus:bg-slate-800">Vencido</SelectItem>
                      <SelectItem value="negotiating" className="text-slate-100 focus:bg-slate-800">Negociando</SelectItem>
                      <SelectItem value="paid" className="text-slate-100 focus:bg-slate-800">Pago</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-slate-300">Seguradora</Label>
                  <Select value={insurer} onValueChange={setInsurer}>
                    <SelectTrigger className="bg-slate-950 border-slate-700 text-slate-100">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-700 max-h-[200px]">
                      {KNOWN_INSURERS.map((ins) => (
                        <SelectItem key={ins} value={ins} className="text-slate-100 focus:bg-slate-800">
                          {ins}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              {installment.policy?.company && (
                <div className="bg-slate-800/50 rounded-lg p-3 flex items-center gap-3">
                  <Building2 className="w-5 h-5 text-slate-500" />
                  <div>
                    <span className="text-xs text-slate-500">Empresa</span>
                    <p className="text-slate-200 font-medium">
                      {installment.policy.company.nome_fantasia || installment.policy.company.razao_social}
                    </p>
                  </div>
                </div>
              )}
            </div>
            
            <Separator className="bg-slate-800" />
            
            {/* Contato/Segurado */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <User className="w-4 h-4" /> Contato / Segurado
              </h3>
              
              {/* Current contact info */}
              {installment.contact && (
                <div className="bg-slate-800/50 rounded-lg p-3 flex items-center gap-3 mb-4">
                  <User className="w-5 h-5 text-green-500" />
                  <div className="flex-1">
                    <p className="text-slate-200 font-medium">{installment.contact.name || 'Sem nome'}</p>
                    <p className="text-sm text-slate-400">{installment.contact.phone_number}</p>
                  </div>
                  <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Atual</Badge>
                </div>
              )}
              
              <RadioGroup value={contactMode} onValueChange={(v) => setContactMode(v as 'search' | 'create')}>
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="search" id="search" />
                    <Label htmlFor="search" className="text-slate-300 cursor-pointer">Buscar existente</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="create" id="create" />
                    <Label htmlFor="create" className="text-slate-300 cursor-pointer">Cadastrar novo</Label>
                  </div>
                </div>
              </RadioGroup>
              
              {contactMode === 'search' ? (
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <Input
                      value={contactSearch}
                      onChange={(e) => setContactSearch(e.target.value)}
                      placeholder="Buscar por nome, telefone ou CPF..."
                      className="pl-10 bg-slate-950 border-slate-700 text-slate-100"
                    />
                    {searching && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400 animate-spin" />
                    )}
                  </div>
                  
                  {searchResults.length > 0 && (
                    <div className="bg-slate-800/50 rounded-lg divide-y divide-slate-700">
                      {searchResults.map((contact) => (
                        <button
                          key={contact.id}
                          onClick={() => {
                            setSelectedContact(contact);
                            setContactSearch('');
                            setSearchResults([]);
                          }}
                          className={`w-full p-3 text-left hover:bg-slate-700/50 transition-colors flex items-center justify-between ${
                            selectedContact?.id === contact.id ? 'bg-blue-500/10 border-l-2 border-blue-500' : ''
                          }`}
                        >
                          <div>
                            <p className="text-slate-200 font-medium">{contact.name || 'Sem nome'}</p>
                            <p className="text-sm text-slate-400">{contact.phone_number}</p>
                          </div>
                          {contact.cpf && (
                            <span className="text-xs text-slate-500">CPF: {formatCPF(contact.cpf)}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                  
                  {selectedContact && selectedContact.id !== installment.contact?.id && (
                    <div className="bg-blue-500/10 rounded-lg p-3 flex items-center gap-3">
                      <User className="w-5 h-5 text-blue-400" />
                      <div className="flex-1">
                        <p className="text-slate-200 font-medium">{selectedContact.name || 'Sem nome'}</p>
                        <p className="text-sm text-slate-400">{selectedContact.phone_number}</p>
                      </div>
                      <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">Selecionado</Badge>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4 bg-slate-800/30 rounded-lg p-4">
                  <div>
                    <Label className="text-slate-300">Nome *</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <Input
                        value={newContact.name}
                        onChange={(e) => setNewContact(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="Nome completo"
                        className="pl-10 bg-slate-950 border-slate-700 text-slate-100"
                      />
                    </div>
                    {errors.name && <p className="text-xs text-red-400 mt-1">{errors.name}</p>}
                  </div>

                  <div>
                    <Label className="text-slate-300">CPF</Label>
                    <div className="relative">
                      <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <Input
                        value={newContact.cpf}
                        onChange={(e) => setNewContact(prev => ({ ...prev, cpf: formatCPF(e.target.value) }))}
                        placeholder="000.000.000-00"
                        maxLength={14}
                        className="pl-10 bg-slate-950 border-slate-700 text-slate-100"
                      />
                    </div>
                    {errors.cpf && <p className="text-xs text-red-400 mt-1">{errors.cpf}</p>}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-slate-300">WhatsApp *</Label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 z-10" />
                        <PhoneInput
                          value={newContact.phone}
                          onChange={(value) => setNewContact(prev => ({ ...prev, phone: value }))}
                          placeholder="+55 43 99999-9999"
                          className="pl-10 bg-slate-950 border-slate-700 text-slate-100"
                        />
                      </div>
                      {errors.phone && <p className="text-xs text-red-400 mt-1">{errors.phone}</p>}
                    </div>
                    <div>
                      <Label className="text-slate-300">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <Input
                          type="email"
                          value={newContact.email}
                          onChange={(e) => setNewContact(prev => ({ ...prev, email: e.target.value }))}
                          placeholder="email@exemplo.com"
                          className="pl-10 bg-slate-950 border-slate-700 text-slate-100"
                        />
                      </div>
                      {errors.email && <p className="text-xs text-red-400 mt-1">{errors.email}</p>}
                    </div>
                  </div>

                  <div>
                    <Label className="text-slate-300">CEP</Label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <Input
                        value={newContact.cep}
                        onChange={(e) => handleCEPChange(e.target.value)}
                        placeholder="00000-000"
                        maxLength={9}
                        className="pl-10 bg-slate-950 border-slate-700 text-slate-100"
                      />
                      {loadingCEP && (
                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400 animate-spin" />
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="col-span-2">
                      <Label className="text-slate-300">Logradouro</Label>
                      <Input
                        value={newContact.street}
                        onChange={(e) => setNewContact(prev => ({ ...prev, street: e.target.value }))}
                        placeholder="Rua, Avenida, etc."
                        className="bg-slate-950 border-slate-700 text-slate-100"
                      />
                    </div>
                    <div>
                      <Label className="text-slate-300">Número</Label>
                      <Input
                        ref={numberInputRef}
                        value={newContact.number}
                        onChange={(e) => setNewContact(prev => ({ ...prev, number: e.target.value }))}
                        placeholder="Nº"
                        className="bg-slate-950 border-slate-700 text-slate-100"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-slate-300">Cidade</Label>
                      <Input
                        value={newContact.city}
                        onChange={(e) => setNewContact(prev => ({ ...prev, city: e.target.value }))}
                        placeholder="Cidade"
                        className="bg-slate-950 border-slate-700 text-slate-100"
                      />
                    </div>
                    <div>
                      <Label className="text-slate-300">Estado</Label>
                      <Select value={newContact.state} onValueChange={(value) => setNewContact(prev => ({ ...prev, state: value }))}>
                        <SelectTrigger className="bg-slate-950 border-slate-700 text-slate-100">
                          <SelectValue placeholder="UF" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-700 max-h-[200px]">
                          {ESTADOS_BR.map((estado) => (
                            <SelectItem key={estado.uf} value={estado.uf} className="text-slate-100 focus:bg-slate-800">
                              {estado.uf}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            <Separator className="bg-slate-800" />
            
            {/* Notas */}
            <div className="space-y-2">
              <Label className="text-slate-300">Notas (opcional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observações sobre esta atualização..."
                className="bg-slate-950 border-slate-700 text-slate-100 min-h-[80px]"
              />
            </div>
          </div>
        </ScrollArea>
        
        <DialogFooter className="gap-2 border-t border-slate-800 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-slate-700">
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Salvar Alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditInstallmentModal;
