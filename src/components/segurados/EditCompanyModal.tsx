import React, { useState, useRef, useEffect } from 'react';
import { Building2, FileText, MapPin, Search, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface Company {
  id: string;
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  inscricao_estadual?: string | null;
  inscricao_municipal?: string | null;
  cep?: string | null;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city: string | null;
  state: string | null;
  notes?: string | null;
}

interface EditCompanyModalProps {
  open: boolean;
  company: Company | null;
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

export const EditCompanyModal: React.FC<EditCompanyModalProps> = ({
  open,
  company,
  onOpenChange,
  onSuccess
}) => {
  const [loading, setLoading] = useState(false);
  const [loadingCEP, setLoadingCEP] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const numberInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
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

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Load full company data when modal opens
  useEffect(() => {
    if (open && company) {
      loadCompanyData(company.id);
    }
  }, [open, company]);

  const loadCompanyData = async (companyId: string) => {
    setLoadingData(true);
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .eq('id', companyId)
        .single();

      if (error) throw error;

      setFormData({
        razao_social: data.razao_social || '',
        nome_fantasia: data.nome_fantasia || '',
        inscricao_estadual: data.inscricao_estadual || '',
        inscricao_municipal: data.inscricao_municipal || '',
        cep: data.cep ? formatCEP(data.cep) : '',
        street: data.street || '',
        number: data.number || '',
        complement: data.complement || '',
        neighborhood: data.neighborhood || '',
        city: data.city || '',
        state: data.state || '',
        notes: data.notes || ''
      });
    } catch (error) {
      console.error('Error loading company:', error);
      toast.error('Erro ao carregar dados da empresa');
    } finally {
      setLoadingData(false);
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

    if (!formData.razao_social.trim()) {
      newErrors.razao_social = 'Razão Social é obrigatória';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!company || !validate()) return;

    setLoading(true);
    try {
      const cepDigits = formData.cep.replace(/\D/g, '') || null;

      const { error } = await supabase
        .from('companies')
        .update({
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
        })
        .eq('id', company.id);

      if (error) throw error;

      toast.success('Empresa atualizada com sucesso!');
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      console.error('Error updating company:', error);
      toast.error('Erro ao atualizar empresa');
    } finally {
      setLoading(false);
    }
  };

  if (!company) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-slate-900 border-slate-800">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-100">
            <Building2 className="w-5 h-5 text-blue-500" />
            Editar Empresa
          </DialogTitle>
        </DialogHeader>

        {loadingData ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
          </div>
        ) : (
          <>
            <div className="space-y-6 py-4">
              {/* Dados da Empresa */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <Building2 className="w-4 h-4" /> Dados da Empresa
                </h3>
                
                <div>
                  <Label className="text-slate-300">CNPJ</Label>
                  <div className="relative">
                    <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <Input
                      value={formatCNPJ(company.cnpj)}
                      disabled
                      className="pl-10 bg-slate-950/50 border-slate-700 text-slate-400"
                    />
                  </div>
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
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} className="border-slate-700">
                Cancelar
              </Button>
              <Button onClick={handleSubmit} disabled={loading} className="bg-blue-600 hover:bg-blue-700">
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Salvar Alterações
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default EditCompanyModal;
