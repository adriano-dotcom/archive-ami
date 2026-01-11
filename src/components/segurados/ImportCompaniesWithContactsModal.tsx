import React, { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, AlertCircle, Check, X, Download, Loader2, ArrowRight, Building2, User } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ImportCompaniesWithContactsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface ColumnMapping {
  [key: string]: string;
}

interface ParsedContact {
  name: string;
  phone: string;
  email?: string;
  cpf?: string;
  role?: string;
  is_billing_contact: boolean;
  errors: string[];
  warnings: string[];
  valid: boolean;
  phone_pending: boolean;
}

interface ParsedCompany {
  cnpj: string;
  razao_social: string;
  nome_fantasia?: string;
  inscricao_estadual?: string;
  inscricao_municipal?: string;
  cep?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  notes?: string;
  contacts: ParsedContact[];
  errors: string[];
  valid: boolean;
}

// Company fields
const COMPANY_REQUIRED_FIELDS = ['cnpj', 'razao_social'];
const COMPANY_OPTIONAL_FIELDS = ['nome_fantasia', 'inscricao_estadual', 'inscricao_municipal', 'cep', 'street', 'number', 'complement', 'neighborhood', 'city', 'state', 'notes'];
const COMPANY_FIELDS = [...COMPANY_REQUIRED_FIELDS, ...COMPANY_OPTIONAL_FIELDS];

// Contact fields - phone is now optional (can be pending)
const CONTACT_REQUIRED_FIELDS = ['contact_name'];
const CONTACT_OPTIONAL_FIELDS = ['contact_phone', 'contact_email', 'contact_cpf', 'contact_role', 'contact_is_billing'];
const CONTACT_FIELDS = [...CONTACT_REQUIRED_FIELDS, ...CONTACT_OPTIONAL_FIELDS];

const FIELD_LABELS: Record<string, string> = {
  // Company
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
  notes: 'Notas',
  // Contact
  contact_name: 'Nome do Contato *',
  contact_phone: 'WhatsApp',
  contact_email: 'Email',
  contact_cpf: 'CPF',
  contact_role: 'Cargo',
  contact_is_billing: 'Contato Cobrança'
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

const formatPhone = (phone: string): string => {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11) {
    return `${digits.slice(0, 2)}${digits.slice(2)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 2)}9${digits.slice(2)}`;
  }
  return digits;
};

export const ImportCompaniesWithContactsModal: React.FC<ImportCompaniesWithContactsModalProps> = ({
  open,
  onOpenChange,
  onSuccess
}) => {
  const [step, setStep] = useState<'upload' | 'mapping' | 'preview' | 'importing'>('upload');
  const [csvData, setCsvData] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({});
  const [parsedCompanies, setParsedCompanies] = useState<ParsedCompany[]>([]);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, companiesSuccess: 0, contactsSuccess: 0, failed: 0 });
  const [validating, setValidating] = useState(false);
  const [existingCNPJsCount, setExistingCNPJsCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const checkExistingCNPJs = async (cnpjs: string[]): Promise<Map<string, string>> => {
    const normalizedCNPJs = cnpjs.filter(c => c.length === 14);
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
    setParsedCompanies([]);
    setImporting(false);
    setImportProgress({ current: 0, total: 0, companiesSuccess: 0, contactsSuccess: 0, failed: 0 });
    setValidating(false);
    setExistingCNPJsCount(0);
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
        
        // Company mappings
        if (headerLower.includes('cnpj')) autoMapping['cnpj'] = index.toString();
        if (headerLower.includes('razao') && headerLower.includes('social')) autoMapping['razao_social'] = index.toString();
        if (headerLower.includes('fantasia')) autoMapping['nome_fantasia'] = index.toString();
        if (headerLower.includes('cidade') || headerLower.includes('city')) autoMapping['city'] = index.toString();
        if (headerLower.includes('estado') || headerLower.includes('uf') || headerLower === 'state') autoMapping['state'] = index.toString();
        if (headerLower.includes('cep')) autoMapping['cep'] = index.toString();
        
        // Contact mappings
        if ((headerLower.includes('nome') && headerLower.includes('contato')) || headerLower === 'nome_contato') {
          autoMapping['contact_name'] = index.toString();
        } else if (headerLower === 'nome' && !autoMapping['contact_name']) {
          // Fallback: if there's just "nome" and no contact_name mapped yet
        }
        if (headerLower.includes('telefone') || headerLower.includes('whatsapp') || headerLower.includes('celular')) {
          autoMapping['contact_phone'] = index.toString();
        }
        if (headerLower.includes('email') && headerLower.includes('contato')) autoMapping['contact_email'] = index.toString();
        if (headerLower === 'email' && !autoMapping['contact_email']) autoMapping['contact_email'] = index.toString();
        if (headerLower.includes('cargo') || headerLower.includes('funcao')) autoMapping['contact_role'] = index.toString();
        if (headerLower.includes('cobranca') || headerLower.includes('billing')) autoMapping['contact_is_billing'] = index.toString();
        if (headerLower === 'cpf' || headerLower.includes('cpf_contato')) autoMapping['contact_cpf'] = index.toString();
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
    
    // Group rows by CNPJ
    const companiesMap = new Map<string, { companyData: Record<string, string>, contacts: Record<string, string>[] }>();
    
    csvData.forEach(row => {
      const rowData: Record<string, string> = {};
      [...COMPANY_FIELDS, ...CONTACT_FIELDS].forEach(field => {
        const colIndex = columnMapping[field];
        if (colIndex !== undefined && colIndex !== '') {
          rowData[field] = row[parseInt(colIndex)] || '';
        }
      });

      const cnpj = (rowData.cnpj || '').replace(/\D/g, '');
      if (!cnpj) return;

      if (!companiesMap.has(cnpj)) {
        companiesMap.set(cnpj, {
          companyData: rowData,
          contacts: []
        });
      }

      // Add contact if name exists (phone can be pending)
      if (rowData.contact_name) {
        companiesMap.get(cnpj)!.contacts.push(rowData);
      }
    });

    // Check existing CNPJs in database
    const cnpjs = Array.from(companiesMap.keys());
    const existingCNPJs = await checkExistingCNPJs(cnpjs);
    setExistingCNPJsCount(existingCNPJs.size);

    // Parse and validate companies
    const parsed: ParsedCompany[] = [];
    
    companiesMap.forEach((data, cnpj) => {
      const companyErrors: string[] = [];
      
      // Check if CNPJ already exists in database
      if (existingCNPJs.has(cnpj)) {
        companyErrors.push(`CNPJ já cadastrado: ${existingCNPJs.get(cnpj)}`);
      }
      
      // Validate CNPJ
      if (!validateCNPJ(cnpj)) {
        companyErrors.push('CNPJ inválido');
      }
      
      // Validate Razão Social
      if (!data.companyData.razao_social) {
        companyErrors.push('Razão Social obrigatória');
      }

      // Parse contacts - allow missing phone (generate placeholder)
      const contacts: ParsedContact[] = data.contacts.map(contactData => {
        const contactErrors: string[] = [];
        const warnings: string[] = [];
        let phone = formatPhone(contactData.contact_phone || '');
        let phonePending = false;
        
        if (!contactData.contact_name) {
          contactErrors.push('Nome obrigatório');
        }
        
        // Phone missing or invalid: generate placeholder instead of blocking
        if (!phone || phone.length < 10) {
          phonePending = true;
          warnings.push('Telefone pendente - atualizar manualmente');
          // Generate placeholder using CPF or timestamp
          const cpfClean = contactData.contact_cpf?.replace(/\D/g, '') || '';
          phone = cpfClean.length >= 11 
            ? `PENDENTE_CPF_${cpfClean}` 
            : `PENDENTE_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        }

        const isBilling = contactData.contact_is_billing?.toLowerCase();
        const isBillingContact = isBilling === 'sim' || isBilling === 's' || isBilling === 'yes' || isBilling === '1' || isBilling === 'true';

        return {
          name: contactData.contact_name || '',
          phone,
          email: contactData.contact_email || undefined,
          cpf: contactData.contact_cpf?.replace(/\D/g, '') || undefined,
          role: contactData.contact_role || undefined,
          is_billing_contact: isBillingContact,
          errors: contactErrors,
          warnings,
          valid: contactErrors.length === 0,
          phone_pending: phonePending
        };
      });

      parsed.push({
        cnpj,
        razao_social: data.companyData.razao_social || '',
        nome_fantasia: data.companyData.nome_fantasia || undefined,
        inscricao_estadual: data.companyData.inscricao_estadual || undefined,
        inscricao_municipal: data.companyData.inscricao_municipal || undefined,
        cep: data.companyData.cep?.replace(/\D/g, '') || undefined,
        street: data.companyData.street || undefined,
        number: data.companyData.number || undefined,
        complement: data.companyData.complement || undefined,
        neighborhood: data.companyData.neighborhood || undefined,
        city: data.companyData.city || undefined,
        state: data.companyData.state || undefined,
        notes: data.companyData.notes || undefined,
        contacts,
        errors: companyErrors,
        valid: companyErrors.length === 0
      });
    });

    setParsedCompanies(parsed);
    setValidating(false);
    setStep('preview');
  };

  const handleImport = async () => {
    const validCompanies = parsedCompanies.filter(c => c.valid);
    if (validCompanies.length === 0) {
      toast.error('Nenhuma empresa válida para importar');
      return;
    }

    setImporting(true);
    setStep('importing');
    
    const totalContacts = validCompanies.reduce((sum, c) => sum + c.contacts.filter(ct => ct.valid).length, 0);
    setImportProgress({ current: 0, total: validCompanies.length, companiesSuccess: 0, contactsSuccess: 0, failed: 0 });

    let companiesSuccess = 0;
    let contactsSuccess = 0;
    let failed = 0;

    for (let i = 0; i < validCompanies.length; i++) {
      const company = validCompanies[i];
      
      try {
        // Upsert company
        const { data: companyResult, error: companyError } = await supabase
          .from('companies')
          .upsert({
            cnpj: company.cnpj,
            razao_social: company.razao_social,
            nome_fantasia: company.nome_fantasia || null,
            inscricao_estadual: company.inscricao_estadual || null,
            inscricao_municipal: company.inscricao_municipal || null,
            cep: company.cep || null,
            street: company.street || null,
            number: company.number || null,
            complement: company.complement || null,
            neighborhood: company.neighborhood || null,
            city: company.city || null,
            state: company.state || null,
            notes: company.notes || null
          }, { onConflict: 'cnpj' })
          .select('id')
          .single();

        if (companyError) throw companyError;
        companiesSuccess++;

        // Get company ID (either from insert or existing)
        let companyId = companyResult?.id;
        if (!companyId) {
          const { data: existingCompany } = await supabase
            .from('companies')
            .select('id')
            .eq('cnpj', company.cnpj)
            .single();
          companyId = existingCompany?.id;
        }

        if (companyId && company.contacts.length > 0) {
          // Insert valid contacts
          const validContacts = company.contacts.filter(c => c.valid);
          
          for (const contact of validContacts) {
            // Add telefone_pendente tag if phone is pending
            const tags = contact.phone_pending ? ['telefone_pendente'] : null;
            
            const { error: contactError } = await supabase
              .from('contacts')
              .upsert({
                phone_number: contact.phone,
                name: contact.name,
                email: contact.email || null,
                cpf: contact.cpf || null,
                role: contact.role || null,
                is_billing_contact: contact.is_billing_contact,
                company_id: companyId,
                tags,
                lead_source: 'import_cobranca',
                // Inherit address from company
                cep: company.cep || null,
                street: company.street || null,
                number: company.number || null,
                complement: company.complement || null,
                neighborhood: company.neighborhood || null,
                city: company.city || null,
                state: company.state || null
              }, { onConflict: 'phone_number' });

            if (!contactError) {
              contactsSuccess++;
            }
          }
        }
      } catch (error) {
        console.error('Import error for company:', company.cnpj, error);
        failed++;
      }

      setImportProgress({
        current: i + 1,
        total: validCompanies.length,
        companiesSuccess,
        contactsSuccess,
        failed
      });
    }

    setImporting(false);
    toast.success(`Importação concluída: ${companiesSuccess} empresas e ${contactsSuccess} contatos importados`);
    onSuccess();
    onOpenChange(false);
    resetState();
  };

  const downloadTemplate = () => {
    const headers = 'cnpj;razao_social;nome_fantasia;cidade;estado;nome_contato;telefone;email;cargo;contato_cobranca\n';
    const example1 = '12345678000190;Empresa ABC Ltda;ABC Transportes;Londrina;PR;João Silva;43999998888;joao@email.com;Gerente;sim\n';
    const example2 = '12345678000190;Empresa ABC Ltda;ABC Transportes;Londrina;PR;Maria Santos;43988887777;maria@email.com;Financeiro;sim\n';
    const example3 = '98765432000100;Outra Empresa SA;;Curitiba;PR;Carlos Souza;41999991111;carlos@email.com;Diretor;nao\n';
    const blob = new Blob([headers + example1 + example2 + example3], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template_empresas_com_contatos.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const validCompaniesCount = parsedCompanies.filter(c => c.valid).length;
  const validContactsCount = parsedCompanies.reduce((sum, c) => sum + c.contacts.filter(ct => ct.valid).length, 0);
  const invalidCompaniesCount = parsedCompanies.filter(c => !c.valid).length;
  const invalidContactsCount = parsedCompanies.reduce((sum, c) => sum + c.contacts.filter(ct => !ct.valid).length, 0);
  const pendingPhoneCount = parsedCompanies.reduce((sum, c) => sum + c.contacts.filter(ct => ct.phone_pending).length, 0);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) resetState();
      onOpenChange(isOpen);
    }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden bg-slate-900 border-slate-800">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-100">
            <FileSpreadsheet className="w-5 h-5 text-purple-400" />
            Importar Empresas + Contatos (CSV)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Step Indicator */}
          <div className="flex items-center justify-center gap-2 text-sm">
            {['upload', 'mapping', 'preview', 'importing'].map((s, i) => (
              <React.Fragment key={s}>
                <div className={`flex items-center gap-1 ${step === s ? 'text-purple-400' : 'text-slate-500'}`}>
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                    step === s ? 'bg-purple-500 text-white' : 'bg-slate-800'
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
              <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg text-sm text-purple-200">
                <p className="font-medium mb-1">💡 Dica: Formato do CSV</p>
                <p className="text-purple-300">
                  Cada linha pode conter dados da empresa + contato. 
                  Linhas com o mesmo CNPJ são agrupadas automaticamente como uma única empresa com múltiplos contatos.
                </p>
              </div>
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-700 rounded-lg p-8 text-center cursor-pointer hover:border-purple-500 transition-colors"
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
                Arquivo carregado: {csvData.length} linhas. Mapeie as colunas:
              </p>
              <ScrollArea className="h-[400px]">
                <div className="space-y-4">
                  {/* Company Fields */}
                  <div>
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-700">
                      <Building2 className="w-4 h-4 text-blue-400" />
                      <span className="text-sm font-medium text-slate-300">DADOS DA EMPRESA</span>
                    </div>
                    <div className="grid gap-2">
                      {COMPANY_FIELDS.map(field => (
                        <div key={field} className="flex items-center gap-4">
                          <Label className={`w-40 text-right text-sm ${COMPANY_REQUIRED_FIELDS.includes(field) ? 'text-slate-200' : 'text-slate-400'}`}>
                            {FIELD_LABELS[field]}
                          </Label>
                          <Select
                            value={columnMapping[field] || 'none'}
                            onValueChange={(v) => handleMappingChange(field, v)}
                          >
                            <SelectTrigger className="w-56 bg-slate-950 border-slate-700 h-8 text-sm">
                              <SelectValue placeholder="Selecionar" />
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
                  </div>

                  {/* Contact Fields */}
                  <div>
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-700">
                      <User className="w-4 h-4 text-emerald-400" />
                      <span className="text-sm font-medium text-slate-300">DADOS DO CONTATO</span>
                    </div>
                    <div className="grid gap-2">
                      {CONTACT_FIELDS.map(field => (
                        <div key={field} className="flex items-center gap-4">
                          <Label className={`w-40 text-right text-sm ${CONTACT_REQUIRED_FIELDS.includes(field) ? 'text-slate-200' : 'text-slate-400'}`}>
                            {FIELD_LABELS[field]}
                          </Label>
                          <Select
                            value={columnMapping[field] || 'none'}
                            onValueChange={(v) => handleMappingChange(field, v)}
                          >
                            <SelectTrigger className="w-56 bg-slate-950 border-slate-700 h-8 text-sm">
                              <SelectValue placeholder="Selecionar" />
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
                  </div>
                </div>
              </ScrollArea>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep('upload')} className="border-slate-700">
                  Voltar
                </Button>
                <Button onClick={validateAndPreview} disabled={validating} className="bg-purple-600 hover:bg-purple-700">
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
                <span className="flex items-center gap-1 text-green-400">
                  <Building2 className="w-4 h-4" />
                  {validCompaniesCount} empresas novas
                </span>
                <span className="flex items-center gap-1 text-green-400">
                  <User className="w-4 h-4" />
                  {validContactsCount} contatos válidos
                </span>
                {existingCNPJsCount > 0 && (
                  <span className="flex items-center gap-1 text-amber-400">
                    <AlertCircle className="w-4 h-4" />
                    {parsedCompanies.filter(c => c.errors.some(e => e.includes('já cadastrado'))).length} já existentes
                  </span>
                )}
                {invalidCompaniesCount > 0 && invalidCompaniesCount !== existingCNPJsCount && (
                  <span className="flex items-center gap-1 text-red-400">
                    <X className="w-4 h-4" />
                    {invalidCompaniesCount - parsedCompanies.filter(c => c.errors.some(e => e.includes('já cadastrado'))).length} empresas com erros
                  </span>
                )}
                {invalidContactsCount > 0 && (
                  <span className="flex items-center gap-1 text-red-400">
                    <X className="w-4 h-4" />
                    {invalidContactsCount} contatos com erros
                  </span>
                )}
                {pendingPhoneCount > 0 && (
                  <span className="flex items-center gap-1 text-amber-400">
                    <AlertCircle className="w-4 h-4" />
                    {pendingPhoneCount} contatos com telefone pendente
                  </span>
                )}
              </div>
              
              <ScrollArea className="h-[350px]">
                <div className="space-y-3">
                  {parsedCompanies.map((company, i) => (
                    <div 
                      key={i} 
                      className={`p-3 rounded-lg border ${
                        company.valid ? 'bg-slate-800/50 border-slate-700' : 'bg-red-900/20 border-red-500/30'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        {company.valid ? (
                          <Check className="w-4 h-4 text-green-400" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-red-400" />
                        )}
                        <Building2 className="w-4 h-4 text-blue-400" />
                        <span className="font-medium text-slate-200">{company.razao_social}</span>
                        <span className="text-slate-500 text-sm">({company.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')})</span>
                      </div>
                      
                      {company.errors.length > 0 && (
                        <p className="text-red-400 text-xs mb-2 ml-6">{company.errors.join(', ')}</p>
                      )}
                      
                      {company.contacts.length > 0 && (
                        <div className="ml-6 space-y-1">
                          {company.contacts.map((contact, j) => (
                            <div key={j} className="flex items-center gap-2 text-sm flex-wrap">
                              <span className="text-slate-600">├─</span>
                              {contact.valid ? (
                                contact.phone_pending ? (
                                  <AlertCircle className="w-3 h-3 text-amber-400" />
                                ) : (
                                  <Check className="w-3 h-3 text-green-400" />
                                )
                              ) : (
                                <X className="w-3 h-3 text-red-400" />
                              )}
                              <span className="text-slate-300">{contact.name}</span>
                              <span className="text-slate-500">-</span>
                              {contact.phone_pending ? (
                                <span className="text-amber-400 italic">Telefone pendente</span>
                              ) : (
                                <span className="text-slate-400">{contact.phone}</span>
                              )}
                              {contact.is_billing_contact && (
                                <span className="text-xs px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded">Cobrança</span>
                              )}
                              {contact.errors.length > 0 && (
                                <span className="text-red-400 text-xs">{contact.errors.join(', ')}</span>
                              )}
                              {contact.warnings.length > 0 && contact.errors.length === 0 && (
                                <span className="text-amber-400 text-xs">{contact.warnings.join(', ')}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {company.contacts.length === 0 && (
                        <p className="text-slate-500 text-xs ml-6 italic">Nenhum contato vinculado</p>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
              
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep('mapping')} className="border-slate-700">
                  Voltar
                </Button>
                <Button 
                  onClick={handleImport} 
                  disabled={validCompaniesCount === 0}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  Importar {validCompaniesCount} Empresas + {validContactsCount} Contatos
                </Button>
              </div>
            </div>
          )}

          {step === 'importing' && (
            <div className="py-8 text-center space-y-4">
              <Loader2 className="w-12 h-12 mx-auto text-purple-400 animate-spin" />
              <p className="text-slate-300">Importando empresas e contatos...</p>
              <div className="text-sm text-slate-400">
                {importProgress.current} de {importProgress.total} empresas processadas
              </div>
              <div className="flex justify-center gap-4 text-sm">
                <span className="text-green-400">{importProgress.companiesSuccess} empresas</span>
                <span className="text-emerald-400">{importProgress.contactsSuccess} contatos</span>
                <span className="text-red-400">{importProgress.failed} falhas</span>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
