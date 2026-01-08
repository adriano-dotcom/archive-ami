import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { PhoneInput } from './ui/phone-input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { toast } from 'sonner';
import { Loader2, Search, User, Building2, MapPin, FileText, Tag, Plus } from 'lucide-react';
import { api } from '../services/api';
import { formatPhoneInternational } from '@/utils/phoneFormatter';
import { supabase } from '@/integrations/supabase/client';

interface Campaign {
  id: string;
  name: string;
  color: string | null;
}

interface ContactData {
  id: string;
  name: string;
  phone: string;
  email: string;
  company?: string;
  cnpj?: string;
  fleet_size?: number;
  cep?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  notes?: string;
  campaign?: string;
  vertical?: 'transporte' | 'frotas';
}

interface EditContactModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: ContactData | null;
  onSuccess?: () => void;
}

const ESTADOS_BR = [
  { sigla: 'AC', nome: 'Acre' }, { sigla: 'AL', nome: 'Alagoas' },
  { sigla: 'AP', nome: 'Amapá' }, { sigla: 'AM', nome: 'Amazonas' },
  { sigla: 'BA', nome: 'Bahia' }, { sigla: 'CE', nome: 'Ceará' },
  { sigla: 'DF', nome: 'Distrito Federal' }, { sigla: 'ES', nome: 'Espírito Santo' },
  { sigla: 'GO', nome: 'Goiás' }, { sigla: 'MA', nome: 'Maranhão' },
  { sigla: 'MT', nome: 'Mato Grosso' }, { sigla: 'MS', nome: 'Mato Grosso do Sul' },
  { sigla: 'MG', nome: 'Minas Gerais' }, { sigla: 'PA', nome: 'Pará' },
  { sigla: 'PB', nome: 'Paraíba' }, { sigla: 'PR', nome: 'Paraná' },
  { sigla: 'PE', nome: 'Pernambuco' }, { sigla: 'PI', nome: 'Piauí' },
  { sigla: 'RJ', nome: 'Rio de Janeiro' }, { sigla: 'RN', nome: 'Rio Grande do Norte' },
  { sigla: 'RS', nome: 'Rio Grande do Sul' }, { sigla: 'RO', nome: 'Rondônia' },
  { sigla: 'RR', nome: 'Roraima' }, { sigla: 'SC', nome: 'Santa Catarina' },
  { sigla: 'SP', nome: 'São Paulo' }, { sigla: 'SE', nome: 'Sergipe' },
  { sigla: 'TO', nome: 'Tocantins' }
];

const EditContactModal: React.FC<EditContactModalProps> = ({ open, onOpenChange, contact, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [loadingCep, setLoadingCep] = useState(false);
  const [loadingCnpj, setLoadingCnpj] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [newCampaignName, setNewCampaignName] = useState('');
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const numberInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    company: '',
    cnpj: '',
    fleet_size: '',
    cep: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: '',
    notes: '',
    campaign: '',
    vertical: ''
  });

  useEffect(() => {
    if (open) {
      loadCampaigns();
    }
  }, [open]);

  useEffect(() => {
    if (contact && open) {
      setFormData({
        name: contact.name || '',
        phone: contact.phone || '',
        email: contact.email || '',
        company: contact.company || '',
        cnpj: contact.cnpj || '',
        fleet_size: contact.fleet_size?.toString() || '',
        cep: contact.cep || '',
        street: contact.street || '',
        number: contact.number || '',
        complement: contact.complement || '',
        neighborhood: contact.neighborhood || '',
        city: contact.city || '',
        state: contact.state || '',
        notes: contact.notes || '',
        campaign: contact.campaign || '',
        vertical: contact.vertical || ''
      });
    }
  }, [contact, open]);

  const loadCampaigns = async () => {
    const { data } = await supabase
      .from('campaigns')
      .select('id, name, color')
      .eq('is_active', true)
      .order('name');
    if (data) setCampaigns(data);
  };

  const createCampaign = async () => {
    if (!newCampaignName.trim()) return;
    const { data, error } = await supabase
      .from('campaigns')
      .insert({ name: newCampaignName.trim() })
      .select()
      .single();
    if (error) {
      toast.error('Erro ao criar campanha');
      return;
    }
    setCampaigns(prev => [...prev, data]);
    setFormData(prev => ({ ...prev, campaign: data.name }));
    setNewCampaignName('');
    setShowNewCampaign(false);
    toast.success('Campanha criada!');
  };

  // Use international phone format from utility

  const formatCNPJ = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return `${digits.slice(0,2)}.${digits.slice(2)}`;
    if (digits.length <= 8) return `${digits.slice(0,2)}.${digits.slice(2,5)}.${digits.slice(5)}`;
    if (digits.length <= 12) return `${digits.slice(0,2)}.${digits.slice(2,5)}.${digits.slice(5,8)}/${digits.slice(8)}`;
    return `${digits.slice(0,2)}.${digits.slice(2,5)}.${digits.slice(5,8)}/${digits.slice(8,12)}-${digits.slice(12,14)}`;
  };

  const formatCEP = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 5) return digits;
    return `${digits.slice(0,5)}-${digits.slice(5,8)}`;
  };

  const handleChange = (field: string, value: string) => {
    let formattedValue = value;
    if (field === 'phone') formattedValue = formatPhoneInternational(value);
    if (field === 'cnpj') formattedValue = formatCNPJ(value);
    if (field === 'cep') formattedValue = formatCEP(value);
    setFormData(prev => ({ ...prev, [field]: formattedValue }));
  };

  const searchCEP = async () => {
    const cepDigits = formData.cep.replace(/\D/g, '');
    if (cepDigits.length !== 8) {
      toast.error('CEP deve ter 8 dígitos');
      return;
    }

    setLoadingCep(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cepDigits}/json/`);
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
      toast.success('Endereço preenchido automaticamente');
      numberInputRef.current?.focus();
    } catch (error) {
      toast.error('Erro ao buscar CEP');
    } finally {
      setLoadingCep(false);
    }
  };

  const searchCNPJ = async () => {
    const cnpjDigits = formData.cnpj.replace(/\D/g, '');
    if (cnpjDigits.length !== 14) {
      toast.error('CNPJ deve ter 14 dígitos');
      return;
    }

    setLoadingCnpj(true);
    try {
      const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjDigits}`);
      if (!response.ok) throw new Error('CNPJ não encontrado');
      const data = await response.json();

      setFormData(prev => ({
        ...prev,
        company: data.razao_social || data.nome_fantasia || prev.company,
        cep: data.cep ? formatCEP(data.cep) : prev.cep,
        street: data.logradouro || prev.street,
        number: data.numero || prev.number,
        complement: data.complemento || prev.complement,
        neighborhood: data.bairro || prev.neighborhood,
        city: data.municipio || prev.city,
        state: data.uf || prev.state,
        email: data.email && !prev.email ? data.email.toLowerCase() : prev.email,
        phone: data.ddd_telefone_1 && !prev.phone ? formatPhoneInternational(data.ddd_telefone_1) : prev.phone
      }));
      toast.success('Dados da empresa preenchidos automaticamente');
    } catch (error) {
      toast.error('CNPJ não encontrado ou inválido');
    } finally {
      setLoadingCnpj(false);
    }
  };

  const handleSubmit = async () => {
    if (!contact?.id) return;
    if (!formData.name.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }

    setLoading(true);
    try {
      await api.updateContact(contact.id, {
        name: formData.name.trim(),
        phone_number: formData.phone.replace(/\D/g, ''),
        email: formData.email.trim() || null,
        company: formData.company.trim() || null,
        cnpj: formData.cnpj.replace(/\D/g, '') || null,
        fleet_size: formData.fleet_size ? parseInt(formData.fleet_size) : null,
        cep: formData.cep.replace(/\D/g, '') || null,
        street: formData.street.trim() || null,
        number: formData.number.trim() || null,
        complement: formData.complement.trim() || null,
        neighborhood: formData.neighborhood.trim() || null,
        city: formData.city.trim() || null,
        state: formData.state || null,
        notes: formData.notes.trim() || null,
        campaign: formData.campaign.trim() || null,
        vertical: formData.vertical || null
      });
      toast.success('Contato atualizado com sucesso!');
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error('Erro ao atualizar contato:', error);
      toast.error('Erro ao atualizar contato');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-slate-900 border-slate-800">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-100">
            <User className="w-5 h-5 text-cyan-500" />
            Editar Contato
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Dados Pessoais */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <User className="w-4 h-4" /> Dados Pessoais
            </h3>
            <div className="grid gap-4">
              <div>
                <Label className="text-slate-300">Nome *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  placeholder="Nome completo"
                  className="bg-slate-950 border-slate-700 text-slate-100"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-slate-300">WhatsApp</Label>
                  <PhoneInput
                    value={formData.phone}
                    onChange={(value) => setFormData(prev => ({ ...prev, phone: value }))}
                    placeholder="+55 43 99999-9999"
                    className="bg-slate-950 border-slate-700 text-slate-100"
                  />
                </div>
                <div>
                  <Label className="text-slate-300">Email</Label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleChange('email', e.target.value)}
                    placeholder="email@exemplo.com"
                    className="bg-slate-950 border-slate-700 text-slate-100"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Dados da Empresa */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <Building2 className="w-4 h-4" /> Dados da Empresa
            </h3>
            <div className="grid gap-4">
              <div>
                <Label className="text-slate-300">CNPJ</Label>
                <div className="flex gap-2">
                  <Input
                    value={formData.cnpj}
                    onChange={(e) => handleChange('cnpj', e.target.value)}
                    placeholder="00.000.000/0000-00"
                    className="bg-slate-950 border-slate-700 text-slate-100"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={searchCNPJ}
                    disabled={loadingCnpj}
                    className="border-slate-700 hover:bg-slate-800"
                  >
                    {loadingCnpj ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
              <div>
                <Label className="text-slate-300">Empresa</Label>
                <Input
                  value={formData.company}
                  onChange={(e) => handleChange('company', e.target.value)}
                  placeholder="Nome da empresa"
                  className="bg-slate-950 border-slate-700 text-slate-100"
                />
              </div>
              <div>
                <Label className="text-slate-300">Automotor (Qtd. Veículos)</Label>
                <Input
                  type="number"
                  min="0"
                  value={formData.fleet_size}
                  onChange={(e) => handleChange('fleet_size', e.target.value)}
                  placeholder="Ex: 15"
                  className="bg-slate-950 border-slate-700 text-slate-100"
                />
              </div>
              <div>
                <Label className="text-slate-300">Segmento</Label>
                <Select 
                  value={formData.vertical || 'none'} 
                  onValueChange={(value) => setFormData(prev => ({ ...prev, vertical: value === 'none' ? '' : value }))}
                >
                  <SelectTrigger className="bg-slate-950 border-slate-700 text-slate-100">
                    <SelectValue placeholder="Selecione o segmento" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700">
                    <SelectItem value="none" className="text-slate-400 focus:bg-slate-800">
                      Não definido
                    </SelectItem>
                    <SelectItem value="transporte" className="text-green-400 focus:bg-slate-800">
                      <div className="flex items-center gap-2">
                        🚛 Transporte (Seguro de Carga)
                      </div>
                    </SelectItem>
                    <SelectItem value="frotas" className="text-blue-400 focus:bg-slate-800">
                      <div className="flex items-center gap-2">
                        🚗 Automotores (Seguro de Frota)
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Endereço */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <MapPin className="w-4 h-4" /> Endereço
            </h3>
            <div className="grid gap-4">
              <div>
                <Label className="text-slate-300">CEP</Label>
                <div className="flex gap-2">
                  <Input
                    value={formData.cep}
                    onChange={(e) => handleChange('cep', e.target.value)}
                    placeholder="00000-000"
                    className="bg-slate-950 border-slate-700 text-slate-100"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={searchCEP}
                    disabled={loadingCep}
                    className="border-slate-700 hover:bg-slate-800"
                  >
                    {loadingCep ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
              <div>
                <Label className="text-slate-300">Logradouro</Label>
                <Input
                  value={formData.street}
                  onChange={(e) => handleChange('street', e.target.value)}
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
                    onChange={(e) => handleChange('number', e.target.value)}
                    placeholder="Nº"
                    className="bg-slate-950 border-slate-700 text-slate-100"
                  />
                </div>
                <div>
                  <Label className="text-slate-300">Complemento</Label>
                  <Input
                    value={formData.complement}
                    onChange={(e) => handleChange('complement', e.target.value)}
                    placeholder="Apto, Sala, etc."
                    className="bg-slate-950 border-slate-700 text-slate-100"
                  />
                </div>
              </div>
              <div>
                <Label className="text-slate-300">Bairro</Label>
                <Input
                  value={formData.neighborhood}
                  onChange={(e) => handleChange('neighborhood', e.target.value)}
                  placeholder="Bairro"
                  className="bg-slate-950 border-slate-700 text-slate-100"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-slate-300">Cidade</Label>
                  <Input
                    value={formData.city}
                    onChange={(e) => handleChange('city', e.target.value)}
                    placeholder="Cidade"
                    className="bg-slate-950 border-slate-700 text-slate-100"
                  />
                </div>
                <div>
                  <Label className="text-slate-300">Estado</Label>
                  <Select value={formData.state} onValueChange={(value) => handleChange('state', value)}>
                    <SelectTrigger className="bg-slate-950 border-slate-700 text-slate-100">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-700">
                      {ESTADOS_BR.map((estado) => (
                        <SelectItem key={estado.sigla} value={estado.sigla} className="text-slate-100 focus:bg-slate-800">
                          {estado.sigla} - {estado.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>

          {/* Campanha */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <Tag className="w-4 h-4" /> Campanha
            </h3>
            <div className="space-y-2">
              <Select 
                value={formData.campaign || 'none'} 
                onValueChange={(value) => {
                  if (value === 'new') {
                    setShowNewCampaign(true);
                  } else {
                    setFormData(prev => ({ ...prev, campaign: value === 'none' ? '' : value }));
                  }
                }}
              >
                <SelectTrigger className="bg-slate-950 border-slate-700 text-slate-100">
                  <SelectValue placeholder="Selecione uma campanha" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-700">
                  <SelectItem value="none" className="text-slate-400 focus:bg-slate-800">
                    Sem campanha
                  </SelectItem>
                  {campaigns.map((campaign) => (
                    <SelectItem key={campaign.id} value={campaign.name} className="text-slate-100 focus:bg-slate-800">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: campaign.color || '#3b82f6' }} 
                        />
                        {campaign.name}
                      </div>
                    </SelectItem>
                  ))}
                  <SelectItem value="new" className="text-cyan-400 focus:bg-slate-800">
                    <div className="flex items-center gap-2">
                      <Plus className="w-3 h-3" />
                      Nova campanha...
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              {showNewCampaign && (
                <div className="flex gap-2">
                  <Input
                    value={newCampaignName}
                    onChange={(e) => setNewCampaignName(e.target.value)}
                    placeholder="Nome da nova campanha"
                    className="bg-slate-950 border-slate-700 text-slate-100"
                    onKeyDown={(e) => e.key === 'Enter' && createCampaign()}
                  />
                  <Button type="button" size="sm" onClick={createCampaign} className="bg-cyan-600 hover:bg-cyan-700">
                    Criar
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setShowNewCampaign(false)}>
                    Cancelar
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Notas */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <FileText className="w-4 h-4" /> Notas
            </h3>
            <Textarea
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              placeholder="Observações sobre o contato..."
              className="bg-slate-950 border-slate-700 text-slate-100 min-h-[80px]"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-slate-700">
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading} className="bg-cyan-600 hover:bg-cyan-700">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Salvar Alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditContactModal;
