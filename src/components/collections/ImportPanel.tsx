import React, { useState, useCallback } from 'react';
import { useQueryClient, useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Upload, FileSpreadsheet, Check, X, AlertTriangle, Loader2, Download, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { ImportDocumentAIModal } from '@/components/segurados/ImportDocumentAIModal';

interface ColumnMapping {
  [key: string]: string;
}

interface ParsedRow {
  [key: string]: string;
}

const REQUIRED_FIELDS = [
  { key: 'name', label: 'Nome do Segurado', required: true },
  { key: 'phone', label: 'Telefone', required: true },
  { key: 'policy_number', label: 'Nº Apólice', required: true },
  { key: 'insurer', label: 'Seguradora', required: true },
  { key: 'installment', label: 'Nº Parcela', required: true },
  { key: 'value', label: 'Valor', required: true },
  { key: 'due_date', label: 'Vencimento', required: true },
  { key: 'email', label: 'Email', required: false },
  { key: 'cpf', label: 'CPF/CNPJ', required: false },
];

export const ImportPanel: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({});
  const [step, setStep] = useState<'upload' | 'mapping' | 'preview' | 'importing' | 'done'>('upload');
  const [importProgress, setImportProgress] = useState({ success: 0, error: 0, total: 0 });
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

  const handleProceedToPreview = () => {
    if (!validateMapping()) return;
    setStep('preview');
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
      setStep('importing');
      setImportProgress({ success: 0, error: 0, total: parsedData.length });

      let successCount = 0;
      let errorCount = 0;

      for (const row of parsedData) {
        try {
          const phoneNumber = row[columnMapping.phone]?.replace(/\D/g, '');
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
                name: row[columnMapping.name],
                email: row[columnMapping.email] || null
              })
              .select('id')
              .single();
            
            if (contactError) throw contactError;
            contactId = newContact.id;
          }

          // Create or find policy
          const policyNumber = row[columnMapping.policy_number];
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
                insurer: row[columnMapping.insurer]
              })
              .select('id')
              .single();
            
            if (policyError) throw policyError;
            policyId = newPolicy.id;
          }

          // Parse value
          let value = parseFloat(
            row[columnMapping.value]
              ?.replace(/[^\d,.-]/g, '')
              ?.replace(',', '.') || '0'
          );

          // Parse date
          const dueDateStr = row[columnMapping.due_date];
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

          // Create installment
          const { error: instError } = await supabase
            .from('installments')
            .insert({
              policy_id: policyId,
              contact_id: contactId,
              installment_number: parseInt(row[columnMapping.installment]) || 1,
              value: value,
              due_date: dueDate,
              status: new Date(dueDate) < new Date() ? 'overdue' : 'pending'
            });

          if (instError) throw instError;
          
          successCount++;
        } catch (err) {
          console.error('Error importing row:', err);
          errorCount++;
        }

        setImportProgress({
          success: successCount,
          error: errorCount,
          total: parsedData.length
        });
      }

      return { success: successCount, error: errorCount };
    },
    onSuccess: (result) => {
      setStep('done');
      queryClient.invalidateQueries({ queryKey: ['installments'] });
      queryClient.invalidateQueries({ queryKey: ['collection-summary'] });
      toast.success(`Importação concluída: ${result.success} sucesso, ${result.error} erros`);
    },
    onError: () => {
      toast.error('Erro durante a importação');
      setStep('preview');
    }
  });

  const resetImport = () => {
    setFile(null);
    setParsedData([]);
    setHeaders([]);
    setColumnMapping({});
    setStep('upload');
    setImportProgress({ success: 0, error: 0, total: 0 });
  };

  const downloadTemplate = () => {
    const template = 'Nome;Telefone;Email;CPF;Numero_Apolice;Seguradora;Parcela;Valor;Vencimento\nJoão Silva;11999999999;joao@email.com;12345678900;APO-001;Porto Seguro;1;350.00;01/01/2025';
    const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'template_importacao.csv';
    link.click();
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
              {parsedData.length} registros serão importados
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/5">
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
                  {parsedData.slice(0, 10).map((row, idx) => (
                    <TableRow key={idx} className="border-white/5">
                      <TableCell>{row[columnMapping.name]}</TableCell>
                      <TableCell>{row[columnMapping.phone]}</TableCell>
                      <TableCell>{row[columnMapping.policy_number]}</TableCell>
                      <TableCell>{row[columnMapping.insurer]}</TableCell>
                      <TableCell>{row[columnMapping.installment]}</TableCell>
                      <TableCell>{row[columnMapping.value]}</TableCell>
                      <TableCell>{row[columnMapping.due_date]}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {parsedData.length > 10 && (
              <p className="text-sm text-slate-500 mt-2">
                Mostrando 10 de {parsedData.length} registros
              </p>
            )}

            <div className="flex gap-4 mt-6">
              <Button variant="outline" onClick={() => setStep('mapping')} className="border-white/10">
                Voltar
              </Button>
              <Button 
                onClick={() => importMutation.mutate()}
                className="bg-amber-600 hover:bg-amber-700 gap-2"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Importar {parsedData.length} Registros
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
              {importProgress.success + importProgress.error} de {importProgress.total}
            </p>
            <div className="w-full max-w-md mx-auto bg-slate-800 rounded-full h-2">
              <div 
                className="bg-amber-500 h-2 rounded-full transition-all"
                style={{ 
                  width: `${((importProgress.success + importProgress.error) / importProgress.total) * 100}%` 
                }}
              />
            </div>
            <div className="flex justify-center gap-6 mt-4">
              <span className="text-green-400">{importProgress.success} sucesso</span>
              <span className="text-rose-400">{importProgress.error} erros</span>
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
              {importProgress.success} registros importados com sucesso
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
