import React, { useState, useRef } from 'react';
import { User, Phone, Mail, MapPin, Search, Loader2, FileText, CreditCard } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface CreateSeguradoPFModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
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

const formatPhoneInternational = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  const trimmed = digits.slice(0, 13);
  
  if (trimmed.startsWith('55')) {
    const withoutCountry = trimmed.slice(2);
    if (withoutCountry.length === 0) return '+55';
    if (withoutCountry.length <= 2) return `+55 ${withoutCountry}`;
    const ddd = withoutCountry.slice(0, 2);
    const number = withoutCountry.slice(2);
    if (number.length === 0) return `+55 ${ddd}`;
    if (number.length <= 5) return `+55 ${ddd} ${number}`;
    if (number.length === 9) return `+55 ${ddd} ${number.slice(0, 5)}-${number.slice(5)}`;
    if (number.length === 8) return `+55 ${ddd} ${number.slice(0, 4)}-${number.slice(4)}`;
    return `+55 ${ddd} ${number}`;
  }
  
  if (trimmed.length <= 2) return `+55 ${trimmed}`;
  const ddd = trimmed.slice(0, 2);
  const number = trimmed.slice(2);
  if (number.length === 0) return `+55 ${ddd}`;
  if (number.length <= 5) return `+55 ${ddd} ${number}`;
  if (number.length === 9) return `+55 ${ddd} ${number.slice(0, 5)}-${number.slice(5)}`;
  if (number.length === 8) return `+55 ${ddd} ${number.slice(0, 4)}-${number.slice(4)}`;
  return `+55 ${ddd} ${number.slice(0, 5)}-${number.slice(5, 9)}`;
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

export const CreateSeguradoPFModal: React.FC<CreateSeguradoPFModalProps> = ({
  open,
  onOpenChange,
  onSuccess
}) => {
  const [loading, setLoading] = useState(false);
  const [loadingCEP, setLoadingCEP] = useState(false);
  const numberInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    name: '',
    cpf: '',
    phone: '',
    email: '',
    cep: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: '',
    notes: ''
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const resetForm = () => {
    setFormData({
      name: '', cpf: '', phone: '', email: '', cep: '', street: '',
      number: '', complement: '', neighborhood: '', city: '', state: '', notes: ''
    });
    setErrors({});
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

  const handleCPFChange = (value: string) => {
    const formatted = formatCPF(value);
    setFormData(prev => ({ ...prev, cpf: formatted }));
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
    
    if (!formData.name.trim() || formData.name.trim().length < 2) {
      newErrors.name = 'Nome deve ter pelo menos 2 caracteres';
    }

    const phoneDigits = formData.phone.replace(/\D/g, '');
    const isValidWithCountryCode = phoneDigits.startsWith('55') && phoneDigits.length >= 12 && phoneDigits.length <= 13;
    const isValidWithoutCountryCode = !phoneDigits.startsWith('55') && phoneDigits.length >= 10 && phoneDigits.length <= 11;
    
    if (!phoneDigits || (!isValidWithCountryCode && !isValidWithoutCountryCode)) {
      newErrors.phone = 'Telefone inválido';
    }

    const cpfDigits = formData.cpf.replace(/\D/g, '');
    if (cpfDigits && cpfDigits.length > 0) {
      if (cpfDigits.length !== 11) {
        newErrors.cpf = 'CPF deve ter 11 dígitos';
      } else if (!validateCPF(cpfDigits)) {
        newErrors.cpf = 'CPF inválido';
      }
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Email inválido';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setLoading(true);
    try {
      const phoneDigits = formData.phone.replace(/\D/g, '');
      const cpfDigits = formData.cpf.replace(/\D/g, '') || null;
      const cepDigits = formData.cep.replace(/\D/g, '') || null;

      const { error } = await supabase.from('contacts').insert({
        name: formData.name.trim(),
        phone_number: phoneDigits,
        cpf: cpfDigits,
        email: formData.email.trim() || null,
        cep: cepDigits,
        street: formData.street.trim() || null,
        number: formData.number.trim() || null,
        complement: formData.complement.trim() || null,
        neighborhood: formData.neighborhood.trim() || null,
        city: formData.city.trim() || null,
        state: formData.state || null,
        notes: formData.notes.trim() || null,
        lead_source: 'inbound',
        lead_status: 'customer'
      });

      if (error) throw error;

      toast.success('Segurado PF cadastrado com sucesso!');
      resetForm();
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      console.error('Error creating segurado PF:', error);
      if (error.code === '23505') {
        toast.error('Este telefone já está cadastrado');
      } else {
        toast.error('Erro ao cadastrar segurado');
      }
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
            <User className="w-5 h-5 text-emerald-500" />
            Novo Segurado (PF)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Dados Pessoais */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <User className="w-4 h-4" /> Dados Pessoais
            </h3>
            
            <div>
              <Label className="text-slate-300">Nome *</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
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
                  value={formData.cpf}
                  onChange={(e) => handleCPFChange(e.target.value)}
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
                    value={formData.phone}
                    onChange={(value) => setFormData(prev => ({ ...prev, phone: value }))}
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
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="email@exemplo.com"
                    className="pl-10 bg-slate-950 border-slate-700 text-slate-100"
                  />
                </div>
                {errors.email && <p className="text-xs text-red-400 mt-1">{errors.email}</p>}
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
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400 animate-spin" />
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
                  placeholder="Apto, Casa"
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
              placeholder="Observações sobre o segurado..."
              className="bg-slate-950 border-slate-700 text-slate-100 min-h-[80px]"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-slate-700">
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Cadastrar Segurado
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateSeguradoPFModal;
