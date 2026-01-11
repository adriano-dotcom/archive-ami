import React, { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, AlertCircle, Check, X, Download, Loader2, ArrowRight } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ImportCompaniesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface ColumnMapping {
  [key: string]: string;
}

interface PreviewRow {
  data: Record<string, string>;
  errors: string[];
  valid: boolean;
}

const REQUIRED_FIELDS = ['cnpj', 'razao_social'];
const OPTIONAL_FIELDS = ['nome_fantasia', 'inscricao_estadual', 'inscricao_municipal', 'cep', 'street', 'number', 'complement', 'neighborhood', 'city', 'state', 'notes'];
const ALL_FIELDS = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS];

const FIELD_LABELS: Record<string, string> = {
  cnpj: 'CNPJ *',
  razao_social: 'Razão Social *',
  nome_fantasia: 'Nome Fantasia',
  inscricao_estadual: 'Inscrição Estadual',
  inscricao_municipal: 'Inscrição Municipal',
  cep: 'CEP',
  street: 'Logradouro',
  number: 'Número',
  complement: 'Complemento',
  neighborhood: 'Bairro',
  city: 'Cidade',
  state: 'Estado',
  notes: 'Notas'
};

const validateCNPJ = (cnpj: string): boolean => {
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14) return false;
  if (/^(\d)\1+$/.test(digits)) return false;
  
  let sum = 0;
  let weight = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  for (let i = 0; i < 12; i++) {
    sum += parseInt(digits[i]) * weight[i];
  }
  let remainder = sum % 11;
  let digit1 = remainder < 2 ? 0 : 11 - remainder;
  if (parseInt(digits[12]) !== digit1) return false;

  sum = 0;
  weight = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  for (let i = 0; i < 13; i++) {
    sum += parseInt(digits[i]) * weight[i];
  }
  remainder = sum % 11;
  let digit2 = remainder < 2 ? 0 : 11 - remainder;
  return parseInt(digits[13]) === digit2;
};

export const ImportCompaniesModal: React.FC<ImportCompaniesModalProps> = ({
  open,
  onOpenChange,
  onSuccess
}) => {
  const [step, setStep] = useState<'upload' | 'mapping' | 'preview' | 'importing'>('upload');
  const [csvData, setCsvData] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({});
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, success: 0, failed: 0 });
  const [validating, setValidating] = useState(false);
  const [existingCNPJs, setExistingCNPJs] = useState<Map<string, string>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const checkExistingCNPJs = async (cnpjs: string[]): Promise<Map<string, string>> => {
    const normalizedCNPJs = cnpjs.map(c => c.replace(/\D/g, '')).filter(c => c.length === 14);
    if (normalizedCNPJs.length === 0) return new Map();
    
    const { data } = await supabase
      .from('companies')
      .select('cnpj, razao_social, nome_fantasia')
      .in('cnpj', normalizedCNPJs);
    
    const existingMap = new Map<string, string>();
    data?.forEach(c => {
      existingMap.set(c.cnpj, c.nome_fantasia || c.razao_social);
    });
    return existingMap;
  };

  const resetState = () => {
    setStep('upload');
    setCsvData([]);
    setHeaders([]);
    setColumnMapping({});
    setPreviewRows([]);
    setImporting(false);
    setImportProgress({ current: 0, total: 0, success: 0, failed: 0 });
    setValidating(false);
    setExistingCNPJs(new Map());
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n').map(line => 
        line.split(/[;,\t]/).map(cell => cell.trim().replace(/^["']|["']$/g, ''))
      ).filter(line => line.some(cell => cell));

      if (lines.length < 2) {
        toast.error('Arquivo deve ter cabeçalho e pelo menos uma linha de dados');
        return;
      }

      setHeaders(lines[0]);
      setCsvData(lines.slice(1));
      
      // Auto-map columns
      const autoMapping: ColumnMapping = {};
      lines[0].forEach((header, index) => {
        const headerLower = header.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        ALL_FIELDS.forEach(field => {
          const fieldLower = field.toLowerCase();
          if (headerLower.includes(fieldLower) || 
              (field === 'razao_social' && headerLower.includes('razao')) ||
              (field === 'nome_fantasia' && headerLower.includes('fantasia')) ||
              (field === 'inscricao_estadual' && headerLower.includes('ie')) ||
              (field === 'inscricao_municipal' && headerLower.includes('im'))) {
            autoMapping[field] = index.toString();
          }
        });
      });
      setColumnMapping(autoMapping);
      setStep('mapping');
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleMappingChange = (field: string, columnIndex: string) => {
    setColumnMapping(prev => ({
      ...prev,
      [field]: columnIndex === 'none' ? '' : columnIndex
    }));
  };

  const validateAndPreview = async () => {
    setValidating(true);
    
    // First, extract all CNPJs from CSV
    const allCNPJs: string[] = [];
    csvData.forEach(row => {
      const colIndex = columnMapping['cnpj'];
      if (colIndex !== undefined && colIndex !== '') {
        const cnpj = (row[parseInt(colIndex)] || '').replace(/\D/g, '');
        if (cnpj.length === 14) {
          allCNPJs.push(cnpj);
        }
      }
    });
    
    // Check which CNPJs already exist in database
    const existing = await checkExistingCNPJs(allCNPJs);
    setExistingCNPJs(existing);
    
    const rows: PreviewRow[] = csvData.map(row => {
      const data: Record<string, string> = {};
      const errors: string[] = [];

      ALL_FIELDS.forEach(field => {
        const colIndex = columnMapping[field];
        if (colIndex !== undefined && colIndex !== '') {
          data[field] = row[parseInt(colIndex)] || '';
        }
      });

      const cnpjDigits = (data.cnpj || '').replace(/\D/g, '');
      
      // Validate CNPJ
      if (!data.cnpj) {
        errors.push('CNPJ é obrigatório');
      } else if (!validateCNPJ(data.cnpj)) {
        errors.push('CNPJ inválido');
      } else if (existing.has(cnpjDigits)) {
        errors.push(`CNPJ já cadastrado: ${existing.get(cnpjDigits)}`);
      }

      // Validate Razão Social
      if (!data.razao_social) {
        errors.push('Razão Social é obrigatória');
      }

      return {
        data,
        errors,
        valid: errors.length === 0
      };
    });

    setPreviewRows(rows);
    setValidating(false);
    setStep('preview');
  };

  const handleImport = async () => {
    const validRows = previewRows.filter(r => r.valid);
    if (validRows.length === 0) {
      toast.error('Nenhuma linha válida para importar');
      return;
    }

    setImporting(true);
    setStep('importing');
    setImportProgress({ current: 0, total: validRows.length, success: 0, failed: 0 });

    let success = 0;
    let failed = 0;

    // Batch import in chunks of 50
    const batchSize = 50;
    for (let i = 0; i < validRows.length; i += batchSize) {
      const batch = validRows.slice(i, i + batchSize);
      
      const companiesData = batch.map(row => ({
        cnpj: row.data.cnpj.replace(/\D/g, ''),
        razao_social: row.data.razao_social,
        nome_fantasia: row.data.nome_fantasia || null,
        inscricao_estadual: row.data.inscricao_estadual || null,
        inscricao_municipal: row.data.inscricao_municipal || null,
        cep: row.data.cep?.replace(/\D/g, '') || null,
        street: row.data.street || null,
        number: row.data.number || null,
        complement: row.data.complement || null,
        neighborhood: row.data.neighborhood || null,
        city: row.data.city || null,
        state: row.data.state || null,
        notes: row.data.notes || null
      }));

      const { error } = await supabase
        .from('companies')
        .upsert(companiesData, { onConflict: 'cnpj' });

      if (error) {
        console.error('Batch import error:', error);
        failed += batch.length;
      } else {
        success += batch.length;
      }

      setImportProgress({
        current: Math.min(i + batchSize, validRows.length),
        total: validRows.length,
        success,
        failed
      });
    }

    setImporting(false);
    toast.success(`Importação concluída: ${success} empresas importadas, ${failed} falhas`);
    onSuccess();
    onOpenChange(false);
    resetState();
  };

  const downloadTemplate = () => {
    const headers = 'cnpj;razao_social;nome_fantasia;cep;cidade;estado\n';
    const example = '12345678000190;Empresa ABC Ltda;ABC Transportes;86000000;Londrina;PR\n';
    const blob = new Blob([headers + example], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template_empresas.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) resetState();
      onOpenChange(isOpen);
    }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden bg-slate-900 border-slate-800">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-100">
            <FileSpreadsheet className="w-5 h-5 text-blue-400" />
            Importar Empresas (CSV)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Step Indicator */}
          <div className="flex items-center justify-center gap-2 text-sm">
            {['upload', 'mapping', 'preview', 'importing'].map((s, i) => (
              <React.Fragment key={s}>
                <div className={`flex items-center gap-1 ${step === s ? 'text-blue-400' : 'text-slate-500'}`}>
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                    step === s ? 'bg-blue-500 text-white' : 'bg-slate-800'
                  }`}>{i + 1}</span>
                  <span className="hidden sm:inline">{
                    s === 'upload' ? 'Upload' : 
                    s === 'mapping' ? 'Mapeamento' : 
                    s === 'preview' ? 'Prévia' : 'Importando'
                  }</span>
                </div>
                {i < 3 && <ArrowRight className="w-4 h-4 text-slate-600" />}
              </React.Fragment>
            ))}
          </div>

          {/* Step Content */}
          {step === 'upload' && (
            <div className="space-y-4">
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-700 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 transition-colors"
              >
                <Upload className="w-12 h-12 mx-auto text-slate-500 mb-4" />
                <p className="text-slate-300 mb-2">Clique para selecionar arquivo CSV</p>
                <p className="text-sm text-slate-500">ou arraste e solte aqui</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>
              <div className="flex justify-center">
                <Button variant="outline" onClick={downloadTemplate} className="gap-2 border-slate-700">
                  <Download className="w-4 h-4" />
                  Baixar Template
                </Button>
              </div>
            </div>
          )}

          {step === 'mapping' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-400">
                Arquivo carregado: {csvData.length} linhas. Mapeie as colunas do seu arquivo:
              </p>
              <ScrollArea className="h-[400px]">
                <div className="grid gap-3">
                  {ALL_FIELDS.map(field => (
                    <div key={field} className="flex items-center gap-4">
                      <Label className={`w-40 text-right ${REQUIRED_FIELDS.includes(field) ? 'text-slate-200' : 'text-slate-400'}`}>
                        {FIELD_LABELS[field]}
                      </Label>
                      <Select
                        value={columnMapping[field] || 'none'}
                        onValueChange={(v) => handleMappingChange(field, v)}
                      >
                        <SelectTrigger className="w-64 bg-slate-950 border-slate-700">
                          <SelectValue placeholder="Selecionar coluna" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-700">
                          <SelectItem value="none">-- Não mapear --</SelectItem>
                          {headers.map((header, i) => (
                            <SelectItem key={i} value={i.toString()}>{header}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </ScrollArea>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep('upload')} className="border-slate-700">
                  Voltar
                </Button>
                <Button onClick={validateAndPreview} disabled={validating} className="bg-blue-600 hover:bg-blue-700">
                  {validating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Verificando...
                    </>
                  ) : (
                    'Validar e Pré-visualizar'
                  )}
                </Button>
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-4">
              <div className="flex gap-4 text-sm flex-wrap">
                <span className="text-green-400">
                  <Check className="inline w-4 h-4 mr-1" />
                  {previewRows.filter(r => r.valid).length} novas
                </span>
                <span className="text-red-400">
                  <X className="inline w-4 h-4 mr-1" />
                  {previewRows.filter(r => !r.valid).length} com erros
                </span>
                {existingCNPJs.size > 0 && (
                  <span className="text-amber-400">
                    <AlertCircle className="inline w-4 h-4 mr-1" />
                    {previewRows.filter(r => r.errors.some(e => e.includes('já cadastrado'))).length} já existentes
                  </span>
                )}
              </div>
              <ScrollArea className="h-[350px]">
                <table className="w-full text-sm">
                  <thead className="bg-slate-800 sticky top-0">
                    <tr>
                      <th className="p-2 text-left text-slate-400">Status</th>
                      <th className="p-2 text-left text-slate-400">CNPJ</th>
                      <th className="p-2 text-left text-slate-400">Razão Social</th>
                      <th className="p-2 text-left text-slate-400">Erros</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.slice(0, 100).map((row, i) => (
                      <tr key={i} className={row.valid ? 'bg-slate-900/50' : 'bg-red-900/20'}>
                        <td className="p-2">
                          {row.valid ? (
                            <Check className="w-4 h-4 text-green-400" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-red-400" />
                          )}
                        </td>
                        <td className="p-2 text-slate-300">{row.data.cnpj}</td>
                        <td className="p-2 text-slate-300">{row.data.razao_social}</td>
                        <td className="p-2 text-red-400 text-xs">{row.errors.join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep('mapping')} className="border-slate-700">
                  Voltar
                </Button>
                <Button 
                  onClick={handleImport} 
                  disabled={previewRows.filter(r => r.valid).length === 0}
                  className="bg-green-600 hover:bg-green-700"
                >
                  Importar {previewRows.filter(r => r.valid).length} Empresas
                </Button>
              </div>
            </div>
          )}

          {step === 'importing' && (
            <div className="py-8 text-center space-y-4">
              <Loader2 className="w-12 h-12 mx-auto text-blue-400 animate-spin" />
              <p className="text-slate-300">Importando empresas...</p>
              <div className="text-sm text-slate-400">
                {importProgress.current} de {importProgress.total} processadas
              </div>
              <div className="flex justify-center gap-4 text-sm">
                <span className="text-green-400">{importProgress.success} sucesso</span>
                <span className="text-red-400">{importProgress.failed} falhas</span>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
