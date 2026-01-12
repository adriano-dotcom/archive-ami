import { useMemo, useState, useCallback } from 'react';
import { Installment } from './useInstallments';

export type DuplicateType = 'exact' | 'probable' | 'possible';

export interface DuplicateGroup {
  id: string;
  type: DuplicateType;
  policy_number: string;
  company_name: string;
  reason: string;
  installments: Installment[];
}

export interface GroupSelection {
  keepId: string | null;
  deleteIds: Set<string>;
  renumber: boolean;
}

/**
 * Hook to detect duplicate installments based on different criteria
 */
export function useDuplicateDetection(installments: Installment[]) {
  const [groupSelections, setGroupSelections] = useState<Map<string, GroupSelection>>(new Map());

  /**
   * Detect duplicates grouped by criteria:
   * - exact: same policy_id + same value + same due_date
   * - probable: same policy_id + same installment_number (different dates/values)
   * - possible: same company + similar policy + close values
   */
  const duplicateGroups = useMemo((): DuplicateGroup[] => {
    if (!installments || installments.length === 0) return [];

    const groups: DuplicateGroup[] = [];
    let groupIndex = 0;

    // Group by policy_id + installment_number for probable duplicates
    const policyInstallmentMap = new Map<string, Installment[]>();
    
    installments.forEach(inst => {
      if (!inst.policy?.id) return;
      const key = `${inst.policy.id}_${inst.installment_number}`;
      if (!policyInstallmentMap.has(key)) {
        policyInstallmentMap.set(key, []);
      }
      policyInstallmentMap.get(key)!.push(inst);
    });

    // Find probable duplicates (same policy + same installment number)
    policyInstallmentMap.forEach((group, key) => {
      if (group.length > 1) {
        // Check if they have different dates/values (not exact same entry)
        const uniqueEntries = new Set(group.map(i => `${i.due_date}_${i.value}`));
        
        if (uniqueEntries.size > 1) {
          // Different dates or values = probable duplicate (imported multiple times)
          const firstInst = group[0];
          groups.push({
            id: `group-${groupIndex++}`,
            type: 'probable',
            policy_number: firstInst.policy?.policy_number || 'N/A',
            company_name: firstInst.policy?.company?.nome_fantasia || 
                         firstInst.policy?.company?.razao_social || 'N/A',
            reason: `${group.length} parcelas com número ${firstInst.installment_number} - datas/valores diferentes`,
            installments: group.sort((a, b) => 
              new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
            )
          });
        } else if (uniqueEntries.size === 1) {
          // Exact same date AND value = exact duplicate
          const firstInst = group[0];
          groups.push({
            id: `group-${groupIndex++}`,
            type: 'exact',
            policy_number: firstInst.policy?.policy_number || 'N/A',
            company_name: firstInst.policy?.company?.nome_fantasia || 
                         firstInst.policy?.company?.razao_social || 'N/A',
            reason: `${group.length} parcelas idênticas (mesmo valor e vencimento)`,
            installments: group
          });
        }
      }
    });

    // Sort groups: exact first, then probable, then possible
    // Within each type, sort by number of installments (descending)
    const typeOrder: Record<DuplicateType, number> = { 
      exact: 0, 
      probable: 1, 
      possible: 2 
    };

    return groups.sort((a, b) => {
      const typeCompare = typeOrder[a.type] - typeOrder[b.type];
      if (typeCompare !== 0) return typeCompare;
      return b.installments.length - a.installments.length;
    });
  }, [installments]);

  // Initialize selections when groups change
  const initializeSelections = useCallback(() => {
    const initial = new Map<string, GroupSelection>();
    duplicateGroups.forEach(group => {
      // Default: keep the oldest (first by date), delete the rest
      const sorted = [...group.installments].sort((a, b) => 
        new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
      );
      
      initial.set(group.id, {
        keepId: sorted[0]?.id || null,
        deleteIds: new Set(sorted.slice(1).map(i => i.id)),
        renumber: group.type === 'probable' // Default to renumber for probable duplicates
      });
    });
    setGroupSelections(initial);
    return initial;
  }, [duplicateGroups]);

  const handleKeepChange = useCallback((groupId: string, installmentId: string) => {
    setGroupSelections(prev => {
      const next = new Map(prev);
      const current = next.get(groupId) || { keepId: null, deleteIds: new Set(), renumber: false };
      
      // Remove from deleteIds if it was there
      const newDeleteIds = new Set(current.deleteIds);
      newDeleteIds.delete(installmentId);
      
      // If previous keep exists and is different, add to deleteIds
      if (current.keepId && current.keepId !== installmentId) {
        newDeleteIds.add(current.keepId);
      }
      
      next.set(groupId, {
        ...current,
        keepId: installmentId,
        deleteIds: newDeleteIds
      });
      
      return next;
    });
  }, []);

  const handleDeleteToggle = useCallback((groupId: string, installmentId: string) => {
    setGroupSelections(prev => {
      const next = new Map(prev);
      const current = next.get(groupId) || { keepId: null, deleteIds: new Set(), renumber: false };
      
      // Can't toggle if this is the keep
      if (current.keepId === installmentId) return prev;
      
      const newDeleteIds = new Set(current.deleteIds);
      if (newDeleteIds.has(installmentId)) {
        newDeleteIds.delete(installmentId);
      } else {
        newDeleteIds.add(installmentId);
      }
      
      next.set(groupId, {
        ...current,
        deleteIds: newDeleteIds
      });
      
      return next;
    });
  }, []);

  const handleRenumberToggle = useCallback((groupId: string) => {
    setGroupSelections(prev => {
      const next = new Map(prev);
      const current = next.get(groupId) || { keepId: null, deleteIds: new Set(), renumber: false };
      
      next.set(groupId, {
        ...current,
        renumber: !current.renumber
      });
      
      return next;
    });
  }, []);

  const getSelectionStats = useCallback((groupId: string, group: DuplicateGroup) => {
    const selection = groupSelections.get(groupId);
    if (!selection) return { deleteCount: 0, totalValue: 0, keepInstallment: null };
    
    const deleteCount = selection.deleteIds.size;
    const deleteInstallments = group.installments.filter(i => selection.deleteIds.has(i.id));
    const totalValue = deleteInstallments.reduce((sum, i) => sum + (i.value || 0), 0);
    const keepInstallment = group.installments.find(i => i.id === selection.keepId) || null;
    
    return { deleteCount, totalValue, keepInstallment };
  }, [groupSelections]);

  return {
    duplicateGroups,
    groupSelections,
    initializeSelections,
    handleKeepChange,
    handleDeleteToggle,
    handleRenumberToggle,
    getSelectionStats,
    totalDuplicateGroups: duplicateGroups.length,
    exactDuplicatesCount: duplicateGroups.filter(g => g.type === 'exact').length,
    probableDuplicatesCount: duplicateGroups.filter(g => g.type === 'probable').length,
  };
}
