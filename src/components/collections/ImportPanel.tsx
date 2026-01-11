import React, { useState, useCallback, useMemo } from 'react';
import { useQueryClient, useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Upload, FileSpreadsheet, Check, X, AlertTriangle, Loader2, Download, Sparkles, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ImportDocumentAIModal } from '@/components/segurados/ImportDocumentAIModal';

interface ColumnMapping {
  [key: string]: string;
}

interface ParsedRow {
  [key: string]: string;
}

interface ProcessedRow {
  data: ParsedRow;
  duplicateStatus: 'new' | 'duplicate' | 'update_available' | 'checking' | 'error';
  existingInstallmentId?: string;
  existingValue?: number;
  existingStatus?: string;
  existingDueDate?: string;
  valueDiff?: number;
  errorMessage?: string;
  selected: boolean;
}

const REQUIRED_FIELDS = [
  { key: 'name', label: 'Nome do Segurado', required: false },
  { key: 'phone', label: 'Telefone', required: false },
  { key: 'policy_number', label: 'Nº Apólice', required: false },
  { key: 'insurer', label: 'Seguradora', required: false },
  { key: 'installment', label: 'Nº Parcela', required: false },
  { key: 'value', label: 'Valor', required: false },
  { key: 'due_date', label: 'Vencimento', required: false },
  { key: 'email', label: 'Email', required: false },
  { key: 'cpf', label: 'CPF/CNPJ', required: false },
];

interface ImportPanelProps {
  onGoToInstallments?: () => void;
}

export const ImportPanel: React.FC<ImportPanelProps> = ({ onGoToInstallments }) => {
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedRow[]>([]);
  const [processedData, setProcessedData] = useState<ProcessedRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({});
  const [step, setStep] = useState<'upload' | 'mapping' | 'preview' | 'importing' | 'done'>('upload');
  const [importProgress, setImportProgress] = useState({ success: 0, error: 0, updated: 0, total: 0 });
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [showAIImportModal, setShowAIImportModal] = useState(false);
  const queryClient = useQueryClient();

  const { data: savedMappings } = useQuery({
    queryKey: ['import-mappings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('import_mappings')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  // Calculate duplicate summary
  const duplicateSummary = useMemo(() => {
    const newCount = processedData.filter(r => r.duplicateStatus === 'new').length;
    const duplicateCount = processedData.filter(r => r.duplicateStatus === 'duplicate').length;
    const updateCount = processedData.filter(r => r.duplicateStatus === 'update_available').length;
    const errorCount = processedData.filter(r => r.duplicateStatus === 'error').length;
    const selectedCount = processedData.filter(r => r.selected).length;
    return { newCount, duplicateCount, updateCount, errorCount, selectedCount };
  }, [processedData]);

  const parseCSV = (text: string): { headers: string[], rows: ParsedRow[] } => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length === 0) return { headers: [], rows: [] };

    // Detect delimiter
    const firstLine = lines[0];
    const delimiter = firstLine.includes(';') ? ';' : ',';
    
    const headers = firstLine
      .split(delimiter)
      .map((h) => h.trim().replace(/"/g, ''))
      .map((h, i) => (h && h.trim() ? h : `__col_${i + 1}__`));
    const rows: ParsedRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(delimiter).map(v => v.trim().replace(/"/g, ''));
      const row: ParsedRow = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      rows.push(row);
    }

    return { headers, rows };
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    const validTypes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];

    if (!validTypes.includes(selectedFile.type) && !selectedFile.name.endsWith('.csv')) {
      toast.error('Formato não suportado. Use CSV ou Excel.');
      return;
    }

    setFile(selectedFile);

    // Parse CSV
    if (selectedFile.name.endsWith('.csv') || selectedFile.type === 'text/csv') {
      const text = await selectedFile.text();
      const { headers, rows } = parseCSV(text);
      setHeaders(headers);
      setParsedData(rows);
      setStep('mapping');
      toast.success(`Arquivo carregado: ${rows.length} linhas encontradas`);
    } else {
      toast.error('Por enquanto, apenas arquivos CSV são suportados');
    }
  };

  const handleMappingChange = (field: string, column: string) => {
    setColumnMapping(prev => ({
      ...prev,
      [field]: column
    }));
  };

  const applyMapping = (mappingId: string) => {
    const mapping = savedMappings?.find(m => m.id === mappingId);
    if (mapping && mapping.column_mappings) {
      setColumnMapping(mapping.column_mappings as ColumnMapping);
      toast.success('Mapeamento aplicado');
    }
  };

  const validateMapping = (): boolean => {
    const requiredFields = REQUIRED_FIELDS.filter(f => f.required).map(f => f.key);
    const missingFields = requiredFields.filter(f => !columnMapping[f]);
    
    if (missingFields.length > 0) {
      toast.error(`Campos obrigatórios não mapeados: ${missingFields.join(', ')}`);
      return false;
    }
    return true;
  };

  // Helper to parse date from various formats
  const parseDateString = (dueDateStr: string): string => {
    if (!dueDateStr) return '';
    if (dueDateStr.includes('/')) {
      const parts = dueDateStr.split('/');
      if (parts.length === 3) {
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }
    return dueDateStr;
  };

  // Helper to parse value from string
  const parseValueString = (valueStr: string): number => {
    return parseFloat(valueStr?.replace(/[^\d,.-]/g, '')?.replace(',', '.') || '0');
  };

  // Check for duplicates in the database - OPTIMIZED with batch queries
  const checkDuplicates = async (data: ParsedRow[]) => {
    setCheckingDuplicates(true);
    const startTime = Date.now();

    try {
      // Step 1: Extract all unique policy numbers from the data
      const policyNumbers = [...new Set(
        data
          .map(row => row[columnMapping.policy_number])
          .filter(Boolean)
      )];

      // Step 2: Batch fetch ALL policies at once (instead of N queries)
      const { data: allPolicies, error: policiesError } = await supabase
        .from('policies')
        .select('id, policy_number, contact_id')
        .in('policy_number', policyNumbers.length > 0 ? policyNumbers : ['__none__']);

      if (policiesError) {
        console.error('Error fetching policies:', policiesError);
        throw policiesError;
      }

      // Create a Map for O(1) lookup: policy_number -> policy
      const policyMap = new Map(
        (allPolicies || []).map(p => [p.policy_number, p])
      );

      // Step 3: Get all policy IDs to fetch installments
      const policyIds = (allPolicies || []).map(p => p.id);

      // Step 4: Batch fetch ALL installments for these policies at once
      const { data: allInstallments, error: installmentsError } = await supabase
        .from('installments')
        .select('id, policy_id, installment_number, due_date, value, status')
        .in('policy_id', policyIds.length > 0 ? policyIds : ['00000000-0000-0000-0000-000000000000']);

      if (installmentsError) {
        console.error('Error fetching installments:', installmentsError);
        throw installmentsError;
      }

      // Create a Map for O(1) lookup: "policy_id-installment_number-due_date" -> installment
      const installmentMap = new Map<string, typeof allInstallments[0]>();
      for (const inst of allInstallments || []) {
        const key = `${inst.policy_id}-${inst.installment_number}-${inst.due_date}`;
        installmentMap.set(key, inst);
      }

      // Step 5: Process all rows using the maps (no more DB queries needed)
      const results: ProcessedRow[] = data.map(row => {
        try {
          const policyNumber = row[columnMapping.policy_number];
          const installmentNumber = parseInt(row[columnMapping.installment]) || 1;
          const dueDate = parseDateString(row[columnMapping.due_date]);
          const value = parseValueString(row[columnMapping.value]);

          // If no policy number, mark as new
          if (!policyNumber) {
            return { data: row, duplicateStatus: 'new' as const, selected: true };
          }

          // Look up policy from map
          const existingPolicy = policyMap.get(policyNumber);
          if (!existingPolicy) {
            return { data: row, duplicateStatus: 'new' as const, selected: true };
          }

          // Look up installment from map
          const installmentKey = `${existingPolicy.id}-${installmentNumber}-${dueDate}`;
          const existingInstallment = installmentMap.get(installmentKey);

          if (!existingInstallment) {
            return { data: row, duplicateStatus: 'new' as const, selected: true };
          }

          // Check if values are the same
          const valueDiff = value - existingInstallment.value;
          const isSameValue = Math.abs(valueDiff) < 0.01;
          const expectedStatus = new Date(dueDate) < new Date() ? 'overdue' : 'pending';
          const isSameStatus = existingInstallment.status === expectedStatus;

          if (isSameValue && isSameStatus) {
            // Exact duplicate - deselect by default
            return {
              data: row,
              duplicateStatus: 'duplicate' as const,
              existingInstallmentId: existingInstallment.id,
              existingValue: existingInstallment.value,
              existingStatus: existingInstallment.status,
              existingDueDate: existingInstallment.due_date,
              selected: false
            };
          } else {
            // Update available - select by default
            return {
              data: row,
              duplicateStatus: 'update_available' as const,
              existingInstallmentId: existingInstallment.id,
              existingValue: existingInstallment.value,
              existingStatus: existingInstallment.status,
              existingDueDate: existingInstallment.due_date,
              valueDiff: !isSameValue ? valueDiff : undefined,
              selected: true
            };
          }
        } catch (err) {
          console.error('Error processing row:', err);
          return { 
            data: row, 
            duplicateStatus: 'error' as const, 
            errorMessage: err instanceof Error ? err.message : 'Erro desconhecido',
            selected: false 
          };
        }
      });

      setProcessedData(results);
      
      const elapsed = Date.now() - startTime;
      console.log(`Duplicate check completed in ${elapsed}ms for ${data.length} rows`);

      // Show summary toast
      const newCount = results.filter(r => r.duplicateStatus === 'new').length;
      const dupCount = results.filter(r => r.duplicateStatus === 'duplicate').length;
      const updateCount = results.filter(r => r.duplicateStatus === 'update_available').length;
      const errorCount = results.filter(r => r.duplicateStatus === 'error').length;

      if (dupCount > 0 || updateCount > 0 || errorCount > 0) {
        toast.info(
          `Verificação (${elapsed}ms): ${newCount} nova(s), ${dupCount} duplicada(s), ${updateCount} para atualizar${errorCount > 0 ? `, ${errorCount} erro(s)` : ''}`,
          { duration: 5000 }
        );
      } else {
        toast.success(`${newCount} parcelas novas prontas para importar (${elapsed}ms)`);
      }
    } catch (err) {
      console.error('Error in batch duplicate check:', err);
      // Fallback: mark all as new so user can proceed
      const results = data.map(row => ({ 
        data: row, 
        duplicateStatus: 'new' as const, 
        selected: true 
      }));
      setProcessedData(results);
      toast.error('Erro ao verificar duplicatas. Todas marcadas como novas.');
    } finally {
      setCheckingDuplicates(false);
    }
  };

  const handleProceedToPreview = async () => {
    if (!validateMapping()) return;
    setStep('preview');
    await checkDuplicates(parsedData);
  };

  const toggleRowSelection = (index: number, checked: boolean) => {
    setProcessedData(prev => 
      prev.map((row, i) => i === index ? { ...row, selected: checked } : row)
    );
  };

  const toggleAllSelection = (checked: boolean) => {
    setProcessedData(prev => 
      prev.map(row => ({ ...row, selected: checked }))
    );
  };

  const saveMappingMutation = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase
        .from('import_mappings')
        .insert({
          name,
          file_type: 'csv',
          column_mappings: columnMapping
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['import-mappings'] });
      toast.success('Mapeamento salvo');
    }
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      const dataToImport = processedData.filter(row => row.selected);
      
      setStep('importing');
      setImportProgress({ success: 0, error: 0, updated: 0, total: dataToImport.length });

      let successCount = 0;
      let errorCount = 0;
      let updatedCount = 0;

      for (const row of dataToImport) {
        try {
          const phoneNumber = row.data[columnMapping.phone]?.replace(/\D/g, '');
          if (!phoneNumber) {
            errorCount++;
            continue;
          }

          // Create or find contact
          let contactId: string;
          const { data: existingContact } = await supabase
            .from('contacts')
            .select('id')
            .eq('phone_number', phoneNumber)
            .single();

          if (existingContact) {
            contactId = existingContact.id;
          } else {
            const { data: newContact, error: contactError } = await supabase
              .from('contacts')
              .insert({
                phone_number: phoneNumber,
                name: row.data[columnMapping.name],
                email: row.data[columnMapping.email] || null
              })
              .select('id')
              .single();
            
            if (contactError) throw contactError;
            contactId = newContact.id;
          }

          // Create or find policy
          const policyNumber = row.data[columnMapping.policy_number];
          let policyId: string;

          const { data: existingPolicy } = await supabase
            .from('policies')
            .select('id')
            .eq('policy_number', policyNumber)
            .eq('contact_id', contactId)
            .single();

          if (existingPolicy) {
            policyId = existingPolicy.id;
          } else {
            const { data: newPolicy, error: policyError } = await supabase
              .from('policies')
              .insert({
                contact_id: contactId,
                policy_number: policyNumber,
                insurer: row.data[columnMapping.insurer]
              })
              .select('id')
              .single();
            
            if (policyError) throw policyError;
            policyId = newPolicy.id;
          }

          // Parse value
          let value = parseFloat(
            row.data[columnMapping.value]
              ?.replace(/[^\d,.-]/g, '')
              ?.replace(',', '.') || '0'
          );

          // Parse date
          const dueDateStr = row.data[columnMapping.due_date];
          let dueDate: string;
          
          // Try different date formats
          if (dueDateStr.includes('/')) {
            const parts = dueDateStr.split('/');
            if (parts.length === 3) {
              dueDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            } else {
              throw new Error('Formato de data inválido');
            }
          } else {
            dueDate = dueDateStr;
          }

          const newStatus = new Date(dueDate) < new Date() ? 'overdue' : 'pending';

          // If update_available, update existing installment
          if (row.duplicateStatus === 'update_available' && row.existingInstallmentId) {
            const { error: updateError } = await supabase
              .from('installments')
              .update({
                value: value,
                status: newStatus
              })
              .eq('id', row.existingInstallmentId);

            if (updateError) throw updateError;
            updatedCount++;
          } else {
            // Create new installment
            const { error: instError } = await supabase
              .from('installments')
              .insert({
                policy_id: policyId,
                contact_id: contactId,
                installment_number: parseInt(row.data[columnMapping.installment]) || 1,
                value: value,
                due_date: dueDate,
                status: newStatus
              });

            if (instError) throw instError;
            successCount++;
          }
        } catch (err) {
          console.error('Error importing row:', err);
          errorCount++;
        }

        setImportProgress({
          success: successCount,
          error: errorCount,
          updated: updatedCount,
          total: dataToImport.length
        });
      }

      return { success: successCount, error: errorCount, updated: updatedCount };
    },
    onSuccess: (result) => {
      setStep('done');
      queryClient.invalidateQueries({ queryKey: ['installments'] });
      queryClient.invalidateQueries({ queryKey: ['collection-summary'] });
      const messages = [];
      if (result.success > 0) messages.push(`${result.success} importado(s)`);
      if (result.updated > 0) messages.push(`${result.updated} atualizado(s)`);
      if (result.error > 0) messages.push(`${result.error} erro(s)`);
      toast.success(`Importação concluída: ${messages.join(', ')}`);
    },
    onError: () => {
      toast.error('Erro durante a importação');
      setStep('preview');
    }
  });

  const resetImport = () => {
    setFile(null);
    setParsedData([]);
    setProcessedData([]);
    setHeaders([]);
    setColumnMapping({});
    setStep('upload');
    setImportProgress({ success: 0, error: 0, updated: 0, total: 0 });
  };

  const downloadTemplate = () => {
    const template = 'Nome;Telefone;Email;CPF;Numero_Apolice;Seguradora;Parcela;Valor;Vencimento\nJoão Silva;11999999999;joao@email.com;12345678900;APO-001;Porto Seguro;1;350.00;01/01/2025';
    const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'template_importacao.csv';
    link.click();
  };

  const getDuplicateStatusBadge = (row: ProcessedRow) => {
    switch (row.duplicateStatus) {
      case 'new':
        return <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-400/30">Nova</Badge>;
      case 'duplicate':
        return <Badge className="bg-amber-500/20 text-amber-300 border-amber-400/30">Já importada</Badge>;
      case 'update_available':
        return (
          <div className="flex flex-col gap-1">
            <Badge className="bg-blue-500/20 text-blue-300 border-blue-400/30">Atualizar</Badge>
            {row.valueDiff !== undefined && (
              <span className="text-xs text-slate-400">
                {row.valueDiff > 0 ? '+' : ''}{row.valueDiff.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </span>
            )}
          </div>
        );
      case 'error':
        return (
          <Badge className="bg-rose-500/20 text-rose-300 border-rose-400/30" title={row.errorMessage}>
            Erro
          </Badge>
        );
      case 'checking':
        return <Badge className="bg-slate-500/20 text-slate-300 border-slate-400/30">Verificando...</Badge>;
      default:
        return null;
    }
  };

  // Quick selection helpers
  const selectOnlyNew = () => {
    setProcessedData(prev => 
      prev.map(row => ({ 
        ...row, 
        selected: row.duplicateStatus === 'new' 
      }))
    );
    toast.success('Apenas parcelas novas selecionadas');
  };

  const selectNewAndUpdates = () => {
    setProcessedData(prev => 
      prev.map(row => ({ 
        ...row, 
        selected: row.duplicateStatus === 'new' || row.duplicateStatus === 'update_available' 
      }))
    );
    toast.success('Novas + atualizações selecionadas');
  };

  return (
    <div className="space-y-4 pb-6">
      {/* Upload Step */}
      {step === 'upload' && (
        <Card className="bg-slate-900/50 border-white/5">
          <CardHeader>
            <CardTitle className="text-lg text-slate-200">Importar Arquivo de Inadimplência</CardTitle>
            <CardDescription>
              Faça upload de um arquivo CSV ou Excel com as parcelas vencidas
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-white/10 rounded-xl hover:border-amber-500/30 transition-colors">
              <Upload className="w-12 h-12 text-slate-500 mb-4" />
              <p className="text-slate-400 mb-4">Arraste um arquivo ou clique para selecionar</p>
              <Input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileChange}
                className="max-w-xs"
              />
              <p className="text-sm text-slate-500 mt-4">
                Formatos aceitos: CSV, Excel (.xlsx, .xls)
              </p>
            </div>

            <div className="mt-6 flex flex-col items-center gap-4">
              <div className="flex gap-4">
                <Button 
                  onClick={() => setShowAIImportModal(true)}
                  className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  Importar com IA
                </Button>
                <Button 
                  variant="outline" 
                  onClick={downloadTemplate}
                  className="gap-2 border-white/20 text-slate-200 hover:bg-slate-700/50"
                >
                  <Download className="w-4 h-4" />
                  Baixar Template
                </Button>
              </div>
              <p className="text-sm text-slate-500">
                Ou arraste um arquivo CSV/Excel para mapeamento manual
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Import Modal */}
      <ImportDocumentAIModal 
        open={showAIImportModal}
        onOpenChange={setShowAIImportModal}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['installments'] });
          queryClient.invalidateQueries({ queryKey: ['collection-summary'] });
        }}
        onGoToInstallments={onGoToInstallments}
      />

      {/* Mapping Step */}
      {step === 'mapping' && (
        <Card className="bg-slate-900/50 border-white/5">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg text-slate-200">Mapear Colunas</CardTitle>
                <CardDescription className="text-slate-400">
                  Associe as colunas do arquivo aos campos do sistema
                </CardDescription>
              </div>
              {savedMappings && savedMappings.length > 0 && (
                <Select onValueChange={applyMapping}>
                  <SelectTrigger className="w-[200px] bg-slate-800/50 border-white/10">
                    <SelectValue placeholder="Usar mapeamento salvo" />
                  </SelectTrigger>
                  <SelectContent>
                    {savedMappings.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {REQUIRED_FIELDS.map(field => (
                <div key={field.key} className="space-y-2">
                  <Label className="flex items-center gap-2 text-slate-100">
                    {field.label}
                    {field.required && <Badge variant="outline" className="text-xs bg-blue-500/20 text-blue-300 border-blue-400/50">Obrigatório</Badge>}
                  </Label>
                  <Select 
                    value={columnMapping[field.key] || '__none__'} 
                    onValueChange={(v) => handleMappingChange(field.key, v === '__none__' ? '' : v)}
                  >
                    <SelectTrigger className="bg-slate-800/50 border-white/20 text-slate-100">
                      <SelectValue placeholder="Selecione a coluna" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">-- Não mapear --</SelectItem>
                      {headers.map((h, i) => (
                        <SelectItem key={`${i}-${h}`} value={h}>
                          {h.startsWith('__col_') ? `(Sem cabeçalho) ${h}` : h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            <div className="flex gap-4 mt-6">
              <Button variant="outline" onClick={resetImport} className="border-white/20 text-slate-200 hover:bg-slate-700/50">
                Cancelar
              </Button>
              <Button 
                onClick={handleProceedToPreview}
                className="bg-amber-600 hover:bg-amber-700"
              >
                Continuar
              </Button>
              <Button 
                variant="outline"
                onClick={() => {
                  const name = prompt('Nome do mapeamento:');
                  if (name) saveMappingMutation.mutate(name);
                }}
                className="border-white/20 text-slate-200 hover:bg-slate-700/50"
              >
                Salvar Mapeamento
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Preview Step */}
      {step === 'preview' && (
        <Card className="bg-slate-900/50 border-white/5">
          <CardHeader>
            <CardTitle className="text-lg text-slate-200">Preview da Importação</CardTitle>
            <CardDescription>
              {checkingDuplicates ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Verificando duplicatas no banco de dados...
                </span>
              ) : (
                `${duplicateSummary.selectedCount} de ${processedData.length} registros selecionados para importar`
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Duplicate Summary Card */}
            {!checkingDuplicates && processedData.length > 0 && (
              <div className="mb-4 p-4 bg-slate-800/50 rounded-lg border border-white/5">
                <div className="flex flex-wrap items-center gap-4 mb-3">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-400/30">Nova</Badge>
                    <span className="text-slate-300 font-medium">{duplicateSummary.newCount}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-blue-500/20 text-blue-300 border-blue-400/30">Atualizar</Badge>
                    <span className="text-slate-300 font-medium">{duplicateSummary.updateCount}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-amber-500/20 text-amber-300 border-amber-400/30">Duplicada</Badge>
                    <span className="text-slate-300 font-medium">{duplicateSummary.duplicateCount}</span>
                  </div>
                  {duplicateSummary.errorCount > 0 && (
                    <div className="flex items-center gap-2">
                      <Badge className="bg-rose-500/20 text-rose-300 border-rose-400/30">Erro</Badge>
                      <span className="text-slate-300 font-medium">{duplicateSummary.errorCount}</span>
                    </div>
                  )}
                </div>
                
                {/* Quick selection buttons */}
                <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={selectOnlyNew}
                    className="text-xs h-7 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10"
                  >
                    Apenas novas
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={selectNewAndUpdates}
                    className="text-xs h-7 border-blue-500/30 text-blue-300 hover:bg-blue-500/10"
                  >
                    Novas + atualizações
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => toggleAllSelection(false)}
                    className="text-xs h-7 border-white/10 text-slate-400 hover:bg-slate-700/50"
                  >
                    Desmarcar tudo
                  </Button>
                  {duplicateSummary.duplicateCount > 0 && (
                    <span className="text-xs text-slate-500 ml-auto self-center">
                      Duplicatas são desmarcadas automaticamente
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/5">
                    <TableHead className="w-[50px]">
                      <Checkbox
                        checked={processedData.length > 0 && processedData.every(r => r.selected)}
                        onCheckedChange={(checked) => toggleAllSelection(!!checked)}
                        disabled={checkingDuplicates}
                      />
                    </TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Apólice</TableHead>
                    <TableHead>Seguradora</TableHead>
                    <TableHead>Parcela</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Vencimento</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {checkingDuplicates ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8">
                        <div className="flex flex-col items-center gap-2">
                          <RefreshCw className="w-6 h-6 text-amber-400 animate-spin" />
                          <span className="text-slate-400">Verificando duplicatas...</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    processedData.slice(0, 50).map((row, idx) => (
                      <TableRow 
                        key={idx} 
                        className={`border-white/5 ${
                          row.duplicateStatus === 'duplicate' ? 'opacity-50' : ''
                        }`}
                      >
                        <TableCell>
                          <Checkbox
                            checked={row.selected}
                            onCheckedChange={(checked) => toggleRowSelection(idx, !!checked)}
                          />
                        </TableCell>
                        <TableCell>
                          {getDuplicateStatusBadge(row)}
                        </TableCell>
                        <TableCell>{row.data[columnMapping.name]}</TableCell>
                        <TableCell>{row.data[columnMapping.phone]}</TableCell>
                        <TableCell>{row.data[columnMapping.policy_number]}</TableCell>
                        <TableCell>{row.data[columnMapping.insurer]}</TableCell>
                        <TableCell>{row.data[columnMapping.installment]}</TableCell>
                        <TableCell>
                          {row.duplicateStatus === 'update_available' && row.existingValue ? (
                            <span className="flex items-center gap-1">
                              <span className="line-through text-slate-500">
                                {row.existingValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                              </span>
                              <span className="text-blue-300">→</span>
                              <span>{row.data[columnMapping.value]}</span>
                            </span>
                          ) : (
                            row.data[columnMapping.value]
                          )}
                        </TableCell>
                        <TableCell>{row.data[columnMapping.due_date]}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            {processedData.length > 50 && (
              <p className="text-sm text-slate-500 mt-2">
                Mostrando 50 de {processedData.length} registros
              </p>
            )}

            <div className="flex gap-4 mt-6">
              <Button variant="outline" onClick={() => setStep('mapping')} className="border-white/10">
                Voltar
              </Button>
              <Button 
                onClick={() => importMutation.mutate()}
                className="bg-amber-600 hover:bg-amber-700 gap-2"
                disabled={checkingDuplicates || duplicateSummary.selectedCount === 0}
              >
                <FileSpreadsheet className="w-4 h-4" />
                Importar {duplicateSummary.selectedCount} Registros
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Importing Step */}
      {step === 'importing' && (
        <Card className="bg-slate-900/50 border-white/5">
          <CardContent className="p-12 text-center">
            <Loader2 className="w-12 h-12 text-amber-400 animate-spin mx-auto mb-4" />
            <h3 className="text-xl font-bold text-slate-200 mb-2">Importando...</h3>
            <p className="text-slate-400 mb-4">
              {importProgress.success + importProgress.error + importProgress.updated} de {importProgress.total}
            </p>
            <div className="w-full max-w-md mx-auto bg-slate-800 rounded-full h-2">
              <div 
                className="bg-amber-500 h-2 rounded-full transition-all"
                style={{ 
                  width: `${((importProgress.success + importProgress.error + importProgress.updated) / importProgress.total) * 100}%` 
                }}
              />
            </div>
            <div className="flex justify-center gap-6 mt-4">
              <span className="text-green-400">{importProgress.success} novo(s)</span>
              <span className="text-blue-400">{importProgress.updated} atualizado(s)</span>
              <span className="text-rose-400">{importProgress.error} erro(s)</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Done Step */}
      {step === 'done' && (
        <Card className="bg-slate-900/50 border-white/5">
          <CardContent className="p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-green-400" />
            </div>
            <h3 className="text-xl font-bold text-slate-200 mb-2">Importação Concluída!</h3>
            <p className="text-slate-400 mb-6">
              {importProgress.success > 0 && `${importProgress.success} registros importados`}
              {importProgress.updated > 0 && `, ${importProgress.updated} atualizados`}
              {importProgress.error > 0 && `, ${importProgress.error} erros`}
            </p>
            <Button onClick={resetImport} className="bg-amber-600 hover:bg-amber-700">
              Importar Novo Arquivo
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
