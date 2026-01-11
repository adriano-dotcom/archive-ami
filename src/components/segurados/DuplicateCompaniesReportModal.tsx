import React, { useState, useMemo, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertTriangle, GitMerge, Building2, Users, FileText, Loader2, CheckCircle, ChevronDown, ChevronUp, Check, Trash2, Copy } from 'lucide-react';
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
  billing_contacts_count: number;
  policies_count: number;
  overdue_value: number;
  max_days_overdue: number;
}

interface DuplicateGroup {
  id: string;
  cnpj: string;
  companies: Company[];
}

interface GroupSelection {
  destinationId: string | null;
  sourceIds: Set<string>;
}

interface DuplicateCompaniesReportModalProps {
  open: boolean;
  companies: Company[];
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const formatCNPJ = (cnpj: string): string => {
  const cleaned = cnpj.replace(/\D/g, '');
  if (cleaned.length !== 14) return cnpj;
  return cleaned.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
};

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

const normalizeCNPJ = (cnpj: string): string => {
  return cnpj.replace(/\D/g, '');
};

export const DuplicateCompaniesReportModal: React.FC<DuplicateCompaniesReportModalProps> = ({
  open,
  companies,
  onOpenChange,
  onSuccess
}) => {
  const [analyzing, setAnalyzing] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [groupSelections, setGroupSelections] = useState<Map<string, GroupSelection>>(new Map());
  const [merging, setMerging] = useState(false);
  const [confirmMerge, setConfirmMerge] = useState<{ groupId: string; group: DuplicateGroup } | null>(null);

  const findDuplicateGroups = useCallback((): DuplicateGroup[] => {
    // Agrupar empresas por CNPJ normalizado (apenas dígitos)
    const cnpjMap = new Map<string, Company[]>();
    
    companies.forEach(company => {
      const normalizedCNPJ = normalizeCNPJ(company.cnpj);
      if (!cnpjMap.has(normalizedCNPJ)) {
        cnpjMap.set(normalizedCNPJ, []);
      }
      cnpjMap.get(normalizedCNPJ)!.push(company);
    });
    
    // Converter para grupos apenas onde há duplicatas (>1 empresa)
    const groups: DuplicateGroup[] = [];
    let groupIndex = 0;
    
    cnpjMap.forEach((companiesWithSameCNPJ, cnpj) => {
      if (companiesWithSameCNPJ.length > 1) {
        groups.push({
          id: `group-${groupIndex++}`,
          cnpj: cnpj,
          companies: companiesWithSameCNPJ.sort((a, b) => 
            b.contacts_count - a.contacts_count
          )
        });
      }
    });
    
    // Ordenar por quantidade de empresas duplicadas
    return groups.sort((a, b) => b.companies.length - a.companies.length);
  }, [companies]);

  const duplicateGroups = useMemo(() => {
    if (!open || companies.length < 2) return [];
    setAnalyzing(true);
    const groups = findDuplicateGroups();
    
    // Initialize selections with first company as destination
    const initialSelections = new Map<string, GroupSelection>();
    groups.forEach(group => {
      initialSelections.set(group.id, {
        destinationId: group.companies[0].id,
        sourceIds: new Set(group.companies.slice(1).map(c => c.id))
      });
    });
    setGroupSelections(initialSelections);
    
    // Auto-expand first 3 groups
    setExpandedGroups(new Set(groups.slice(0, 3).map(g => g.id)));
    
    setAnalyzing(false);
    return groups;
  }, [open, companies, findDuplicateGroups]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const handleDestinationChange = (groupId: string, companyId: string) => {
    setGroupSelections(prev => {
      const next = new Map(prev);
      const current = next.get(groupId) || { destinationId: null, sourceIds: new Set() };
      
      // Remove from sources if it was there
      const newSources = new Set(current.sourceIds);
      newSources.delete(companyId);
      
      // If previous destination exists and is different, add it to sources
      if (current.destinationId && current.destinationId !== companyId) {
        newSources.add(current.destinationId);
      }
      
      next.set(groupId, {
        destinationId: companyId,
        sourceIds: newSources
      });
      return next;
    });
  };

  const handleSourceToggle = (groupId: string, companyId: string) => {
    setGroupSelections(prev => {
      const next = new Map(prev);
      const current = next.get(groupId) || { destinationId: null, sourceIds: new Set() };
      
      // Can't toggle if this is the destination
      if (current.destinationId === companyId) return prev;
      
      const newSources = new Set(current.sourceIds);
      if (newSources.has(companyId)) {
        newSources.delete(companyId);
      } else {
        newSources.add(companyId);
      }
      
      next.set(groupId, {
        ...current,
        sourceIds: newSources
      });
      return next;
    });
  };

  const handleMergeClick = (group: DuplicateGroup) => {
    const selection = groupSelections.get(group.id);
    if (!selection?.destinationId || selection.sourceIds.size === 0) {
      toast.error('Selecione a empresa principal e pelo menos uma empresa para mesclar');
      return;
    }
    setConfirmMerge({ groupId: group.id, group });
  };

  const executeMerge = async () => {
    if (!confirmMerge) return;
    
    const { groupId, group } = confirmMerge;
    const selection = groupSelections.get(groupId);
    if (!selection?.destinationId) return;
    
    setMerging(true);
    try {
      const destinationId = selection.destinationId;
      const sourceIds = Array.from(selection.sourceIds);
      
      for (const sourceId of sourceIds) {
        // Move contacts
        const { error: contactsError } = await supabase
          .from('contacts')
          .update({ company_id: destinationId })
          .eq('company_id', sourceId);
        
        if (contactsError) throw contactsError;
        
        // Move policies
        const { error: policiesError } = await supabase
          .from('policies')
          .update({ company_id: destinationId })
          .eq('company_id', sourceId);
        
        if (policiesError) throw policiesError;
        
        // Delete source company
        const { error: deleteError } = await supabase
          .from('companies')
          .delete()
          .eq('id', sourceId);
        
        if (deleteError) throw deleteError;
      }
      
      toast.success(`${sourceIds.length} empresa(s) mesclada(s) com sucesso!`);
      setConfirmMerge(null);
      onSuccess();
    } catch (error) {
      console.error('Error merging companies:', error);
      toast.error('Erro ao mesclar empresas');
    } finally {
      setMerging(false);
    }
  };

  const getSelectionStats = (groupId: string, group: DuplicateGroup) => {
    const selection = groupSelections.get(groupId);
    if (!selection) return { sourcesCount: 0, contactsToMove: 0, policiesToMove: 0, destination: null };
    
    const sourcesCount = selection.sourceIds.size;
    const sources = group.companies.filter(c => selection.sourceIds.has(c.id));
    const contactsToMove = sources.reduce((sum, c) => sum + c.contacts_count, 0);
    const policiesToMove = sources.reduce((sum, c) => sum + c.policies_count, 0);
    const destination = group.companies.find(c => c.id === selection.destinationId);
    
    return { sourcesCount, contactsToMove, policiesToMove, destination };
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-100">
              <Copy className="w-5 h-5 text-red-400" />
              Relatório de CNPJ Duplicados
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Empresas com o mesmo CNPJ cadastradas múltiplas vezes. Selecione qual manter e quais excluir.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            {analyzing ? (
              <div className="flex flex-col items-center justify-center py-12 gap-4">
                <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
                <p className="text-slate-400">Analisando {companies.length} empresas...</p>
              </div>
            ) : duplicateGroups.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-4">
                <CheckCircle className="w-12 h-12 text-emerald-400" />
                <p className="text-slate-300 font-medium">Nenhum CNPJ duplicado encontrado!</p>
                <p className="text-slate-500 text-sm">
                  Todas as {companies.length} empresas possuem CNPJ único.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-slate-300">
                    Encontrados <span className="text-red-400 font-semibold">{duplicateGroups.length}</span> CNPJ(s) 
                    com cadastros duplicados
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setExpandedGroups(new Set(duplicateGroups.map(g => g.id)))}
                    className="gap-2 border-slate-600 text-slate-300"
                  >
                    <ChevronDown className="w-4 h-4" />
                    Expandir Todos
                  </Button>
                </div>

                <ScrollArea className="h-[55vh] pr-4">
                  <div className="space-y-4">
                    {duplicateGroups.map((group, index) => {
                      const isExpanded = expandedGroups.has(group.id);
                      const selection = groupSelections.get(group.id);
                      const { sourcesCount, contactsToMove, policiesToMove, destination } = getSelectionStats(group.id, group);
                      const canMerge = selection?.destinationId && sourcesCount > 0;
                      
                      return (
                        <Card 
                          key={group.id} 
                          className="bg-slate-800/50 border-slate-700/50 overflow-hidden"
                        >
                          {/* Group Header */}
                          <div 
                            className="p-4 cursor-pointer hover:bg-slate-700/30 transition-colors"
                            onClick={() => toggleGroup(group.id)}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <span className="text-slate-500 text-sm font-medium">
                                  #{index + 1}
                                </span>
                                <Badge className="text-red-400 bg-red-500/20 border-0">
                                  CNPJ Duplicado
                                </Badge>
                                <span className="text-slate-300 font-mono text-sm">
                                  {formatCNPJ(group.cnpj)}
                                </span>
                                <span className="text-slate-400 text-sm">
                                  {group.companies.length} cadastros
                                </span>
                              </div>
                              <div className="flex items-center gap-3">
                                {isExpanded ? (
                                  <ChevronUp className="w-5 h-5 text-slate-400" />
                                ) : (
                                  <ChevronDown className="w-5 h-5 text-slate-400" />
                                )}
                              </div>
                            </div>
                            
                            {!isExpanded && (
                              <div className="mt-2 text-sm text-slate-400 truncate">
                                {group.companies.map(c => c.razao_social).join(' • ')}
                              </div>
                            )}
                          </div>

                          {/* Expanded Content */}
                          {isExpanded && (
                            <div className="border-t border-slate-700/50">
                              {/* Instructions */}
                              <div className="px-4 pt-3 pb-2">
                                <p className="text-xs text-slate-500 flex items-center gap-2">
                                  <Check className="w-3 h-3 text-emerald-400" />
                                  Clique na empresa que deseja MANTER como principal
                                </p>
                              </div>
                              
                              <div className="px-4 pb-4 space-y-2">
                                {group.companies.map((company) => {
                                  const isDestination = selection?.destinationId === company.id;
                                  const isSource = selection?.sourceIds.has(company.id) || false;
                                  
                                  return (
                                    <div 
                                      key={company.id}
                                      onClick={() => handleDestinationChange(group.id, company.id)}
                                      className={`relative flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-all ${
                                        isDestination 
                                          ? 'bg-emerald-500/10 border-2 border-emerald-500/50 ring-1 ring-emerald-500/20' 
                                          : isSource
                                            ? 'bg-red-500/10 border border-red-500/30'
                                            : 'bg-slate-800/50 border border-slate-700/50 hover:border-slate-600'
                                      }`}
                                    >
                                      {/* Selection indicator */}
                                      <div className="flex flex-col items-center gap-2 pt-1">
                                        {isDestination ? (
                                          <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                                            <Check className="w-3 h-3 text-white" />
                                          </div>
                                        ) : (
                                          <Checkbox
                                            checked={isSource}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleSourceToggle(group.id, company.id);
                                            }}
                                            className="border-slate-500 data-[state=checked]:bg-red-500 data-[state=checked]:border-red-500"
                                          />
                                        )}
                                      </div>
                                      
                                      {/* Company info */}
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <Building2 className="w-4 h-4 text-slate-500 flex-shrink-0" />
                                          <span className={`font-medium truncate ${isDestination ? 'text-emerald-300' : 'text-slate-200'}`}>
                                            {company.razao_social}
                                          </span>
                                          {isDestination && (
                                            <Badge className="bg-emerald-500/20 text-emerald-400 text-xs border-0">
                                              MANTER
                                            </Badge>
                                          )}
                                          {isSource && (
                                            <Badge className="bg-red-500/20 text-red-400 text-xs border-0 flex items-center gap-1">
                                              <Trash2 className="w-3 h-3" />
                                              EXCLUIR
                                            </Badge>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-4 mt-1.5 text-xs text-slate-500 flex-wrap">
                                          {company.city && company.state && (
                                            <span>{company.city}/{company.state}</span>
                                          )}
                                          {company.nome_fantasia && (
                                            <span className="text-slate-600 italic">"{company.nome_fantasia}"</span>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-4 mt-1.5 text-xs">
                                          <span className="flex items-center gap-1 text-slate-400">
                                            <Users className="w-3 h-3" />
                                            {company.contacts_count} contatos
                                          </span>
                                          <span className="flex items-center gap-1 text-slate-400">
                                            <FileText className="w-3 h-3" />
                                            {company.policies_count} apólices
                                          </span>
                                          {company.overdue_value > 0 && (
                                            <span className="text-red-400">
                                              {formatCurrency(company.overdue_value)} em aberto
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>

                              {/* Merge Action */}
                              <div className="px-4 pb-4">
                                {canMerge ? (
                                  <div className="bg-slate-900/50 rounded-lg p-3 mb-3">
                                    <p className="text-sm text-slate-300">
                                      <span className="text-amber-400 font-medium">{sourcesCount}</span> cadastro(s) serão excluídos.{' '}
                                      <span className="text-blue-400">{contactsToMove}</span> contatos e{' '}
                                      <span className="text-blue-400">{policiesToMove}</span> apólices serão movidos para{' '}
                                      <span className="text-emerald-400 font-medium">{destination?.razao_social.substring(0, 30)}...</span>
                                    </p>
                                  </div>
                                ) : (
                                  <div className="bg-slate-900/50 rounded-lg p-3 mb-3">
                                    <p className="text-sm text-slate-500">
                                      Marque pelo menos um cadastro para excluir (checkbox vermelho)
                                    </p>
                                  </div>
                                )}
                                
                                <Button
                                  size="sm"
                                  disabled={!canMerge || merging}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleMergeClick(group);
                                  }}
                                  className="w-full bg-purple-600 hover:bg-purple-700 gap-2 disabled:opacity-50"
                                >
                                  {merging ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <GitMerge className="w-4 h-4" />
                                  )}
                                  Mesclar {sourcesCount > 0 ? `${sourcesCount} Cadastro(s)` : 'Selecionados'}
                                </Button>
                              </div>
                            </div>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                </ScrollArea>
              </>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-slate-600 text-slate-300"
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <AlertDialog open={!!confirmMerge} onOpenChange={() => setConfirmMerge(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-100 flex items-center gap-2">
              <GitMerge className="w-5 h-5 text-purple-400" />
              Confirmar Mesclagem
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              {confirmMerge && (() => {
                const { sourcesCount, contactsToMove, policiesToMove, destination } = getSelectionStats(confirmMerge.groupId, confirmMerge.group);
                return (
                  <div className="space-y-3 mt-2">
                    <p>
                      Você está prestes a excluir <span className="text-amber-400 font-semibold">{sourcesCount}</span> cadastro(s) duplicado(s).
                    </p>
                    <div className="bg-slate-800 rounded-lg p-3 space-y-2 text-sm">
                      <p>
                        <span className="text-blue-400">{contactsToMove}</span> contatos e{' '}
                        <span className="text-blue-400">{policiesToMove}</span> apólices serão movidos.
                      </p>
                      <p>
                        Empresa que será mantida: <span className="text-emerald-400 font-medium">{destination?.razao_social}</span>
                      </p>
                    </div>
                    <p className="text-red-400 text-sm font-medium">
                      ⚠️ Esta ação não pode ser desfeita!
                    </p>
                  </div>
                );
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-600 text-slate-300 hover:bg-slate-800">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={executeMerge}
              disabled={merging}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {merging ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Mesclando...
                </>
              ) : (
                'Confirmar Mesclagem'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
