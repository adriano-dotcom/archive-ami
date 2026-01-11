import React, { useState, useMemo, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangle, GitMerge, Building2, Users, FileText, Loader2, RefreshCw, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { MergeCompaniesModal } from './MergeCompaniesModal';

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
  companies: Company[];
  similarityScore: number;
  matchField: 'razao_social' | 'nome_fantasia' | 'both';
}

interface DuplicateCompaniesReportModalProps {
  open: boolean;
  companies: Company[];
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

// Levenshtein distance algorithm
const levenshteinDistance = (str1: string, str2: string): number => {
  const m = str1.length;
  const n = str2.length;
  
  if (m === 0) return n;
  if (n === 0) return m;
  
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,      // deletion
        dp[i][j - 1] + 1,      // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
    }
  }
  
  return dp[m][n];
};

// Normalize string for comparison
const normalizeString = (str: string): string => {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/\b(ltda|eireli|me|epp|sa|s\.a\.|s\/a|ltda\.)\b/gi, '') // legal terms
    .replace(/[^a-z0-9\s]/g, '') // keep only alphanumeric and spaces
    .replace(/\s+/g, ' ') // normalize spaces
    .trim();
};

// Calculate similarity between 0 and 1
const calculateSimilarity = (str1: string, str2: string): number => {
  const s1 = normalizeString(str1);
  const s2 = normalizeString(str2);
  
  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;
  
  const distance = levenshteinDistance(s1, s2);
  const maxLength = Math.max(s1.length, s2.length);
  
  return 1 - (distance / maxLength);
};

const formatCNPJ = (cnpj: string): string => {
  const cleaned = cnpj.replace(/\D/g, '');
  if (cleaned.length !== 14) return cnpj;
  return cleaned.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
};

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

export const DuplicateCompaniesReportModal: React.FC<DuplicateCompaniesReportModalProps> = ({
  open,
  companies,
  onOpenChange,
  onSuccess
}) => {
  const [analyzing, setAnalyzing] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [selectedGroupCompanies, setSelectedGroupCompanies] = useState<Company[]>([]);
  
  const SIMILARITY_THRESHOLD = 0.80;

  const findDuplicateGroups = useCallback((): DuplicateGroup[] => {
    const groups: DuplicateGroup[] = [];
    const processed = new Set<string>();
    
    for (let i = 0; i < companies.length; i++) {
      if (processed.has(companies[i].id)) continue;
      
      const group: Company[] = [companies[i]];
      let maxSimilarity = 0;
      let matchField: 'razao_social' | 'nome_fantasia' | 'both' = 'razao_social';
      
      for (let j = i + 1; j < companies.length; j++) {
        if (processed.has(companies[j].id)) continue;
        
        // Compare razao_social
        const simRazao = calculateSimilarity(
          companies[i].razao_social, 
          companies[j].razao_social
        );
        
        // Compare nome_fantasia if both exist
        let simFantasia = 0;
        if (companies[i].nome_fantasia && companies[j].nome_fantasia) {
          simFantasia = calculateSimilarity(
            companies[i].nome_fantasia, 
            companies[j].nome_fantasia
          );
        }
        
        const similarity = Math.max(simRazao, simFantasia);
        
        if (similarity >= SIMILARITY_THRESHOLD) {
          group.push(companies[j]);
          processed.add(companies[j].id);
          if (similarity > maxSimilarity) {
            maxSimilarity = similarity;
            if (simRazao >= SIMILARITY_THRESHOLD && simFantasia >= SIMILARITY_THRESHOLD) {
              matchField = 'both';
            } else if (simFantasia > simRazao) {
              matchField = 'nome_fantasia';
            } else {
              matchField = 'razao_social';
            }
          }
        }
      }
      
      if (group.length > 1) {
        processed.add(companies[i].id);
        groups.push({
          id: `group-${i}`,
          companies: group.sort((a, b) => b.contacts_count - a.contacts_count), // Most contacts first
          similarityScore: maxSimilarity,
          matchField
        });
      }
    }
    
    // Sort by score (highest first)
    return groups.sort((a, b) => b.similarityScore - a.similarityScore);
  }, [companies]);

  const duplicateGroups = useMemo(() => {
    if (!open || companies.length < 2) return [];
    setAnalyzing(true);
    const groups = findDuplicateGroups();
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

  const handleMergeClick = (groupCompanies: Company[]) => {
    setSelectedGroupCompanies(groupCompanies);
    setShowMergeModal(true);
  };

  const handleMergeSuccess = () => {
    setShowMergeModal(false);
    setSelectedGroupCompanies([]);
    onSuccess();
  };

  const getSimilarityColor = (score: number): string => {
    if (score >= 0.95) return 'text-red-400 bg-red-500/20';
    if (score >= 0.90) return 'text-orange-400 bg-orange-500/20';
    return 'text-amber-400 bg-amber-500/20';
  };

  const getMatchFieldLabel = (field: 'razao_social' | 'nome_fantasia' | 'both'): string => {
    switch (field) {
      case 'razao_social': return 'Razão Social';
      case 'nome_fantasia': return 'Nome Fantasia';
      case 'both': return 'Ambos';
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-100">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              Relatório de Duplicatas Potenciais
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Empresas com nomes similares que podem estar duplicadas no sistema
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
                <p className="text-slate-300 font-medium">Nenhuma duplicata encontrada!</p>
                <p className="text-slate-500 text-sm">
                  Todas as {companies.length} empresas parecem ser únicas.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-slate-300">
                    Encontrados <span className="text-amber-400 font-semibold">{duplicateGroups.length}</span> grupos 
                    de empresas potencialmente duplicadas
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

                <ScrollArea className="h-[50vh] pr-4">
                  <div className="space-y-3">
                    {duplicateGroups.map((group, index) => {
                      const isExpanded = expandedGroups.has(group.id);
                      const totalContacts = group.companies.reduce((sum, c) => sum + c.contacts_count, 0);
                      const totalPolicies = group.companies.reduce((sum, c) => sum + c.policies_count, 0);
                      
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
                                <Badge className={`${getSimilarityColor(group.similarityScore)}`}>
                                  {Math.round(group.similarityScore * 100)}% similar
                                </Badge>
                                <Badge variant="outline" className="border-slate-600 text-slate-400">
                                  {getMatchFieldLabel(group.matchField)}
                                </Badge>
                                <span className="text-slate-400 text-sm">
                                  {group.companies.length} empresas
                                </span>
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="flex items-center gap-4 text-xs text-slate-500">
                                  <span className="flex items-center gap-1">
                                    <Users className="w-3 h-3" />
                                    {totalContacts}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <FileText className="w-3 h-3" />
                                    {totalPolicies}
                                  </span>
                                </div>
                                {isExpanded ? (
                                  <ChevronUp className="w-5 h-5 text-slate-400" />
                                ) : (
                                  <ChevronDown className="w-5 h-5 text-slate-400" />
                                )}
                              </div>
                            </div>
                            
                            {/* Preview of company names */}
                            {!isExpanded && (
                              <div className="mt-2 text-sm text-slate-400 truncate">
                                {group.companies.map(c => c.razao_social).join(' • ')}
                              </div>
                            )}
                          </div>

                          {/* Expanded Content */}
                          {isExpanded && (
                            <div className="border-t border-slate-700/50">
                              <div className="p-4 space-y-2">
                                {group.companies.map((company, idx) => (
                                  <div 
                                    key={company.id}
                                    className={`flex items-center justify-between p-3 rounded-lg ${
                                      idx === 0 ? 'bg-blue-500/10 border border-blue-500/30' : 'bg-slate-800/50'
                                    }`}
                                  >
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <Building2 className="w-4 h-4 text-slate-500 flex-shrink-0" />
                                        <span className="font-medium text-slate-200 truncate">
                                          {company.razao_social}
                                        </span>
                                        {idx === 0 && (
                                          <Badge variant="secondary" className="bg-blue-500/20 text-blue-400 text-xs">
                                            Principal
                                          </Badge>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-4 mt-1 text-xs text-slate-500">
                                        <span>{formatCNPJ(company.cnpj)}</span>
                                        {company.city && company.state && (
                                          <span>{company.city}/{company.state}</span>
                                        )}
                                        {company.nome_fantasia && (
                                          <span className="text-slate-600">"{company.nome_fantasia}"</span>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-4 text-xs text-slate-400 flex-shrink-0 ml-4">
                                      <span className="flex items-center gap-1">
                                        <Users className="w-3 h-3" />
                                        {company.contacts_count}
                                      </span>
                                      <span className="flex items-center gap-1">
                                        <FileText className="w-3 h-3" />
                                        {company.policies_count}
                                      </span>
                                      {company.overdue_value > 0 && (
                                        <span className="text-red-400">
                                          {formatCurrency(company.overdue_value)}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>

                              <div className="p-4 pt-0">
                                <Button
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleMergeClick(group.companies);
                                  }}
                                  className="w-full bg-purple-600 hover:bg-purple-700 gap-2"
                                >
                                  <GitMerge className="w-4 h-4" />
                                  Mesclar Empresas deste Grupo
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

      {/* Merge Modal */}
      <MergeCompaniesModal
        open={showMergeModal}
        companies={selectedGroupCompanies.length > 0 ? selectedGroupCompanies : companies}
        onOpenChange={setShowMergeModal}
        onSuccess={handleMergeSuccess}
      />
    </>
  );
};
