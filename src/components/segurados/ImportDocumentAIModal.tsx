import React, { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Upload, 
  Sparkles, 
  Building2, 
  User, 
  X, 
  FileText, 
  Image, 
  FileSpreadsheet,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Edit2,
  Trash2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ExtractedCompany {
  id: string;
  cnpj: string;
  razao_social: string;
  nome_fantasia?: string;
  city?: string;
  state?: string;
  cep?: string;
  street?: string;
  number?: string;
  neighborhood?: string;
  source?: string;
  confidence: number;
  selected: boolean;
  isEditing?: boolean;
}

interface ExtractedContact {
  id: string;
  name: string;
  phone: string;
  email?: string;
  cpf?: string;
  role?: string;
  company_cnpj?: string;
  is_billing_contact: boolean;
  source?: string;
  confidence: number;
  selected: boolean;
  isEditing?: boolean;
}

interface UploadedFile {
  file: File;
  status: 'pending' | 'processing' | 'done' | 'error';
  progress: number;
  error?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const ACCEPTED_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv'
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export const ImportDocumentAIModal: React.FC<Props> = ({ open, onOpenChange, onSuccess }) => {
  const [step, setStep] = useState<'upload' | 'processing' | 'review' | 'importing'>('upload');
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [companies, setCompanies] = useState<ExtractedCompany[]>([]);
  const [contacts, setContacts] = useState<ExtractedContact[]>([]);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [dragActive, setDragActive] = useState(false);

  const resetState = () => {
    setStep('upload');
    setFiles([]);
    setCompanies([]);
    setContacts([]);
    setImporting(false);
    setImportProgress({ current: 0, total: 0 });
  };

  const handleClose = () => {
    resetState();
    onOpenChange(false);
  };

  const getFileIcon = (type: string) => {
    if (type === 'application/pdf') return <FileText className="w-5 h-5 text-red-400" />;
    if (type.startsWith('image/')) return <Image className="w-5 h-5 text-blue-400" />;
    return <FileSpreadsheet className="w-5 h-5 text-emerald-400" />;
  };

  const formatCNPJ = (cnpj: string) => {
    const clean = cnpj.replace(/\D/g, '');
    if (clean.length !== 14) return cnpj;
    return clean.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  };

  const formatPhone = (phone: string) => {
    const clean = phone.replace(/\D/g, '');
    if (clean.length === 11) {
      return clean.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    } else if (clean.length === 10) {
      return clean.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
    }
    return phone;
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const validateFile = (file: File): string | null => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      return `Tipo não suportado: ${file.type}`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `Arquivo muito grande (máx. 10MB)`;
    }
    return null;
  };

  const addFiles = (newFiles: FileList | File[]) => {
    const validFiles: UploadedFile[] = [];
    
    Array.from(newFiles).forEach(file => {
      const error = validateFile(file);
      if (error) {
        toast.error(`${file.name}: ${error}`);
      } else {
        validFiles.push({
          file,
          status: 'pending',
          progress: 0
        });
      }
    });

    setFiles(prev => [...prev, ...validFiles]);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
    });
  };

  const processFiles = async () => {
    if (files.length === 0) {
      toast.error('Selecione pelo menos um arquivo');
      return;
    }

    setStep('processing');

    // Update all files to processing
    setFiles(prev => prev.map(f => ({ ...f, status: 'processing' as const, progress: 10 })));

    try {
      // Convert files to base64
      const fileData = await Promise.all(
        files.map(async (f, index) => {
          setFiles(prev => prev.map((pf, i) => 
            i === index ? { ...pf, progress: 30 } : pf
          ));
          
          const base64 = await fileToBase64(f.file);
          
          setFiles(prev => prev.map((pf, i) => 
            i === index ? { ...pf, progress: 50 } : pf
          ));
          
          return {
            name: f.file.name,
            type: f.file.type,
            content: base64
          };
        })
      );

      // Update progress
      setFiles(prev => prev.map(f => ({ ...f, progress: 60 })));

      // Call edge function
      const { data, error } = await supabase.functions.invoke('extract-documents', {
        body: { files: fileData }
      });

      if (error) {
        throw error;
      }

      // Update files to done
      setFiles(prev => prev.map(f => ({ ...f, status: 'done' as const, progress: 100 })));

      // Process results
      const extractedCompanies: ExtractedCompany[] = (data.companies || []).map((c: any, i: number) => ({
        ...c,
        id: `company-${i}-${Date.now()}`,
        selected: true,
        isEditing: false
      }));

      const extractedContacts: ExtractedContact[] = (data.contacts || []).map((c: any, i: number) => ({
        ...c,
        id: `contact-${i}-${Date.now()}`,
        selected: true,
        isEditing: false
      }));

      if (extractedCompanies.length === 0 && extractedContacts.length === 0) {
        toast.warning('Nenhum dado foi identificado nos documentos');
        setStep('upload');
        return;
      }

      setCompanies(extractedCompanies);
      setContacts(extractedContacts);
      setStep('review');

      toast.success(`Identificados: ${extractedCompanies.length} empresas, ${extractedContacts.length} contatos`);

    } catch (error: any) {
      console.error('Error processing files:', error);
      setFiles(prev => prev.map(f => ({ 
        ...f, 
        status: 'error' as const, 
        error: error.message || 'Erro ao processar' 
      })));
      toast.error('Erro ao processar documentos');
      setStep('upload');
    }
  };

  const updateCompany = (id: string, updates: Partial<ExtractedCompany>) => {
    setCompanies(prev => prev.map(c => 
      c.id === id ? { ...c, ...updates } : c
    ));
  };

  const updateContact = (id: string, updates: Partial<ExtractedContact>) => {
    setContacts(prev => prev.map(c => 
      c.id === id ? { ...c, ...updates } : c
    ));
  };

  const removeCompany = (id: string) => {
    setCompanies(prev => prev.filter(c => c.id !== id));
  };

  const removeContact = (id: string) => {
    setContacts(prev => prev.filter(c => c.id !== id));
  };

  const handleImport = async () => {
    const selectedCompanies = companies.filter(c => c.selected);
    const selectedContacts = contacts.filter(c => c.selected);

    if (selectedCompanies.length === 0 && selectedContacts.length === 0) {
      toast.error('Selecione pelo menos um item para importar');
      return;
    }

    setStep('importing');
    setImporting(true);
    const total = selectedCompanies.length + selectedContacts.length;
    setImportProgress({ current: 0, total });

    try {
      // First import companies
      const companyIdMap = new Map<string, string>(); // cnpj -> id

      for (let i = 0; i < selectedCompanies.length; i++) {
        const company = selectedCompanies[i];
        
        const { data, error } = await supabase
          .from('companies')
          .upsert({
            cnpj: company.cnpj,
            razao_social: company.razao_social,
            nome_fantasia: company.nome_fantasia || null,
            city: company.city || null,
            state: company.state || null,
            cep: company.cep || null,
            street: company.street || null,
            number: company.number || null,
            neighborhood: company.neighborhood || null
          }, { onConflict: 'cnpj' })
          .select('id')
          .single();

        if (error) {
          console.error('Error importing company:', error);
          toast.error(`Erro ao importar ${company.razao_social}`);
        } else if (data) {
          companyIdMap.set(company.cnpj, data.id);
        }

        setImportProgress({ current: i + 1, total });
      }

      // Then import contacts
      for (let i = 0; i < selectedContacts.length; i++) {
        const contact = selectedContacts[i];
        
        // Find company_id if cnpj is provided
        let companyId: string | null = null;
        if (contact.company_cnpj) {
          companyId = companyIdMap.get(contact.company_cnpj) || null;
          
          // If not in map, try to find in database
          if (!companyId) {
            const { data: existingCompany } = await supabase
              .from('companies')
              .select('id')
              .eq('cnpj', contact.company_cnpj)
              .single();
            
            if (existingCompany) {
              companyId = existingCompany.id;
            }
          }
        }

        const { error } = await supabase
          .from('contacts')
          .upsert({
            phone_number: contact.phone,
            name: contact.name,
            email: contact.email || null,
            cpf: contact.cpf || null,
            role: contact.role || null,
            is_billing_contact: contact.is_billing_contact,
            company_id: companyId
          }, { onConflict: 'phone_number' });

        if (error) {
          console.error('Error importing contact:', error);
          toast.error(`Erro ao importar ${contact.name}`);
        }

        setImportProgress({ current: selectedCompanies.length + i + 1, total });
      }

      toast.success(`Importação concluída! ${selectedCompanies.length} empresas, ${selectedContacts.length} contatos`);
      onSuccess();
      handleClose();

    } catch (error) {
      console.error('Error during import:', error);
      toast.error('Erro durante a importação');
    } finally {
      setImporting(false);
    }
  };

  const getConfidenceBadge = (confidence: number) => {
    if (confidence >= 90) {
      return <Badge className="bg-emerald-500/20 text-emerald-400 text-xs">Alta</Badge>;
    } else if (confidence >= 70) {
      return <Badge className="bg-amber-500/20 text-amber-400 text-xs">Média</Badge>;
    } else {
      return <Badge className="bg-red-500/20 text-red-400 text-xs">Baixa</Badge>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] bg-slate-900 border-slate-700">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Sparkles className="w-5 h-5 text-amber-400" />
            Importar com IA (PDF, Excel, Imagem)
          </DialogTitle>
        </DialogHeader>

        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-2 mb-4">
          {['upload', 'processing', 'review', 'importing'].map((s, i) => (
            <React.Fragment key={s}>
              <div className={`flex items-center gap-2 ${
                step === s ? 'text-amber-400' : 
                ['upload', 'processing', 'review', 'importing'].indexOf(step) > i ? 'text-emerald-400' : 'text-slate-500'
              }`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border ${
                  step === s ? 'border-amber-400 bg-amber-400/20' :
                  ['upload', 'processing', 'review', 'importing'].indexOf(step) > i ? 'border-emerald-400 bg-emerald-400/20' : 'border-slate-600'
                }`}>
                  {i + 1}
                </div>
                <span className="text-sm hidden sm:inline">
                  {s === 'upload' && 'Upload'}
                  {s === 'processing' && 'Processando'}
                  {s === 'review' && 'Revisão'}
                  {s === 'importing' && 'Importando'}
                </span>
              </div>
              {i < 3 && <div className="w-8 h-px bg-slate-700" />}
            </React.Fragment>
          ))}
        </div>

        <ScrollArea className="max-h-[60vh]">
          {/* Upload Step */}
          {step === 'upload' && (
            <div className="space-y-4">
              {/* Drop Zone */}
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                  dragActive 
                    ? 'border-amber-400 bg-amber-400/10' 
                    : 'border-slate-600 hover:border-slate-500'
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <Upload className="w-12 h-12 mx-auto text-slate-500 mb-4" />
                <p className="text-slate-300 mb-2">
                  Arraste arquivos aqui ou clique para selecionar
                </p>
                <p className="text-sm text-slate-500 mb-4">
                  PDF, XLS, XLSX, PNG, JPG (máx. 10MB cada)
                </p>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.xls,.xlsx,.csv"
                  onChange={handleFileInput}
                  className="hidden"
                  id="file-input"
                />
                <label htmlFor="file-input">
                  <Button variant="outline" className="cursor-pointer" asChild>
                    <span>Selecionar Arquivos</span>
                  </Button>
                </label>
              </div>

              {/* File List */}
              {files.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-slate-300">Arquivos selecionados:</h4>
                  {files.map((f, index) => (
                    <div key={index} className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg">
                      {getFileIcon(f.file.type)}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-200 truncate">{f.file.name}</p>
                        <p className="text-xs text-slate-500">
                          {(f.file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFile(index)}
                        className="text-slate-400 hover:text-red-400"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={handleClose}>
                  Cancelar
                </Button>
                <Button
                  onClick={processFiles}
                  disabled={files.length === 0}
                  className="bg-amber-600 hover:bg-amber-700 gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  Processar com IA
                </Button>
              </div>
            </div>
          )}

          {/* Processing Step */}
          {step === 'processing' && (
            <div className="space-y-4 py-8">
              <div className="text-center mb-6">
                <Loader2 className="w-12 h-12 mx-auto text-amber-400 animate-spin mb-4" />
                <p className="text-lg text-slate-200">Processando documentos com IA...</p>
                <p className="text-sm text-slate-500">Isso pode levar alguns segundos</p>
              </div>

              {files.map((f, index) => (
                <div key={index} className="space-y-2">
                  <div className="flex items-center gap-3">
                    {getFileIcon(f.file.type)}
                    <span className="text-sm text-slate-300 flex-1">{f.file.name}</span>
                    {f.status === 'done' && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
                    {f.status === 'error' && <AlertCircle className="w-5 h-5 text-red-400" />}
                    {f.status === 'processing' && <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />}
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        f.status === 'error' ? 'bg-red-500' : 
                        f.status === 'done' ? 'bg-emerald-500' : 'bg-amber-500'
                      }`}
                      style={{ width: `${f.progress}%` }}
                    />
                  </div>
                  {f.error && <p className="text-xs text-red-400">{f.error}</p>}
                </div>
              ))}
            </div>
          )}

          {/* Review Step */}
          {step === 'review' && (
            <div className="space-y-6">
              {/* Summary */}
              <div className="flex items-center gap-4 text-sm">
                <Badge variant="outline" className="gap-1">
                  <Building2 className="w-3 h-3" />
                  {companies.filter(c => c.selected).length} empresas
                </Badge>
                <Badge variant="outline" className="gap-1">
                  <User className="w-3 h-3" />
                  {contacts.filter(c => c.selected).length} contatos
                </Badge>
              </div>

              {/* Companies */}
              {companies.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-slate-300 flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-blue-400" />
                    Empresas Encontradas
                  </h4>
                  
                  {companies.map((company) => (
                    <Card key={company.id} className={`p-4 bg-slate-800/50 border-slate-700 ${!company.selected ? 'opacity-50' : ''}`}>
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={company.selected}
                          onCheckedChange={(checked) => updateCompany(company.id, { selected: !!checked })}
                        />
                        <div className="flex-1 space-y-2">
                          {company.isEditing ? (
                            <div className="grid grid-cols-2 gap-2">
                              <Input
                                value={company.razao_social}
                                onChange={(e) => updateCompany(company.id, { razao_social: e.target.value })}
                                placeholder="Razão Social"
                                className="bg-slate-900/50 text-sm"
                              />
                              <Input
                                value={company.nome_fantasia || ''}
                                onChange={(e) => updateCompany(company.id, { nome_fantasia: e.target.value })}
                                placeholder="Nome Fantasia"
                                className="bg-slate-900/50 text-sm"
                              />
                              <Input
                                value={company.cnpj}
                                onChange={(e) => updateCompany(company.id, { cnpj: e.target.value.replace(/\D/g, '') })}
                                placeholder="CNPJ"
                                className="bg-slate-900/50 text-sm"
                              />
                              <Input
                                value={company.city || ''}
                                onChange={(e) => updateCompany(company.id, { city: e.target.value })}
                                placeholder="Cidade"
                                className="bg-slate-900/50 text-sm"
                              />
                            </div>
                          ) : (
                            <>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-slate-200">{company.razao_social}</span>
                                {company.nome_fantasia && (
                                  <span className="text-sm text-slate-500">({company.nome_fantasia})</span>
                                )}
                                {getConfidenceBadge(company.confidence)}
                              </div>
                              <p className="text-sm text-slate-400">
                                CNPJ: {formatCNPJ(company.cnpj)}
                                {company.city && ` • ${company.city}`}
                                {company.state && `/${company.state}`}
                              </p>
                            </>
                          )}
                          {company.source && (
                            <p className="text-xs text-slate-600">Fonte: {company.source}</p>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => updateCompany(company.id, { isEditing: !company.isEditing })}
                            className="text-slate-400 hover:text-slate-200"
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeCompany(company.id)}
                            className="text-slate-400 hover:text-red-400"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}

              {/* Contacts */}
              {contacts.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-slate-300 flex items-center gap-2">
                    <User className="w-4 h-4 text-emerald-400" />
                    Contatos Encontrados
                  </h4>
                  
                  {contacts.map((contact) => (
                    <Card key={contact.id} className={`p-4 bg-slate-800/50 border-slate-700 ${!contact.selected ? 'opacity-50' : ''}`}>
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={contact.selected}
                          onCheckedChange={(checked) => updateContact(contact.id, { selected: !!checked })}
                        />
                        <div className="flex-1 space-y-2">
                          {contact.isEditing ? (
                            <div className="grid grid-cols-2 gap-2">
                              <Input
                                value={contact.name}
                                onChange={(e) => updateContact(contact.id, { name: e.target.value })}
                                placeholder="Nome"
                                className="bg-slate-900/50 text-sm"
                              />
                              <Input
                                value={contact.phone}
                                onChange={(e) => updateContact(contact.id, { phone: e.target.value.replace(/\D/g, '') })}
                                placeholder="WhatsApp"
                                className="bg-slate-900/50 text-sm"
                              />
                              <Input
                                value={contact.email || ''}
                                onChange={(e) => updateContact(contact.id, { email: e.target.value })}
                                placeholder="Email"
                                className="bg-slate-900/50 text-sm"
                              />
                              <Input
                                value={contact.role || ''}
                                onChange={(e) => updateContact(contact.id, { role: e.target.value })}
                                placeholder="Cargo"
                                className="bg-slate-900/50 text-sm"
                              />
                              <Select
                                value={contact.company_cnpj || 'none'}
                                onValueChange={(value) => updateContact(contact.id, { company_cnpj: value === 'none' ? undefined : value })}
                              >
                                <SelectTrigger className="bg-slate-900/50 text-sm">
                                  <SelectValue placeholder="Vincular a empresa" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">Sem vínculo</SelectItem>
                                  {companies.map((c) => (
                                    <SelectItem key={c.cnpj} value={c.cnpj}>
                                      {c.razao_social}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <div className="flex items-center gap-2">
                                <Checkbox
                                  checked={contact.is_billing_contact}
                                  onCheckedChange={(checked) => updateContact(contact.id, { is_billing_contact: !!checked })}
                                />
                                <span className="text-sm text-slate-400">Contato de cobrança</span>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-slate-200">{contact.name}</span>
                                {contact.role && (
                                  <span className="text-sm text-slate-500">• {contact.role}</span>
                                )}
                                {contact.is_billing_contact && (
                                  <Badge className="bg-purple-500/20 text-purple-400 text-xs">Cobrança</Badge>
                                )}
                                {getConfidenceBadge(contact.confidence)}
                              </div>
                              <p className="text-sm text-slate-400">
                                {formatPhone(contact.phone)}
                                {contact.email && ` • ${contact.email}`}
                              </p>
                              {contact.company_cnpj && (
                                <p className="text-xs text-slate-500">
                                  Empresa: {companies.find(c => c.cnpj === contact.company_cnpj)?.razao_social || formatCNPJ(contact.company_cnpj)}
                                </p>
                              )}
                            </>
                          )}
                          {contact.source && (
                            <p className="text-xs text-slate-600">Fonte: {contact.source}</p>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => updateContact(contact.id, { isEditing: !contact.isEditing })}
                            className="text-slate-400 hover:text-slate-200"
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeContact(contact.id)}
                            className="text-slate-400 hover:text-red-400"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}

              <div className="flex justify-between gap-2 pt-4 border-t border-slate-700">
                <Button variant="outline" onClick={() => setStep('upload')}>
                  Voltar
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={companies.filter(c => c.selected).length === 0 && contacts.filter(c => c.selected).length === 0}
                  className="bg-emerald-600 hover:bg-emerald-700 gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Importar {companies.filter(c => c.selected).length} Empresas + {contacts.filter(c => c.selected).length} Contatos
                </Button>
              </div>
            </div>
          )}

          {/* Importing Step */}
          {step === 'importing' && (
            <div className="py-8 text-center">
              <Loader2 className="w-12 h-12 mx-auto text-emerald-400 animate-spin mb-4" />
              <p className="text-lg text-slate-200 mb-2">Importando dados...</p>
              <p className="text-sm text-slate-500 mb-4">
                {importProgress.current} de {importProgress.total}
              </p>
              <div className="w-full max-w-xs mx-auto bg-slate-800 rounded-full h-2">
                <div
                  className="h-2 rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
