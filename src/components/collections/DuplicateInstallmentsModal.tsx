import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { 
  AlertTriangle, GitMerge, FileText, Loader2, CheckCircle, 
  ChevronDown, ChevronUp, Check, Trash2, Copy, ListOrdered,
  Calendar, DollarSign, Hash
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Installment } from './installments';
import { useDuplicateDetection, DuplicateGroup } from './installments/useDuplicateDetection';

interface DuplicateInstallmentsModalProps {
  open: boolean;
  installments: Installment[];
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

const formatDate = (dateStr: string): string => {
  return format(new Date(dateStr), 'dd/MM/yyyy', { locale: ptBR });
};

export const DuplicateInstallmentsModal: React.FC<DuplicateInstallmentsModalProps> = ({
  open,
  installments,
  onOpenChange,
  onSuccess
}) => {
  const [analyzing, setAnalyzing] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ groupId: string; group: DuplicateGroup } | null>(null);

  const {
    duplicateGroups,
    groupSelections,
    initializeSelections,
    handleKeepChange,
    handleDeleteToggle,
    handleRenumberToggle,
    getSelectionStats,
    totalDuplicateGroups,
    exactDuplicatesCount,
    probableDuplicatesCount
  } = useDuplicateDetection(installments);

  // Initialize when modal opens
  useEffect(() => {
    if (open && installments.length > 0) {
      setAnalyzing(true);
      // Simulate brief analysis
      const timer = setTimeout(() => {
        initializeSelections();
        setExpandedGroups(new Set(duplicateGroups.slice(0, 3).map(g => g.id)));
        setAnalyzing(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [open, installments, initializeSelections, duplicateGroups]);

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

  const handleActionClick = (group: DuplicateGroup) => {
    const selection = groupSelections.get(group.id);
    if (!selection?.keepId && !selection?.renumber) {
      toast.error('Selecione uma ação: manter uma parcela ou renumerar');
      return;
    }
    if (!selection.renumber && selection.deleteIds.size === 0) {
      toast.error('Selecione pelo menos uma parcela para excluir');
      return;
    }
    setConfirmAction({ groupId: group.id, group });
  };

  const executeAction = async () => {
    if (!confirmAction) return;
    
    const { groupId, group } = confirmAction;
    const selection = groupSelections.get(groupId);
    if (!selection) return;
    
    setProcessing(true);
    try {
      if (selection.renumber) {
        // Renumber all installments in order
        const sorted = [...group.installments].sort((a, b) => 
          new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
        );
        
        for (let i = 0; i < sorted.length; i++) {
          const { error } = await supabase
            .from('installments')
            .update({ installment_number: i + 1 })
            .eq('id', sorted[i].id);
          
          if (error) throw error;
        }
        
        toast.success(`${sorted.length} parcelas renumeradas com sucesso!`);
      } else {
        // Delete selected installments
        const deleteIds = Array.from(selection.deleteIds);
        
        // Record history before deletion
        for (const id of deleteIds) {
          const inst = group.installments.find(i => i.id === id);
          if (inst) {
            await supabase
              .from('installment_history')
              .insert({
                installment_id: id,
                action: 'deleted_as_duplicate',
                previous_status: inst.status,
                previous_value: inst.value,
                notes: `Excluída como duplicata - mantida parcela ${selection.keepId}`,
                performed_at: new Date().toISOString()
              });
          }
        }
        
        const { error } = await supabase
          .from('installments')
          .delete()
          .in('id', deleteIds);
        
        if (error) throw error;
        
        toast.success(`${deleteIds.length} parcela(s) duplicada(s) excluída(s)!`);
      }
      
      setConfirmAction(null);
      onSuccess();
    } catch (error) {
      console.error('Error processing duplicates:', error);
      toast.error('Erro ao processar duplicatas');
    } finally {
      setProcessing(false);
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'exact':
        return <Badge className="bg-red-500/20 text-red-400 border-0">Duplicata Exata</Badge>;
      case 'probable':
        return <Badge className="bg-amber-500/20 text-amber-400 border-0">Provável Duplicata</Badge>;
      default:
        return <Badge className="bg-blue-500/20 text-blue-400 border-0">Possível Duplicata</Badge>;
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-100">
              <Copy className="w-5 h-5 text-amber-400" />
              Análise de Parcelas Duplicadas
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Detecta parcelas que podem ter sido importadas múltiplas vezes. Você pode manter uma e excluir as demais, ou renumerar.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            {analyzing ? (
              <div className="flex flex-col items-center justify-center py-12 gap-4">
                <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
                <p className="text-slate-400">Analisando {installments.length} parcelas...</p>
              </div>
            ) : totalDuplicateGroups === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-4">
                <CheckCircle className="w-12 h-12 text-emerald-400" />
                <p className="text-slate-300 font-medium">Nenhuma duplicata encontrada!</p>
                <p className="text-slate-500 text-sm">
                  As {installments.length} parcelas parecem estar corretas.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <p className="text-slate-300">
                      Encontrados <span className="text-amber-400 font-semibold">{totalDuplicateGroups}</span> grupo(s) 
                      com possíveis duplicatas
                    </p>
                    {exactDuplicatesCount > 0 && (
                      <Badge className="bg-red-500/20 text-red-400">
                        {exactDuplicatesCount} exata(s)
                      </Badge>
                    )}
                    {probableDuplicatesCount > 0 && (
                      <Badge className="bg-amber-500/20 text-amber-400">
                        {probableDuplicatesCount} provável(is)
                      </Badge>
                    )}
                  </div>
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
                      const { deleteCount, totalValue, keepInstallment } = getSelectionStats(group.id, group);
                      const canExecute = selection?.renumber || (selection?.keepId && deleteCount > 0);
                      
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
                                {getTypeBadge(group.type)}
                                <span className="text-slate-300 font-mono text-sm">
                                  {group.policy_number}
                                </span>
                                <span className="text-slate-400 text-sm">
                                  {group.installments.length} parcelas
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
                              <div className="mt-2 text-sm text-slate-400">
                                <span>{group.company_name}</span>
                                <span className="mx-2">•</span>
                                <span>{group.reason}</span>
                              </div>
                            )}
                          </div>

                          {/* Expanded Content */}
                          {isExpanded && (
                            <div className="border-t border-slate-700/50">
                              {/* Options */}
                              <div className="px-4 py-3 flex items-center justify-between bg-slate-800/30">
                                <div className="flex items-center gap-4">
                                  <p className="text-xs text-slate-500 flex items-center gap-2">
                                    <Check className="w-3 h-3 text-emerald-400" />
                                    Clique na parcela que deseja MANTER
                                  </p>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-xs text-slate-400">Renumerar em vez de excluir:</span>
                                  <Switch
                                    checked={selection?.renumber || false}
                                    onCheckedChange={() => handleRenumberToggle(group.id)}
                                  />
                                  <ListOrdered className={`w-4 h-4 ${selection?.renumber ? 'text-blue-400' : 'text-slate-500'}`} />
                                </div>
                              </div>
                              
                              <div className="px-4 pb-4 space-y-2 pt-2">
                                {group.installments.map((inst) => {
                                  const isKeep = selection?.keepId === inst.id;
                                  const isDelete = selection?.deleteIds.has(inst.id) || false;
                                  const isRenumberMode = selection?.renumber || false;
                                  
                                  return (
                                    <div 
                                      key={inst.id}
                                      onClick={() => !isRenumberMode && handleKeepChange(group.id, inst.id)}
                                      className={`relative flex items-start gap-3 p-3 rounded-lg transition-all ${
                                        isRenumberMode
                                          ? 'bg-slate-800/30 border border-slate-700/30'
                                          : isKeep 
                                            ? 'bg-emerald-500/10 border-2 border-emerald-500/50 ring-1 ring-emerald-500/20 cursor-pointer' 
                                            : isDelete
                                              ? 'bg-red-500/10 border border-red-500/30 cursor-pointer'
                                              : 'bg-slate-800/50 border border-slate-700/50 hover:border-slate-600 cursor-pointer'
                                      }`}
                                    >
                                      {/* Selection indicator */}
                                      {!isRenumberMode && (
                                        <div className="flex flex-col items-center gap-2 pt-1">
                                          {isKeep ? (
                                            <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                                              <Check className="w-3 h-3 text-white" />
                                            </div>
                                          ) : (
                                            <Checkbox
                                              checked={isDelete}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteToggle(group.id, inst.id);
                                              }}
                                              className="border-slate-500 data-[state=checked]:bg-red-500 data-[state=checked]:border-red-500"
                                            />
                                          )}
                                        </div>
                                      )}
                                      
                                      {/* Installment info */}
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-3 flex-wrap">
                                          <div className="flex items-center gap-1">
                                            <Hash className="w-3 h-3 text-slate-500" />
                                            <span className={`font-medium ${isKeep ? 'text-emerald-300' : 'text-slate-200'}`}>
                                              Parcela {inst.installment_number}
                                            </span>
                                          </div>
                                          <div className="flex items-center gap-1">
                                            <DollarSign className="w-3 h-3 text-slate-500" />
                                            <span className="text-slate-300">{formatCurrency(inst.value)}</span>
                                          </div>
                                          <div className="flex items-center gap-1">
                                            <Calendar className="w-3 h-3 text-slate-500" />
                                            <span className="text-slate-400">{formatDate(inst.due_date)}</span>
                                          </div>
                                          {inst.days_overdue > 0 && (
                                            <Badge className="bg-amber-500/20 text-amber-400 text-xs">
                                              {inst.days_overdue}d atraso
                                            </Badge>
                                          )}
                                          {!isRenumberMode && isKeep && (
                                            <Badge className="bg-emerald-500/20 text-emerald-400 text-xs border-0">
                                              MANTER
                                            </Badge>
                                          )}
                                          {!isRenumberMode && isDelete && (
                                            <Badge className="bg-red-500/20 text-red-400 text-xs border-0 flex items-center gap-1">
                                              <Trash2 className="w-3 h-3" />
                                              EXCLUIR
                                            </Badge>
                                          )}
                                          {isRenumberMode && (
                                            <Badge className="bg-blue-500/20 text-blue-400 text-xs border-0">
                                              Será renumerada
                                            </Badge>
                                          )}
                                        </div>
                                        
                                        <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                                          <span>Status: {inst.status}</span>
                                          <span>•</span>
                                          <span>ID: {inst.id.substring(0, 8)}</span>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                              
                              {/* Action footer */}
                              <div className="px-4 py-3 border-t border-slate-700/50 bg-slate-800/30 flex items-center justify-between">
                                <div className="text-sm text-slate-400">
                                  {selection?.renumber ? (
                                    <span className="flex items-center gap-2">
                                      <ListOrdered className="w-4 h-4 text-blue-400" />
                                      {group.installments.length} parcelas serão renumeradas (1, 2, 3...)
                                    </span>
                                  ) : (
                                    <span>
                                      {deleteCount > 0 && (
                                        <>
                                          <Trash2 className="w-4 h-4 inline mr-1 text-red-400" />
                                          {deleteCount} parcela(s) a excluir
                                          <span className="mx-2">•</span>
                                          Total: {formatCurrency(totalValue)}
                                        </>
                                      )}
                                    </span>
                                  )}
                                </div>
                                <Button
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleActionClick(group);
                                  }}
                                  disabled={!canExecute}
                                  className={selection?.renumber 
                                    ? "bg-blue-600 hover:bg-blue-700 gap-2"
                                    : "bg-amber-600 hover:bg-amber-700 gap-2"
                                  }
                                >
                                  {selection?.renumber ? (
                                    <>
                                      <ListOrdered className="w-4 h-4" />
                                      Renumerar
                                    </>
                                  ) : (
                                    <>
                                      <GitMerge className="w-4 h-4" />
                                      Resolver
                                    </>
                                  )}
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
              className="border-slate-600"
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <AlertDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-100 flex items-center gap-2">
              {confirmAction && groupSelections.get(confirmAction.groupId)?.renumber ? (
                <>
                  <ListOrdered className="w-5 h-5 text-blue-400" />
                  Confirmar Renumeração
                </>
              ) : (
                <>
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                  Confirmar Exclusão de Duplicatas
                </>
              )}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              {confirmAction && groupSelections.get(confirmAction.groupId)?.renumber ? (
                <>
                  As {confirmAction?.group.installments.length} parcelas da apólice{' '}
                  <span className="font-mono text-blue-400">{confirmAction?.group.policy_number}</span>
                  {' '}serão renumeradas sequencialmente (1, 2, 3...) por ordem de vencimento.
                </>
              ) : (
                <>
                  As parcelas selecionadas serão permanentemente excluídas.
                  {confirmAction && (
                    <>
                      {' '}Serão mantidos os dados na parcela principal e excluídas{' '}
                      <span className="text-red-400 font-semibold">
                        {groupSelections.get(confirmAction.groupId)?.deleteIds.size || 0}
                      </span>
                      {' '}duplicata(s).
                    </>
                  )}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-600 text-slate-300">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={executeAction}
              disabled={processing}
              className={confirmAction && groupSelections.get(confirmAction.groupId)?.renumber 
                ? "bg-blue-600 hover:bg-blue-700"
                : "bg-amber-600 hover:bg-amber-700"
              }
            >
              {processing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Processando...
                </>
              ) : (
                'Confirmar'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
