import React, { useState, useEffect, useMemo } from 'react';
import { GitMerge, Building2, Users, FileText, AlertTriangle, ArrowRight, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Company {
  id: string;
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  city: string | null;
  state: string | null;
  contacts_count: number;
  billing_contacts_count?: number;
  policies_count: number;
}

interface MergeCompaniesModalProps {
  open: boolean;
  companies: Company[];
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const formatCNPJ = (cnpj: string) => {
  const cleaned = cnpj.replace(/\D/g, '');
  if (cleaned.length !== 14) return cnpj;
  return cleaned.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
};

export const MergeCompaniesModal: React.FC<MergeCompaniesModalProps> = ({
  open,
  companies,
  onOpenChange,
  onSuccess
}) => {
  const [sourceId, setSourceId] = useState<string>('');
  const [destinationId, setDestinationId] = useState<string>('');
  const [mergeData, setMergeData] = useState(true);
  const [loading, setLoading] = useState(false);
  const [sourceDetails, setSourceDetails] = useState<{ contacts: number; policies: number } | null>(null);

  const sourceCompany = useMemo(() => companies.find(c => c.id === sourceId), [companies, sourceId]);
  const destinationCompany = useMemo(() => companies.find(c => c.id === destinationId), [companies, destinationId]);

  // Filter out already selected company from opposite dropdown
  const availableForSource = useMemo(() => 
    companies.filter(c => c.id !== destinationId), 
    [companies, destinationId]
  );
  
  const availableForDestination = useMemo(() => 
    companies.filter(c => c.id !== sourceId), 
    [companies, sourceId]
  );

  // Fetch actual counts when source is selected
  useEffect(() => {
    if (!sourceId) {
      setSourceDetails(null);
      return;
    }

    const fetchDetails = async () => {
      const [contactsRes, policiesRes] = await Promise.all([
        supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('company_id', sourceId),
        supabase.from('policies').select('*', { count: 'exact', head: true }).eq('company_id', sourceId)
      ]);

      setSourceDetails({
        contacts: contactsRes.count || 0,
        policies: policiesRes.count || 0
      });
    };

    fetchDetails();
  }, [sourceId]);

  const handleMerge = async () => {
    if (!sourceCompany || !destinationCompany) {
      toast.error('Selecione ambas as empresas');
      return;
    }

    if (sourceId === destinationId) {
      toast.error('As empresas devem ser diferentes');
      return;
    }

    setLoading(true);

    try {
      // 1. Move contacts to destination company
      const { error: contactsError } = await supabase
        .from('contacts')
        .update({ 
          company_id: destinationId,
          company: destinationCompany.nome_fantasia || destinationCompany.razao_social
        })
        .eq('company_id', sourceId);

      if (contactsError) throw contactsError;

      // 2. Move policies to destination company
      const { error: policiesError } = await supabase
        .from('policies')
        .update({ company_id: destinationId })
        .eq('company_id', sourceId);

      if (policiesError) throw policiesError;

      // 3. Optionally merge data (fill empty fields in destination)
      if (mergeData) {
        const { data: destData } = await supabase
          .from('companies')
          .select('*')
          .eq('id', destinationId)
          .single();

        const { data: srcData } = await supabase
          .from('companies')
          .select('*')
          .eq('id', sourceId)
          .single();

        if (destData && srcData) {
          const updates: Record<string, string | null> = {};
          
          // Fill empty fields with source data
          if (!destData.nome_fantasia && srcData.nome_fantasia) updates.nome_fantasia = srcData.nome_fantasia;
          if (!destData.city && srcData.city) updates.city = srcData.city;
          if (!destData.state && srcData.state) updates.state = srcData.state;
          if (!destData.cep && srcData.cep) updates.cep = srcData.cep;
          if (!destData.street && srcData.street) updates.street = srcData.street;
          if (!destData.number && srcData.number) updates.number = srcData.number;
          if (!destData.neighborhood && srcData.neighborhood) updates.neighborhood = srcData.neighborhood;
          if (!destData.complement && srcData.complement) updates.complement = srcData.complement;
          if (!destData.inscricao_estadual && srcData.inscricao_estadual) updates.inscricao_estadual = srcData.inscricao_estadual;
          if (!destData.inscricao_municipal && srcData.inscricao_municipal) updates.inscricao_municipal = srcData.inscricao_municipal;
          if (!destData.notes && srcData.notes) {
            updates.notes = srcData.notes;
          } else if (destData.notes && srcData.notes) {
            updates.notes = `${destData.notes}\n\n--- Mesclado de ${srcData.razao_social} ---\n${srcData.notes}`;
          }

          if (Object.keys(updates).length > 0) {
            await supabase
              .from('companies')
              .update(updates)
              .eq('id', destinationId);
          }
        }
      }

      // 4. Delete source company
      const { error: deleteError } = await supabase
        .from('companies')
        .delete()
        .eq('id', sourceId);

      if (deleteError) throw deleteError;

      toast.success(`Empresa "${sourceCompany.razao_social}" mesclada com sucesso!`);
      onSuccess();
      onOpenChange(false);
      
      // Reset state
      setSourceId('');
      setDestinationId('');
      setMergeData(true);
    } catch (error) {
      console.error('Erro ao mesclar empresas:', error);
      toast.error('Erro ao mesclar empresas. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const isValid = sourceId && destinationId && sourceId !== destinationId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-slate-900 border-slate-700">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-100">
            <GitMerge className="w-5 h-5 text-purple-400" />
            Mesclar Empresas Duplicadas
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Unifique duas empresas duplicadas, movendo contatos e apólices para o cadastro principal.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Source Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-red-400">
              Empresa de Origem (será excluída)
            </label>
            <Select value={sourceId} onValueChange={setSourceId}>
              <SelectTrigger className="bg-slate-800 border-slate-600">
                <SelectValue placeholder="Selecione a empresa duplicada..." />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700 max-h-[300px]">
                {availableForSource.map(company => (
                  <SelectItem key={company.id} value={company.id}>
                    <div className="flex items-center gap-2">
                      <span>{company.nome_fantasia || company.razao_social}</span>
                      <span className="text-slate-500 text-xs">({formatCNPJ(company.cnpj)})</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Destination Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-emerald-400">
              Empresa de Destino (será mantida)
            </label>
            <Select value={destinationId} onValueChange={setDestinationId}>
              <SelectTrigger className="bg-slate-800 border-slate-600">
                <SelectValue placeholder="Selecione a empresa principal..." />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700 max-h-[300px]">
                {availableForDestination.map(company => (
                  <SelectItem key={company.id} value={company.id}>
                    <div className="flex items-center gap-2">
                      <span>{company.nome_fantasia || company.razao_social}</span>
                      <span className="text-slate-500 text-xs">({formatCNPJ(company.cnpj)})</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Preview */}
          {sourceCompany && destinationCompany && (
            <div className="grid grid-cols-[1fr,auto,1fr] gap-4 items-center">
              {/* Source Card */}
              <Card className="p-4 bg-red-950/20 border-red-500/30">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-red-400" />
                    <span className="font-medium text-red-300 text-sm">ORIGEM</span>
                  </div>
                  <p className="font-semibold text-slate-100 truncate">
                    {sourceCompany.nome_fantasia || sourceCompany.razao_social}
                  </p>
                  <p className="text-xs text-slate-400">{formatCNPJ(sourceCompany.cnpj)}</p>
                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {sourceDetails?.contacts ?? sourceCompany.contacts_count} contatos
                    </span>
                    <span className="flex items-center gap-1">
                      <FileText className="w-3 h-3" />
                      {sourceDetails?.policies ?? sourceCompany.policies_count} apólices
                    </span>
                  </div>
                  {sourceCompany.city && (
                    <p className="text-xs text-slate-500">{sourceCompany.city}/{sourceCompany.state}</p>
                  )}
                </div>
              </Card>

              {/* Arrow */}
              <div className="flex flex-col items-center gap-1">
                <ArrowRight className="w-6 h-6 text-purple-400" />
                <span className="text-xs text-slate-500">mover para</span>
              </div>

              {/* Destination Card */}
              <Card className="p-4 bg-emerald-950/20 border-emerald-500/30">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-emerald-400" />
                    <span className="font-medium text-emerald-300 text-sm">DESTINO</span>
                  </div>
                  <p className="font-semibold text-slate-100 truncate">
                    {destinationCompany.nome_fantasia || destinationCompany.razao_social}
                  </p>
                  <p className="text-xs text-slate-400">{formatCNPJ(destinationCompany.cnpj)}</p>
                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {destinationCompany.contacts_count} contatos
                    </span>
                    <span className="flex items-center gap-1">
                      <FileText className="w-3 h-3" />
                      {destinationCompany.policies_count} apólices
                    </span>
                  </div>
                  {destinationCompany.city && (
                    <p className="text-xs text-slate-500">{destinationCompany.city}/{destinationCompany.state}</p>
                  )}
                </div>
              </Card>
            </div>
          )}

          {/* Warning */}
          {isValid && sourceDetails && (
            <div className="flex items-start gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-200 space-y-1">
                <p className="font-medium">Esta ação irá:</p>
                <ul className="list-disc list-inside space-y-0.5 text-amber-300/80">
                  <li>Mover {sourceDetails.contacts} contato(s) para "{destinationCompany?.nome_fantasia || destinationCompany?.razao_social}"</li>
                  <li>Mover {sourceDetails.policies} apólice(s) para "{destinationCompany?.nome_fantasia || destinationCompany?.razao_social}"</li>
                  <li>Excluir permanentemente "{sourceCompany?.razao_social}"</li>
                </ul>
              </div>
            </div>
          )}

          {/* Merge Data Option */}
          <div className="flex items-center gap-3">
            <Checkbox
              id="mergeData"
              checked={mergeData}
              onCheckedChange={(checked) => setMergeData(checked as boolean)}
            />
            <label htmlFor="mergeData" className="text-sm text-slate-300 cursor-pointer">
              Preencher campos vazios do destino com dados da origem
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-slate-600 text-slate-300"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleMerge}
            disabled={!isValid || loading}
            className="bg-purple-600 hover:bg-purple-700 gap-2"
          >
            {loading ? (
              <>Mesclando...</>
            ) : (
              <>
                <Check className="w-4 h-4" />
                Confirmar Mesclagem
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
