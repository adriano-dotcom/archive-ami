import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileSpreadsheet, AlertCircle, Check, X, Download, Loader2, ArrowRight } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ImportContactsSeguradosModalProps {
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
  companyId?: string;
}

interface Company {
  id: string;
  cnpj: string;
}

const REQUIRED_FIELDS = ['name', 'phone'];
const OPTIONAL_FIELDS = ['email', 'cpf', 'cnpj', 'role', 'is_billing_contact', 'cep', 'street', 'number', 'complement', 'neighborhood', 'city', 'state', 'notes'];
const ALL_FIELDS = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS];

const FIELD_LABELS: Record<string, string> = {
  name: 'Nome *',
  phone: 'Telefone *',
  email: 'Email',
  cpf: 'CPF',
  cnpj: 'CNPJ (vincular empresa)',
  role: 'Cargo',
  is_billing_contact: 'Contato de Cobrança',
  cep: 'CEP',
  street: 'Logradouro',
  number: 'Número',
  complement: 'Complemento',
  neighborhood: 'Bairro',
  city: 'Cidade',
  state: 'Estado',
  notes: 'Notas'
};

const validateCPF = (cpf: string): boolean => {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return false;
  if (/^(\d)\1+$/.test(digits)) return false;
  
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(digits[i]) * (10 - i);
  }
  let remainder = (sum * 10) % 11;
  if (remainder === 10) remainder = 0;
  if (remainder !== parseInt(digits[9])) return false;
  
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(digits[i]) * (11 - i);
  }
  remainder = (sum * 10) % 11;
  if (remainder === 10) remainder = 0;
  return remainder === parseInt(digits[10]);
};

const formatPhoneDigits = (phone: string): string => {
  let digits = phone.replace(/\D/g, '');
  if (!digits.startsWith('55') && digits.length <= 11) {
    digits = '55' + digits;
  }
  return digits;
};

export const ImportContactsSeguradosModal: React.FC<ImportContactsSeguradosModalProps> = ({
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
  const [companiesMap, setCompaniesMap] = useState<Map<string, string>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load companies for CNPJ mapping
  useEffect(() => {
    if (open) {
      loadCompanies();
    }
  }, [open]);

  const loadCompanies = async () => {
    const { data } = await supabase
      .from('companies')
      .select('id, cnpj');
    
    if (data) {
      const map = new Map<string, string>();
      data.forEach(c => map.set(c.cnpj, c.id));
      setCompaniesMap(map);
    }
  };

  const resetState = () => {
    setStep('upload');
    setCsvData([]);
    setHeaders([]);
    setColumnMapping({});
    setPreviewRows([]);
    setImporting(false);
    setImportProgress({ current: 0, total: 0, success: 0, failed: 0 });
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
              (field === 'name' && (headerLower.includes('nome') || headerLower === 'name')) ||
              (field === 'phone' && (headerLower.includes('telefone') || headerLower.includes('celular') || headerLower.includes('fone'))) ||
              (field === 'is_billing_contact' && (headerLower.includes('cobranca') || headerLower.includes('billing'))) ||
              (field === 'role' && headerLower.includes('cargo'))) {
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

  const validateAndPreview = () => {
    const rows: PreviewRow[] = csvData.map(row => {
      const data: Record<string, string> = {};
      const errors: string[] = [];

      ALL_FIELDS.forEach(field => {
        const colIndex = columnMapping[field];
        if (colIndex !== undefined && colIndex !== '') {
          data[field] = row[parseInt(colIndex)] || '';
        }
      });

      // Validate Name
      if (!data.name || data.name.trim().length < 2) {
        errors.push('Nome é obrigatório');
      }

      // Validate Phone
      const phoneDigits = formatPhoneDigits(data.phone || '');
      if (phoneDigits.length < 12 || phoneDigits.length > 13) {
        errors.push('Telefone inválido');
      }

      // Validate CPF if provided
      if (data.cpf && !validateCPF(data.cpf)) {
        errors.push('CPF inválido');
      }

      // Check company link
      let companyId: string | undefined;
      if (data.cnpj) {
        const cnpjDigits = data.cnpj.replace(/\D/g, '');
        companyId = companiesMap.get(cnpjDigits);
        if (!companyId) {
          errors.push('Empresa não encontrada');
        }
      }

      return {
        data,
        errors,
        valid: errors.length === 0,
        companyId
      };
    });

    setPreviewRows(rows);
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

    // Import one by one to handle duplicates
    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];
      const phoneDigits = formatPhoneDigits(row.data.phone);

      const contactData = {
        name: row.data.name.trim(),
        phone_number: phoneDigits,
        email: row.data.email?.trim() || null,
        cpf: row.data.cpf?.replace(/\D/g, '') || null,
        company_id: row.companyId || null,
        role: row.data.role?.trim() || null,
        is_billing_contact: ['sim', 'yes', 'true', '1', 's'].includes((row.data.is_billing_contact || '').toLowerCase()),
        cep: row.data.cep?.replace(/\D/g, '') || null,
        street: row.data.street?.trim() || null,
        number: row.data.number?.trim() || null,
        complement: row.data.complement?.trim() || null,
        neighborhood: row.data.neighborhood?.trim() || null,
        city: row.data.city?.trim() || null,
        state: row.data.state?.trim() || null,
        notes: row.data.notes?.trim() || null,
        lead_source: 'import'
      };

      const { error } = await supabase
        .from('contacts')
        .upsert(contactData, { onConflict: 'phone_number' });

      if (error) {
        console.error('Import error:', error);
        failed++;
      } else {
        success++;
      }

      setImportProgress({
        current: i + 1,
        total: validRows.length,
        success,
        failed
      });
    }

    setImporting(false);
    toast.success(`Importação concluída: ${success} contatos importados, ${failed} falhas`);
    onSuccess();
    onOpenChange(false);
    resetState();
  };

  const downloadTemplate = () => {
    const headers = 'nome;telefone;email;cpf;cnpj;cargo;contato_cobranca;cep;cidade;estado\n';
    const example1 = 'João Silva;43999998888;joao@email.com;12345678900;12345678000190;Gerente;sim;86000000;Londrina;PR\n';
    const example2 = 'Maria Santos;43988887777;maria@email.com;98765432100;;;nao;86000000;Londrina;PR\n';
    const blob = new Blob([headers + example1 + example2], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template_contatos_segurados.csv';
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
            <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
            Importar Contatos/Segurados (CSV)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Step Indicator */}
          <div className="flex items-center justify-center gap-2 text-sm">
            {['upload', 'mapping', 'preview', 'importing'].map((s, i) => (
              <React.Fragment key={s}>
                <div className={`flex items-center gap-1 ${step === s ? 'text-emerald-400' : 'text-slate-500'}`}>
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                    step === s ? 'bg-emerald-500 text-white' : 'bg-slate-800'
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
                className="border-2 border-dashed border-slate-700 rounded-lg p-8 text-center cursor-pointer hover:border-emerald-500 transition-colors"
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
              <div className="text-sm text-slate-500 text-center">
                <p>💡 Se o CNPJ for informado, o contato será vinculado à empresa correspondente.</p>
                <p>Contatos sem CNPJ serão cadastrados como Segurados PF.</p>
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
                      <Label className={`w-44 text-right ${REQUIRED_FIELDS.includes(field) ? 'text-slate-200' : 'text-slate-400'}`}>
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
                <Button onClick={validateAndPreview} className="bg-emerald-600 hover:bg-emerald-700">
                  Validar e Pré-visualizar
                </Button>
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-4">
              <div className="flex gap-4 text-sm">
                <span className="text-green-400">
                  <Check className="inline w-4 h-4 mr-1" />
                  {previewRows.filter(r => r.valid).length} válidas
                </span>
                <span className="text-red-400">
                  <X className="inline w-4 h-4 mr-1" />
                  {previewRows.filter(r => !r.valid).length} com erros
                </span>
              </div>
              <ScrollArea className="h-[350px]">
                <table className="w-full text-sm">
                  <thead className="bg-slate-800 sticky top-0">
                    <tr>
                      <th className="p-2 text-left text-slate-400">Status</th>
                      <th className="p-2 text-left text-slate-400">Nome</th>
                      <th className="p-2 text-left text-slate-400">Telefone</th>
                      <th className="p-2 text-left text-slate-400">Empresa</th>
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
                        <td className="p-2 text-slate-300">{row.data.name}</td>
                        <td className="p-2 text-slate-300">{row.data.phone}</td>
                        <td className="p-2 text-slate-300">
                          {row.companyId ? (
                            <span className="text-blue-400">Vinculado</span>
                          ) : row.data.cnpj ? (
                            <span className="text-red-400">Não encontrada</span>
                          ) : (
                            <span className="text-slate-500">PF</span>
                          )}
                        </td>
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
                  Importar {previewRows.filter(r => r.valid).length} Contatos
                </Button>
              </div>
            </div>
          )}

          {step === 'importing' && (
            <div className="py-8 text-center space-y-4">
              <Loader2 className="w-12 h-12 mx-auto text-emerald-400 animate-spin" />
              <p className="text-slate-300">Importando contatos...</p>
              <div className="text-sm text-slate-400">
                {importProgress.current} de {importProgress.total} processados
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
