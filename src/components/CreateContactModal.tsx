import React, { useState, useRef, useEffect } from 'react';
import { X, User, Phone, Mail, Building2, FileText, Loader2, MapPin, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { PhoneInput } from './ui/phone-input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { formatPhoneInternational } from '@/utils/phoneFormatter';

interface CreateContactModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const ESTADOS_BR = [
  { uf: 'AC', nome: 'Acre' },
  { uf: 'AL', nome: 'Alagoas' },
  { uf: 'AP', nome: 'Amapá' },
  { uf: 'AM', nome: 'Amazonas' },
  { uf: 'BA', nome: 'Bahia' },
  { uf: 'CE', nome: 'Ceará' },
  { uf: 'DF', nome: 'Distrito Federal' },
  { uf: 'ES', nome: 'Espírito Santo' },
  { uf: 'GO', nome: 'Goiás' },
  { uf: 'MA', nome: 'Maranhão' },
  { uf: 'MT', nome: 'Mato Grosso' },
  { uf: 'MS', nome: 'Mato Grosso do Sul' },
  { uf: 'MG', nome: 'Minas Gerais' },
  { uf: 'PA', nome: 'Pará' },
  { uf: 'PB', nome: 'Paraíba' },
  { uf: 'PR', nome: 'Paraná' },
  { uf: 'PE', nome: 'Pernambuco' },
  { uf: 'PI', nome: 'Piauí' },
  { uf: 'RJ', nome: 'Rio de Janeiro' },
  { uf: 'RN', nome: 'Rio Grande do Norte' },
  { uf: 'RS', nome: 'Rio Grande do Sul' },
  { uf: 'RO', nome: 'Rondônia' },
  { uf: 'RR', nome: 'Roraima' },
  { uf: 'SC', nome: 'Santa Catarina' },
  { uf: 'SP', nome: 'São Paulo' },
  { uf: 'SE', nome: 'Sergipe' },
  { uf: 'TO', nome: 'Tocantins' },
];

// Use international phone format from utility

// Format CNPJ: 12345678000190 → 12.345.678/0001-90
const formatCNPJ = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
};

// Format CEP: 12345678 → 12345-678
const formatCEP = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5, 8)}`;
};

// Validate CNPJ with verifier digits
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

const CreateContactModal: React.FC<CreateContactModalProps> = ({
  open,
  onOpenChange,
  onSuccess
}) => {
  const [loading, setLoading] = useState(false);
  const [loadingCEP, setLoadingCEP] = useState(false);
  const [loadingCNPJ, setLoadingCNPJ] = useState(false);
  const numberInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    cpf: '',
    role: '',
    is_billing_contact: false,
    company: '',
    cnpj: '',
    notes: '',
    cep: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: ''
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const resetForm = () => {
    setFormData({ 
      name: '', phone: '', email: '', cpf: '', role: '', is_billing_contact: false,
      company: '', cnpj: '', notes: '', cep: '', street: '', number: '', 
      complement: '', neighborhood: '', city: '', state: ''
    });
    setErrors({});
  };

  // Busca CEP via ViaCEP API
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

  // Busca CNPJ via BrasilAPI
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
        company: data.razao_social || data.nome_fantasia || prev.company,
        email: data.email && data.email !== 'null' ? data.email : prev.email,
        phone: data.ddd_telefone_1 ? formatPhoneInternational(data.ddd_telefone_1.replace(/\D/g, '')) : prev.phone,
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
      toast.error('Erro ao buscar dados do CNPJ');
    } finally {
      setLoadingCNPJ(false);
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.name.trim() || formData.name.trim().length < 2) {
      newErrors.name = 'Nome deve ter pelo menos 2 caracteres';
    }
    
    const phoneDigits = formData.phone.replace(/\D/g, '');
    // Aceita 12-13 dígitos (55 + DDD + número) ou 10-11 (sem código país)
    const isValidWithCountryCode = phoneDigits.startsWith('55') && phoneDigits.length >= 12 && phoneDigits.length <= 13;
    const isValidWithoutCountryCode = !phoneDigits.startsWith('55') && phoneDigits.length >= 10 && phoneDigits.length <= 11;
    
    if (!phoneDigits || (!isValidWithCountryCode && !isValidWithoutCountryCode)) {
      newErrors.phone = 'Telefone inválido';
    }
    
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Email inválido';
    }
    
    const cnpjDigits = formData.cnpj.replace(/\D/g, '');
    if (cnpjDigits && cnpjDigits.length > 0) {
      if (cnpjDigits.length !== 14) {
        newErrors.cnpj = 'CNPJ deve ter 14 dígitos';
      } else if (!validateCNPJ(cnpjDigits)) {
        newErrors.cnpj = 'CNPJ inválido';
      }
    }

    const cepDigits = formData.cep.replace(/\D/g, '');
    if (cepDigits && cepDigits.length > 0 && cepDigits.length !== 8) {
      newErrors.cep = 'CEP deve ter 8 dígitos';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validate()) return;
    
    setLoading(true);
    try {
      const phoneDigits = formData.phone.replace(/\D/g, '');
      const cnpjDigits = formData.cnpj.replace(/\D/g, '') || null;
      const cepDigits = formData.cep.replace(/\D/g, '') || null;
      
      const { error } = await supabase.from('contacts').insert({
        name: formData.name.trim(),
        phone_number: phoneDigits,
        email: formData.email.trim() || null,
        cpf: formData.cpf.replace(/\D/g, '') || null,
        role: formData.role.trim() || null,
        is_billing_contact: formData.is_billing_contact,
        company: formData.company.trim() || null,
        cnpj: cnpjDigits,
        notes: formData.notes.trim() || null,
        cep: cepDigits,
        street: formData.street.trim() || null,
        number: formData.number.trim() || null,
        complement: formData.complement.trim() || null,
        neighborhood: formData.neighborhood.trim() || null,
        city: formData.city.trim() || null,
        state: formData.state || null,
        lead_source: 'inbound'
      });

      if (error) throw error;

      toast.success('Contato criado com sucesso!');
      resetForm();
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      console.error('Error creating contact:', error);
      if (error.code === '23505') {
        toast.error('Este telefone já está cadastrado');
      } else {
        toast.error('Erro ao criar contato');
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneChange = (value: string) => {
    setFormData(prev => ({ ...prev, phone: formatPhoneInternational(value) }));
  };

  const handleCNPJChange = (value: string) => {
    const formatted = formatCNPJ(value);
    setFormData(prev => ({ ...prev, cnpj: formatted }));
    
    // Auto-fetch when CNPJ is complete
    const digits = value.replace(/\D/g, '');
    if (digits.length === 14) {
      fetchCNPJ(digits);
    }
  };

  const handleCEPChange = (value: string) => {
    const formatted = formatCEP(value);
    setFormData(prev => ({ ...prev, cep: formatted }));
    
    // Auto-fetch when CEP is complete
    const digits = value.replace(/\D/g, '');
    if (digits.length === 8) {
      fetchCEP(digits);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) resetForm();
      onOpenChange(isOpen);
    }}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto bg-slate-900 border-slate-800 text-slate-50">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <User className="w-5 h-5 text-cyan-400" />
            Novo Contato
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-4">
          {/* Dados Pessoais */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-slate-400 border-b border-slate-800 pb-2">
              Dados Pessoais
            </h3>
            
            <div className="space-y-2">
              <Label htmlFor="name" className="text-slate-300">
                Nome <span className="text-red-400">*</span>
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Nome completo"
                  className="pl-10 bg-slate-950 border-slate-800 text-slate-200 placeholder:text-slate-600"
                />
              </div>
              {errors.name && <p className="text-xs text-red-400">{errors.name}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-slate-300">
                  Telefone <span className="text-red-400">*</span>
                </Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 z-10" />
                  <PhoneInput
                    id="phone"
                    value={formData.phone}
                    onChange={(value) => setFormData(prev => ({ ...prev, phone: value }))}
                    placeholder="+55 43 99999-9999"
                    className="pl-10 bg-slate-950 border-slate-800 text-slate-200 placeholder:text-slate-600"
                  />
                </div>
                {errors.phone && <p className="text-xs text-red-400">{errors.phone}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-300">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="email@exemplo.com"
                    className="pl-10 bg-slate-950 border-slate-800 text-slate-200 placeholder:text-slate-600"
                  />
                </div>
              {errors.email && <p className="text-xs text-red-400">{errors.email}</p>}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cpf" className="text-slate-300">CPF</Label>
              <Input
                id="cpf"
                value={formData.cpf}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '');
                  let formatted = digits;
                  if (digits.length <= 3) formatted = digits;
                  else if (digits.length <= 6) formatted = `${digits.slice(0,3)}.${digits.slice(3)}`;
                  else if (digits.length <= 9) formatted = `${digits.slice(0,3)}.${digits.slice(3,6)}.${digits.slice(6)}`;
                  else formatted = `${digits.slice(0,3)}.${digits.slice(3,6)}.${digits.slice(6,9)}-${digits.slice(9,11)}`;
                  setFormData(prev => ({ ...prev, cpf: formatted }));
                }}
                placeholder="000.000.000-00"
                maxLength={14}
                className="bg-slate-950 border-slate-800 text-slate-200 placeholder:text-slate-600"
              />
            </div>
          </div>

          {/* Dados da Empresa */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-slate-400 border-b border-slate-800 pb-2">
              Dados da Empresa
            </h3>

            <div className="space-y-2">
              <Label htmlFor="cnpj" className="text-slate-300">
                CNPJ
                <span className="text-xs text-slate-500 ml-2">(preencha para buscar dados automaticamente)</span>
              </Label>
              <div className="relative">
                <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                  id="cnpj"
                  value={formData.cnpj}
                  onChange={(e) => handleCNPJChange(e.target.value)}
                  placeholder="12.345.678/0001-90"
                  className="pl-10 bg-slate-950 border-slate-800 text-slate-200 placeholder:text-slate-600"
                />
                {loadingCNPJ && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-400 animate-spin" />
                )}
              </div>
              {errors.cnpj && <p className="text-xs text-red-400">{errors.cnpj}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="company" className="text-slate-300">Empresa</Label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                  id="company"
                  value={formData.company}
                  onChange={(e) => setFormData(prev => ({ ...prev, company: e.target.value }))}
                  placeholder="Nome da empresa"
                  className="pl-10 bg-slate-950 border-slate-800 text-slate-200 placeholder:text-slate-600"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="role" className="text-slate-300">Cargo</Label>
              <Input
                id="role"
                value={formData.role}
                onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value }))}
                placeholder="Ex: Gerente, Diretor"
                className="bg-slate-950 border-slate-800 text-slate-200 placeholder:text-slate-600"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_billing_contact"
                checked={formData.is_billing_contact}
                onChange={(e) => setFormData(prev => ({ ...prev, is_billing_contact: e.target.checked }))}
                className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-cyan-500"
              />
              <Label htmlFor="is_billing_contact" className="text-slate-300 cursor-pointer">
                Contato de Cobrança
              </Label>
            </div>
          </div>

          {/* Endereço */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-slate-400 border-b border-slate-800 pb-2 flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Endereço
            </h3>

            <div className="space-y-2">
              <Label htmlFor="cep" className="text-slate-300">
                CEP
                <span className="text-xs text-slate-500 ml-2">(preencha para buscar endereço)</span>
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                  id="cep"
                  value={formData.cep}
                  onChange={(e) => handleCEPChange(e.target.value)}
                  placeholder="12345-678"
                  maxLength={9}
                  className="pl-10 bg-slate-950 border-slate-800 text-slate-200 placeholder:text-slate-600"
                />
                {loadingCEP && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-400 animate-spin" />
                )}
              </div>
              {errors.cep && <p className="text-xs text-red-400">{errors.cep}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="street" className="text-slate-300">Logradouro</Label>
              <Input
                id="street"
                value={formData.street}
                onChange={(e) => setFormData(prev => ({ ...prev, street: e.target.value }))}
                placeholder="Rua, Avenida, etc."
                className="bg-slate-950 border-slate-800 text-slate-200 placeholder:text-slate-600"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="number" className="text-slate-300">Número</Label>
                <Input
                  ref={numberInputRef}
                  id="number"
                  value={formData.number}
                  onChange={(e) => setFormData(prev => ({ ...prev, number: e.target.value }))}
                  placeholder="123"
                  className="bg-slate-950 border-slate-800 text-slate-200 placeholder:text-slate-600"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="complement" className="text-slate-300">Complemento</Label>
                <Input
                  id="complement"
                  value={formData.complement}
                  onChange={(e) => setFormData(prev => ({ ...prev, complement: e.target.value }))}
                  placeholder="Sala 1, Apto 101"
                  className="bg-slate-950 border-slate-800 text-slate-200 placeholder:text-slate-600"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="neighborhood" className="text-slate-300">Bairro</Label>
              <Input
                id="neighborhood"
                value={formData.neighborhood}
                onChange={(e) => setFormData(prev => ({ ...prev, neighborhood: e.target.value }))}
                placeholder="Centro"
                className="bg-slate-950 border-slate-800 text-slate-200 placeholder:text-slate-600"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="city" className="text-slate-300">Cidade</Label>
                <Input
                  id="city"
                  value={formData.city}
                  onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                  placeholder="São Paulo"
                  className="bg-slate-950 border-slate-800 text-slate-200 placeholder:text-slate-600"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="state" className="text-slate-300">Estado</Label>
                <Select
                  value={formData.state}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, state: value }))}
                >
                  <SelectTrigger className="bg-slate-950 border-slate-800 text-slate-200">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800">
                    {ESTADOS_BR.map((estado) => (
                      <SelectItem 
                        key={estado.uf} 
                        value={estado.uf}
                        className="text-slate-200 focus:bg-slate-800 focus:text-slate-50"
                      >
                        {estado.uf} - {estado.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Notas */}
          <div className="space-y-2">
            <Label htmlFor="notes" className="text-slate-300">Notas</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Observações sobre o contato..."
              rows={3}
              className="bg-slate-950 border-slate-800 text-slate-200 placeholder:text-slate-600 resize-none"
            />
          </div>

          {/* Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="bg-cyan-600 hover:bg-cyan-700">
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Salvar Contato'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateContactModal;
