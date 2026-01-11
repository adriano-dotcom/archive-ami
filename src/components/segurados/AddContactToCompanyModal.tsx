import React, { useState } from 'react';
import { Building2, User, Phone, Mail, BadgeCheck } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface AddContactToCompanyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  companyName: string;
  onSuccess?: () => void;
}

export const AddContactToCompanyModal: React.FC<AddContactToCompanyModalProps> = ({
  open,
  onOpenChange,
  companyId,
  companyName,
  onSuccess
}) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    cpf: '',
    role: '',
    is_billing_contact: false
  });

  const resetForm = () => {
    setFormData({
      name: '',
      phone: '',
      email: '',
      cpf: '',
      role: '',
      is_billing_contact: false
    });
  };

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 2) return digits;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
  };

  const formatCPF = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim() || !formData.phone.trim()) {
      toast.error('Nome e telefone são obrigatórios');
      return;
    }

    setLoading(true);
    try {
      const phoneDigits = formData.phone.replace(/\D/g, '');
      const phoneNumber = phoneDigits.startsWith('55') ? phoneDigits : `55${phoneDigits}`;

      // Telefone duplicado permitido - um segurado pode ter múltiplas empresas
      const { error } = await supabase
        .from('contacts')
        .insert({
          name: formData.name.trim(),
          phone_number: phoneNumber,
          email: formData.email.trim() || null,
          cpf: formData.cpf.replace(/\D/g, '') || null,
          role: formData.role.trim() || null,
          is_billing_contact: formData.is_billing_contact,
          company_id: companyId
        });

      if (error) throw error;

      toast.success('Contato adicionado com sucesso!');
      resetForm();
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error('Error adding contact:', error);
      toast.error('Erro ao adicionar contato');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-slate-950 border-slate-800">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <User className="w-5 h-5 text-blue-400" />
            Adicionar Contato
          </DialogTitle>
          <div className="flex items-center gap-2 text-sm text-slate-400 mt-2">
            <Building2 className="w-4 h-4" />
            {companyName}
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-slate-300">
              Nome <span className="text-red-400">*</span>
            </Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Nome completo"
              className="bg-slate-900 border-slate-800"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone" className="text-slate-300">
                WhatsApp <span className="text-red-400">*</span>
              </Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData(prev => ({ ...prev, phone: formatPhone(e.target.value) }))}
                  placeholder="(43) 99999-9999"
                  className="bg-slate-900 border-slate-800 pl-9"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cpf" className="text-slate-300">CPF</Label>
              <Input
                id="cpf"
                value={formData.cpf}
                onChange={(e) => setFormData(prev => ({ ...prev, cpf: formatCPF(e.target.value) }))}
                placeholder="000.000.000-00"
                className="bg-slate-900 border-slate-800"
              />
            </div>
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
                placeholder="email@empresa.com.br"
                className="bg-slate-900 border-slate-800 pl-9"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="role" className="text-slate-300">Cargo</Label>
            <Input
              id="role"
              value={formData.role}
              onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value }))}
              placeholder="Ex: Gerente, Financeiro, Diretor"
              className="bg-slate-900 border-slate-800"
            />
          </div>

          <div className="flex items-center space-x-3 p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
            <Checkbox
              id="is_billing_contact"
              checked={formData.is_billing_contact}
              onCheckedChange={(checked) => 
                setFormData(prev => ({ ...prev, is_billing_contact: !!checked }))
              }
              className="border-yellow-500 data-[state=checked]:bg-yellow-500"
            />
            <Label htmlFor="is_billing_contact" className="text-sm text-yellow-300 cursor-pointer flex items-center gap-2">
              <BadgeCheck className="w-4 h-4" />
              Contato de Cobrança
              <span className="text-xs text-yellow-500/70">(recebe notificações de parcelas)</span>
            </Label>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-slate-700"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {loading ? 'Salvando...' : 'Adicionar Contato'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
