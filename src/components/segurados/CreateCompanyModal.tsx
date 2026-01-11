import React, { useState, useRef } from 'react';
import { Building2, FileText, MapPin, Search, Loader2, Users, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface CreateCompanyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface ContactForm {
  name: string;
  phone: string;
  email: string;
  role: string;
  is_billing_contact: boolean;
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

const formatCNPJ = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
};

const formatCEP = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5, 8)}`;
};

const formatPhone = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
};

const validateCNPJ = (cnpj: string): boolean => {
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14) return false;
  if (/^(\d)\1+$/.test(digits)) return false;
  
  let sum = 0;
  let weight = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  for (let i = 0; i < 12; i++) {
    sum += parseInt(digits[i]) * weight[i];
  }
  let remainder = sum % 11;
  let digit1 = remainder < 2 ? 0 : 11 - remainder;
  if (parseInt(digits[12]) !== digit1) return false;

  sum = 0;
  weight = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  for (let i = 0; i < 13; i++) {
    sum += parseInt(digits[i]) * weight[i];
  }
  remainder = sum % 11;
  let digit2 = remainder < 2 ? 0 : 11 - remainder;
  return parseInt(digits[13]) === digit2;
};

export const CreateCompanyModal: React.FC<CreateCompanyModalProps> = ({
  open,
  onOpenChange,
  onSuccess
}) => {
  const [loading, setLoading] = useState(false);
  const [loadingCNPJ, setLoadingCNPJ] = useState(false);
  const [loadingCEP, setLoadingCEP] = useState(false);
  const [cnpjExists, setCnpjExists] = useState(false);
  const [checkingCnpj, setCheckingCnpj] = useState(false);
  const [existingCompanyName, setExistingCompanyName] = useState<string | null>(null);
  const numberInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    cnpj: '',
    razao_social: '',
    nome_fantasia: '',
    inscricao_estadual: '',
    inscricao_municipal: '',
    cep: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: '',
    notes: ''
  });

  const [contacts, setContacts] = useState<ContactForm[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const resetForm = () => {
    setFormData({
      cnpj: '', razao_social: '', nome_fantasia: '', inscricao_estadual: '',
      inscricao_municipal: '', cep: '', street: '', number: '', complement: '',
      neighborhood: '', city: '', state: '', notes: ''
    });
    setContacts([]);
    setErrors({});
    setCnpjExists(false);
    setExistingCompanyName(null);
    setCheckingCnpj(false);
  };

  const addContact = () => {
    setContacts(prev => [...prev, { name: '', phone: '', email: '', role: '', is_billing_contact: false }]);
  };

  const removeContact = (index: number) => {
    setContacts(prev => prev.filter((_, i) => i !== index));
  };

  const updateContact = (index: number, field: keyof ContactForm, value: string | boolean) => {
    setContacts(prev => prev.map((contact, i) => 
      i === index ? { ...contact, [field]: value } : contact
    ));
  };

  const fetchCNPJ = async (cnpj: string) => {
    const digits = cnpj.replace(/\D/g, '');
    if (digits.length !== 14) return;

    setLoadingCNPJ(true);
    try {
      const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
      if (!response.ok) {
        toast.error('CNPJ não encontrado');
        return;
      }
      const data = await response.json();

      setFormData(prev => ({
        ...prev,
        razao_social: data.razao_social || prev.razao_social,
        nome_fantasia: data.nome_fantasia || prev.nome_fantasia,
        cep: data.cep ? formatCEP(data.cep) : prev.cep,
        street: data.logradouro || prev.street,
        number: data.numero || prev.number,
        complement: data.complemento || prev.complement,
        neighborhood: data.bairro || prev.neighborhood,
        city: data.municipio || prev.city,
        state: data.uf || prev.state
      }));
      toast.success('Dados da empresa carregados!');
    } catch (error) {
      console.error('Erro ao buscar CNPJ:', error);
      toast.error('Erro ao buscar CNPJ');
    } finally {
      setLoadingCNPJ(false);
    }
  };

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

      setFormData(prev => ({
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

  const checkCnpjExists = async (cnpj: string) => {
    const digits = cnpj.replace(/\D/g, '');
    if (digits.length !== 14) {
      setCnpjExists(false);
      setExistingCompanyName(null);
      return;
    }

    setCheckingCnpj(true);
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('id, razao_social, nome_fantasia')
        .eq('cnpj', digits)
        .maybeSingle();

      if (data && !error) {
        setCnpjExists(true);
        setExistingCompanyName(data.nome_fantasia || data.razao_social);
      } else {
        setCnpjExists(false);
        setExistingCompanyName(null);
      }
    } catch {
      setCnpjExists(false);
      setExistingCompanyName(null);
    } finally {
      setCheckingCnpj(false);
    }
  };

  const handleCNPJChange = (value: string) => {
    const formatted = formatCNPJ(value);
    setFormData(prev => ({ ...prev, cnpj: formatted }));
    const digits = value.replace(/\D/g, '');
    
    if (digits.length === 14) {
      // Verificar duplicata E buscar dados (em paralelo)
      checkCnpjExists(digits);
      fetchCNPJ(digits);
    } else {
      // Limpar estado quando CNPJ incompleto
      setCnpjExists(false);
      setExistingCompanyName(null);
    }
  };

  const handleCEPChange = (value: string) => {
    const formatted = formatCEP(value);
    setFormData(prev => ({ ...prev, cep: formatted }));
    const digits = value.replace(/\D/g, '');
    if (digits.length === 8) {
      fetchCEP(digits);
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    // Bloquear se CNPJ já existe
    if (cnpjExists) {
      newErrors.cnpj = 'CNPJ já cadastrado no sistema';
    }
    
    const cnpjDigits = formData.cnpj.replace(/\D/g, '');
    if (!cnpjDigits) {
      newErrors.cnpj = 'CNPJ é obrigatório';
    } else if (cnpjDigits.length !== 14) {
      newErrors.cnpj = 'CNPJ deve ter 14 dígitos';
    } else if (!validateCNPJ(cnpjDigits)) {
      newErrors.cnpj = 'CNPJ inválido';
    }

    if (!formData.razao_social.trim()) {
      newErrors.razao_social = 'Razão Social é obrigatória';
    }

    // Validate contacts
    contacts.forEach((contact, index) => {
      if (!contact.name.trim()) {
        newErrors[`contact_${index}_name`] = 'Nome é obrigatório';
      }
      const phoneDigits = contact.phone.replace(/\D/g, '');
      if (!phoneDigits) {
        newErrors[`contact_${index}_phone`] = 'WhatsApp é obrigatório';
      } else if (phoneDigits.length < 10 || phoneDigits.length > 11) {
        newErrors[`contact_${index}_phone`] = 'WhatsApp inválido';
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setLoading(true);
    try {
      const cnpjDigits = formData.cnpj.replace(/\D/g, '');
      const cepDigits = formData.cep.replace(/\D/g, '') || null;

      // Check if CNPJ already exists
      const { data: existing } = await supabase
        .from('companies')
        .select('id')
        .eq('cnpj', cnpjDigits)
        .single();

      if (existing) {
        toast.error('Empresa já cadastrada com este CNPJ');
        return;
      }

      const { data: companyData, error: companyError } = await supabase.from('companies').insert({
        cnpj: cnpjDigits,
        razao_social: formData.razao_social.trim(),
        nome_fantasia: formData.nome_fantasia.trim() || null,
        inscricao_estadual: formData.inscricao_estadual.trim() || null,
        inscricao_municipal: formData.inscricao_municipal.trim() || null,
        cep: cepDigits,
        street: formData.street.trim() || null,
        number: formData.number.trim() || null,
        complement: formData.complement.trim() || null,
        neighborhood: formData.neighborhood.trim() || null,
        city: formData.city.trim() || null,
        state: formData.state || null,
        notes: formData.notes.trim() || null
      }).select('id').single();

      if (companyError) throw companyError;

      // Insert contacts if any
      if (contacts.length > 0 && companyData?.id) {
        const contactsToInsert = contacts.map(contact => ({
          name: contact.name.trim(),
          phone_number: contact.phone.replace(/\D/g, ''),
          email: contact.email.trim() || null,
          role: contact.role.trim() || null,
          is_billing_contact: contact.is_billing_contact,
          company_id: companyData.id,
          company: formData.nome_fantasia.trim() || formData.razao_social.trim(),
          cep: cepDigits,
          street: formData.street.trim() || null,
          number: formData.number.trim() || null,
          complement: formData.complement.trim() || null,
          neighborhood: formData.neighborhood.trim() || null,
          city: formData.city.trim() || null,
          state: formData.state || null
        }));

        const { error: contactsError } = await supabase.from('contacts').insert(contactsToInsert);
        if (contactsError) {
          console.error('Error creating contacts:', contactsError);
          toast.warning('Empresa criada, mas houve erro ao criar alguns contatos');
        }
      }

      toast.success('Empresa cadastrada com sucesso!');
      resetForm();
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      console.error('Error creating company:', error);
      toast.error('Erro ao cadastrar empresa');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) resetForm();
      onOpenChange(isOpen);
    }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-slate-900 border-slate-800">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-100">
            <Building2 className="w-5 h-5 text-blue-500" />
            Nova Empresa (PJ)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Dados da Empresa */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <Building2 className="w-4 h-4" /> Dados da Empresa
            </h3>
            
            <div>
              <Label className="text-slate-300">CNPJ *</Label>
              <div className="relative">
                <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                  value={formData.cnpj}
                  onChange={(e) => handleCNPJChange(e.target.value)}
                  placeholder="00.000.000/0000-00"
                  className={cn(
                    "pl-10 bg-slate-950 border-slate-700 text-slate-100",
                    cnpjExists && "border-red-500 focus:border-red-500 focus-visible:ring-red-500"
                  )}
                />
                {(loadingCNPJ || checkingCnpj) && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400 animate-spin" />
                )}
                {cnpjExists && !checkingCnpj && !loadingCNPJ && (
                  <AlertTriangle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-400" />
                )}
              </div>
              
              {/* Alerta de CNPJ duplicado em tempo real */}
              {cnpjExists && (
                <div className="mt-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-red-400">
                        CNPJ já cadastrado
                      </p>
                      <p className="text-xs text-red-300/80 mt-1">
                        Empresa existente: <span className="font-medium">{existingCompanyName}</span>
                      </p>
                    </div>
                  </div>
                </div>
              )}
              
              {errors.cnpj && !cnpjExists && <p className="text-xs text-red-400 mt-1">{errors.cnpj}</p>}
            </div>

            <div>
              <Label className="text-slate-300">Razão Social *</Label>
              <Input
                value={formData.razao_social}
                onChange={(e) => setFormData(prev => ({ ...prev, razao_social: e.target.value }))}
                placeholder="Razão Social da empresa"
                className="bg-slate-950 border-slate-700 text-slate-100"
              />
              {errors.razao_social && <p className="text-xs text-red-400 mt-1">{errors.razao_social}</p>}
            </div>

            <div>
              <Label className="text-slate-300">Nome Fantasia</Label>
              <Input
                value={formData.nome_fantasia}
                onChange={(e) => setFormData(prev => ({ ...prev, nome_fantasia: e.target.value }))}
                placeholder="Nome Fantasia"
                className="bg-slate-950 border-slate-700 text-slate-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-300">Inscrição Estadual</Label>
                <Input
                  value={formData.inscricao_estadual}
                  onChange={(e) => setFormData(prev => ({ ...prev, inscricao_estadual: e.target.value }))}
                  placeholder="IE"
                  className="bg-slate-950 border-slate-700 text-slate-100"
                />
              </div>
              <div>
                <Label className="text-slate-300">Inscrição Municipal</Label>
                <Input
                  value={formData.inscricao_municipal}
                  onChange={(e) => setFormData(prev => ({ ...prev, inscricao_municipal: e.target.value }))}
                  placeholder="IM"
                  className="bg-slate-950 border-slate-700 text-slate-100"
                />
              </div>
            </div>
          </div>

          {/* Endereço */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <MapPin className="w-4 h-4" /> Endereço
            </h3>

            <div>
              <Label className="text-slate-300">CEP</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                  value={formData.cep}
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

            <div>
              <Label className="text-slate-300">Logradouro</Label>
              <Input
                value={formData.street}
                onChange={(e) => setFormData(prev => ({ ...prev, street: e.target.value }))}
                placeholder="Rua, Avenida, etc."
                className="bg-slate-950 border-slate-700 text-slate-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-300">Número</Label>
                <Input
                  ref={numberInputRef}
                  value={formData.number}
                  onChange={(e) => setFormData(prev => ({ ...prev, number: e.target.value }))}
                  placeholder="Nº"
                  className="bg-slate-950 border-slate-700 text-slate-100"
                />
              </div>
              <div>
                <Label className="text-slate-300">Complemento</Label>
                <Input
                  value={formData.complement}
                  onChange={(e) => setFormData(prev => ({ ...prev, complement: e.target.value }))}
                  placeholder="Sala, Apto"
                  className="bg-slate-950 border-slate-700 text-slate-100"
                />
              </div>
            </div>

            <div>
              <Label className="text-slate-300">Bairro</Label>
              <Input
                value={formData.neighborhood}
                onChange={(e) => setFormData(prev => ({ ...prev, neighborhood: e.target.value }))}
                placeholder="Bairro"
                className="bg-slate-950 border-slate-700 text-slate-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-300">Cidade</Label>
                <Input
                  value={formData.city}
                  onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                  placeholder="Cidade"
                  className="bg-slate-950 border-slate-700 text-slate-100"
                />
              </div>
              <div>
                <Label className="text-slate-300">Estado</Label>
                <Select value={formData.state} onValueChange={(value) => setFormData(prev => ({ ...prev, state: value }))}>
                  <SelectTrigger className="bg-slate-950 border-slate-700 text-slate-100">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700">
                    {ESTADOS_BR.map((estado) => (
                      <SelectItem key={estado.uf} value={estado.uf} className="text-slate-100 focus:bg-slate-800">
                        {estado.uf} - {estado.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Notas */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <FileText className="w-4 h-4" /> Notas
            </h3>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Observações sobre a empresa..."
              className="bg-slate-950 border-slate-700 text-slate-100 min-h-[80px]"
            />
          </div>

          {/* Contatos da Empresa */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <Users className="w-4 h-4" /> Contatos da Empresa
              </h3>
              <Button type="button" variant="outline" size="sm" onClick={addContact} className="border-slate-700 text-slate-300 hover:bg-slate-800">
                <Plus className="w-4 h-4 mr-1" /> Adicionar
              </Button>
            </div>

            {contacts.length === 0 ? (
              <p className="text-sm text-slate-500 italic">Nenhum contato adicionado. Clique em "Adicionar" para vincular pessoas à empresa.</p>
            ) : (
              <div className="space-y-4">
                {contacts.map((contact, index) => (
                  <div key={index} className="p-4 bg-slate-800/50 rounded-lg border border-slate-700 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-slate-300 text-xs">Nome *</Label>
                        <Input
                          value={contact.name}
                          onChange={(e) => updateContact(index, 'name', e.target.value)}
                          placeholder="Nome completo"
                          className="bg-slate-950 border-slate-700 text-slate-100 h-9"
                        />
                        {errors[`contact_${index}_name`] && <p className="text-xs text-red-400 mt-1">{errors[`contact_${index}_name`]}</p>}
                      </div>
                      <div>
                        <Label className="text-slate-300 text-xs">WhatsApp *</Label>
                        <Input
                          value={contact.phone}
                          onChange={(e) => updateContact(index, 'phone', formatPhone(e.target.value))}
                          placeholder="(00) 00000-0000"
                          className="bg-slate-950 border-slate-700 text-slate-100 h-9"
                        />
                        {errors[`contact_${index}_phone`] && <p className="text-xs text-red-400 mt-1">{errors[`contact_${index}_phone`]}</p>}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-slate-300 text-xs">Email</Label>
                        <Input
                          type="email"
                          value={contact.email}
                          onChange={(e) => updateContact(index, 'email', e.target.value)}
                          placeholder="email@empresa.com"
                          className="bg-slate-950 border-slate-700 text-slate-100 h-9"
                        />
                      </div>
                      <div>
                        <Label className="text-slate-300 text-xs">Cargo</Label>
                        <Input
                          value={contact.role}
                          onChange={(e) => updateContact(index, 'role', e.target.value)}
                          placeholder="Ex: Financeiro, Gerente"
                          className="bg-slate-950 border-slate-700 text-slate-100 h-9"
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={`billing-${index}`}
                          checked={contact.is_billing_contact}
                          onCheckedChange={(checked) => updateContact(index, 'is_billing_contact', checked as boolean)}
                          className="border-slate-600"
                        />
                        <Label htmlFor={`billing-${index}`} className="text-sm text-slate-300 cursor-pointer">
                          Contato de cobrança
                        </Label>
                      </div>
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeContact(index)} className="text-red-400 hover:text-red-300 hover:bg-red-900/20">
                        <Trash2 className="w-4 h-4 mr-1" /> Remover
                      </Button>
                    </div>
                  </div>
                ))}
                <p className="text-xs text-slate-500">
                  💡 Contatos de cobrança receberão WhatsApp e emails automáticos sobre parcelas.
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-slate-700">
            Cancelar
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={loading || cnpjExists || checkingCnpj} 
            className="bg-blue-600 hover:bg-blue-700"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Cadastrar Empresa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateCompanyModal;
