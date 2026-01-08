import React, { useState, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
  Trash2,
  RotateCcw,
  AlertTriangle,
  Receipt,
  Calendar,
  DollarSign
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

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

interface ExtractedInstallment {
  id: string;
  insurer: string;
  policy_number: string;
  endorsement?: string;
  receipt_number?: string;
  installment_number: number;
  total_installments?: number;
  value: number;
  due_date: string;
  cancellation_date?: string;
  insured_name: string;
  insured_document: string;
  insured_phone?: string;
  insured_email?: string;
  branch?: string;
  product?: string;
  status: string;
  days_overdue?: number;
  commission?: number;
  source?: string;
  confidence: number;
  selected: boolean;
  // Matching status
  matchStatus?: 'matched_document' | 'matched_phone' | 'matched_name' | 'new';
  matchedContactId?: string;
  matchedContactName?: string;
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
const LARGE_FILE_THRESHOLD = 5 * 1024 * 1024; // 5MB - triggers sequential mode recommendation

export const ImportDocumentAIModal: React.FC<Props> = ({ open, onOpenChange, onSuccess }) => {
  const [step, setStep] = useState<'upload' | 'processing' | 'review' | 'importing'>('upload');
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [companies, setCompanies] = useState<ExtractedCompany[]>([]);
  const [contacts, setContacts] = useState<ExtractedContact[]>([]);
  const [installments, setInstallments] = useState<ExtractedInstallment[]>([]);
  const [insurerDetected, setInsurerDetected] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [dragActive, setDragActive] = useState(false);
  const [sequentialMode, setSequentialMode] = useState(false);

  // Check if any file is large and auto-enable sequential mode
  const hasLargeFiles = files.some(f => f.file.size > LARGE_FILE_THRESHOLD);

  useEffect(() => {
    if (hasLargeFiles && !sequentialMode) {
      setSequentialMode(true);
      toast.info('Modo sequencial ativado para arquivos grandes');
    }
  }, [hasLargeFiles]);

  const resetState = () => {
    setStep('upload');
    setFiles([]);
    setCompanies([]);
    setContacts([]);
    setInstallments([]);
    setInsurerDetected(null);
    setImporting(false);
    setImportProgress({ current: 0, total: 0 });
    setSequentialMode(false);
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

  const formatCPF = (cpf: string) => {
    const clean = cpf.replace(/\D/g, '');
    if (clean.length !== 11) return cpf;
    return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  };

  const formatDocument = (doc: string) => {
    const clean = doc.replace(/\D/g, '');
    if (clean.length === 14) return formatCNPJ(clean);
    if (clean.length === 11) return formatCPF(clean);
    return doc;
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

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const formatDate = (dateStr: string) => {
    try {
      return format(parseISO(dateStr), 'dd/MM/yyyy', { locale: ptBR });
    } catch {
      return dateStr;
    }
  };

  // Normalize text for comparison (remove accents, lowercase)
  const normalizeText = (text: string): string => {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, '')
      .trim();
  };

  // Intelligent matching function to link installments to existing contacts
  const matchInstallmentsToContacts = async (installments: ExtractedInstallment[]): Promise<ExtractedInstallment[]> => {
    const matchedInstallments: ExtractedInstallment[] = [];
    
    for (const inst of installments) {
      let matchStatus: ExtractedInstallment['matchStatus'] = 'new';
      let matchedContactId: string | undefined;
      let matchedContactName: string | undefined;
      
      const docClean = inst.insured_document?.replace(/\D/g, '') || '';
      
      // Priority 1: Match by CPF/CNPJ (most reliable)
      if (docClean.length === 11) {
        const { data: contactByCpf } = await supabase
          .from('contacts')
          .select('id, name')
          .eq('cpf', docClean)
          .maybeSingle();
        
        if (contactByCpf) {
          matchStatus = 'matched_document';
          matchedContactId = contactByCpf.id;
          matchedContactName = contactByCpf.name || undefined;
        }
      } else if (docClean.length === 14) {
        // For CNPJ, find company and its billing contact
        const { data: company } = await supabase
          .from('companies')
          .select('id')
          .eq('cnpj', docClean)
          .maybeSingle();
        
        if (company) {
          const { data: billingContact } = await supabase
            .from('contacts')
            .select('id, name')
            .eq('company_id', company.id)
            .eq('is_billing_contact', true)
            .maybeSingle();
          
          if (billingContact) {
            matchStatus = 'matched_document';
            matchedContactId = billingContact.id;
            matchedContactName = billingContact.name || undefined;
          }
        }
      }
      
      // Priority 2: Match by phone (if no document match)
      if (!matchedContactId && inst.insured_phone) {
        const phoneClean = inst.insured_phone.replace(/\D/g, '');
        if (phoneClean.length >= 10) {
          // Try exact match first
          let { data: contactByPhone } = await supabase
            .from('contacts')
            .select('id, name')
            .eq('phone_number', phoneClean)
            .maybeSingle();
          
          // If no exact match, try matching last 9 digits
          if (!contactByPhone && phoneClean.length >= 9) {
            const last9 = phoneClean.slice(-9);
            const { data: contactByPartialPhone } = await supabase
              .from('contacts')
              .select('id, name, phone_number')
              .ilike('phone_number', `%${last9}`)
              .limit(1);
            
            if (contactByPartialPhone && contactByPartialPhone.length > 0) {
              contactByPhone = contactByPartialPhone[0];
            }
          }
          
          if (contactByPhone) {
            matchStatus = 'matched_phone';
            matchedContactId = contactByPhone.id;
            matchedContactName = contactByPhone.name || undefined;
          }
        }
      }
      
      // Priority 3: Match by name (similarity search)
      if (!matchedContactId && inst.insured_name) {
        const normalizedName = normalizeText(inst.insured_name);
        const nameParts = normalizedName.split(' ').filter(p => p.length > 2);
        
        if (nameParts.length >= 2) {
          // Search using first and last significant name parts
          const searchPattern = `%${nameParts[0]}%${nameParts[nameParts.length - 1]}%`;
          
          const { data: contactsByName } = await supabase
            .from('contacts')
            .select('id, name')
            .ilike('name', searchPattern)
            .limit(1);
          
          if (contactsByName && contactsByName.length > 0) {
            matchStatus = 'matched_name';
            matchedContactId = contactsByName[0].id;
            matchedContactName = contactsByName[0].name || undefined;
          }
        }
      }
      
      matchedInstallments.push({
        ...inst,
        matchStatus,
        matchedContactId,
        matchedContactName
      });
    }
    
    const matchedCount = matchedInstallments.filter(i => i.matchStatus !== 'new').length;
    if (matchedCount > 0) {
      toast.success(`${matchedCount} parcela(s) vinculada(s) a clientes existentes`);
    }
    
    return matchedInstallments;
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

  // Process files in parallel (all at once)
  const processFilesParallel = async () => {
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

      return data;
    } catch (error: any) {
      console.error('Error processing files:', error);
      setFiles(prev => prev.map(f => ({ 
        ...f, 
        status: 'error' as const, 
        error: error.message || 'Erro ao processar' 
      })));
      throw error;
    }
  };

  // Process files sequentially (one at a time) - recommended for large files
  const processFilesSequential = async () => {
    const allCompanies: any[] = [];
    const allContacts: any[] = [];
    const allInstallments: any[] = [];
    let detectedInsurer: string | null = null;

    for (let i = 0; i < files.length; i++) {
      const f = files[i];

      // Skip already processed files
      if (f.status === 'done') continue;

      // Update status of current file
      setFiles(prev => prev.map((pf, idx) => 
        idx === i ? { ...pf, status: 'processing' as const, progress: 10 } : pf
      ));

      try {
        const base64 = await fileToBase64(f.file);
        setFiles(prev => prev.map((pf, idx) => 
          idx === i ? { ...pf, progress: 40 } : pf
        ));

        // Send only this file
        const { data, error } = await supabase.functions.invoke('extract-documents', {
          body: { 
            files: [{
              name: f.file.name,
              type: f.file.type,
              content: base64
            }]
          }
        });

        if (error) throw error;

        // Merge results
        allCompanies.push(...(data.companies || []));
        allContacts.push(...(data.contacts || []));
        allInstallments.push(...(data.installments || []));
        
        if (data.insurer_detected && !detectedInsurer) {
          detectedInsurer = data.insurer_detected;
        }

        // Mark as done
        setFiles(prev => prev.map((pf, idx) => 
          idx === i ? { ...pf, status: 'done' as const, progress: 100 } : pf
        ));

      } catch (error: any) {
        // Mark error but continue with next files
        console.error(`Error processing file ${f.file.name}:`, error);
        setFiles(prev => prev.map((pf, idx) => 
          idx === i ? { ...pf, status: 'error' as const, error: error.message || 'Erro ao processar' } : pf
        ));
      }
    }

    return { 
      companies: allCompanies, 
      contacts: allContacts, 
      installments: allInstallments,
      insurer_detected: detectedInsurer 
    };
  };

  // Retry a single file that failed
  const retryFile = async (index: number) => {
    const f = files[index];
    
    setFiles(prev => prev.map((pf, idx) => 
      idx === index ? { ...pf, status: 'processing' as const, progress: 10, error: undefined } : pf
    ));

    try {
      const base64 = await fileToBase64(f.file);
      setFiles(prev => prev.map((pf, idx) => 
        idx === index ? { ...pf, progress: 40 } : pf
      ));

      const { data, error } = await supabase.functions.invoke('extract-documents', {
        body: { 
          files: [{
            name: f.file.name,
            type: f.file.type,
            content: base64
          }]
        }
      });

      if (error) throw error;

      // Merge new results with existing
      const newCompanies: ExtractedCompany[] = (data.companies || []).map((c: any, i: number) => ({
        ...c,
        id: `company-retry-${index}-${i}-${Date.now()}`,
        selected: true,
        isEditing: false
      }));

      const newContacts: ExtractedContact[] = (data.contacts || []).map((c: any, i: number) => ({
        ...c,
        id: `contact-retry-${index}-${i}-${Date.now()}`,
        selected: true,
        isEditing: false
      }));

      const newInstallments: ExtractedInstallment[] = (data.installments || []).map((inst: any, i: number) => ({
        ...inst,
        id: `installment-retry-${index}-${i}-${Date.now()}`,
        selected: true
      }));

      setCompanies(prev => [...prev, ...newCompanies]);
      setContacts(prev => [...prev, ...newContacts]);
      setInstallments(prev => [...prev, ...newInstallments]);
      
      if (data.insurer_detected && !insurerDetected) {
        setInsurerDetected(data.insurer_detected);
      }

      setFiles(prev => prev.map((pf, idx) => 
        idx === index ? { ...pf, status: 'done' as const, progress: 100 } : pf
      ));

      toast.success(`Arquivo processado: ${newCompanies.length} empresas, ${newContacts.length} contatos, ${newInstallments.length} parcelas`);

    } catch (error: any) {
      console.error(`Error retrying file ${f.file.name}:`, error);
      setFiles(prev => prev.map((pf, idx) => 
        idx === index ? { ...pf, status: 'error' as const, error: error.message || 'Erro ao processar' } : pf
      ));
      toast.error(`Erro ao reprocessar ${f.file.name}`);
    }
  };

  // Continue to review with partial results
  const continueWithResults = () => {
    const doneFiles = files.filter(f => f.status === 'done').length;
    if (doneFiles > 0 && (companies.length > 0 || contacts.length > 0 || installments.length > 0)) {
      setStep('review');
      toast.info(`Continuando com ${doneFiles} arquivo(s) processado(s)`);
    } else {
      toast.error('Nenhum arquivo foi processado com sucesso');
      setStep('upload');
    }
  };

  const processFiles = async () => {
    if (files.length === 0) {
      toast.error('Selecione pelo menos um arquivo');
      return;
    }

    setStep('processing');

    try {
      let data;

      if (sequentialMode) {
        data = await processFilesSequential();
      } else {
        data = await processFilesParallel();
      }

      // Check if all files failed
      const allFailed = files.every(f => f.status === 'error');
      if (allFailed) {
        toast.error('Erro ao processar todos os documentos');
        setStep('upload');
        return;
      }

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

      let extractedInstallments: ExtractedInstallment[] = (data.installments || []).map((inst: any, i: number) => ({
        ...inst,
        id: `installment-${i}-${Date.now()}`,
        selected: true,
        matchStatus: 'new' as const
      }));

      if (extractedCompanies.length === 0 && extractedContacts.length === 0 && extractedInstallments.length === 0) {
        toast.warning('Nenhum dado foi identificado nos documentos');
        setStep('upload');
        return;
      }

      // Run intelligent matching for installments
      if (extractedInstallments.length > 0) {
        toast.info('Vinculando parcelas a clientes existentes...');
        extractedInstallments = await matchInstallmentsToContacts(extractedInstallments);
      }

      setCompanies(extractedCompanies);
      setContacts(extractedContacts);
      setInstallments(extractedInstallments);
      
      if (data.insurer_detected) {
        setInsurerDetected(data.insurer_detected);
      }
      
      setStep('review');

      const errorCount = files.filter(f => f.status === 'error').length;
      const summary = [];
      if (extractedCompanies.length > 0) summary.push(`${extractedCompanies.length} empresas`);
      if (extractedContacts.length > 0) summary.push(`${extractedContacts.length} contatos`);
      if (extractedInstallments.length > 0) summary.push(`${extractedInstallments.length} parcelas`);
      
      if (errorCount > 0) {
        toast.warning(`Identificados: ${summary.join(', ')} (${errorCount} arquivo(s) com erro)`);
      } else {
        toast.success(`Identificados: ${summary.join(', ')}`);
      }

    } catch (error: any) {
      console.error('Error processing files:', error);
      toast.error('Erro ao processar documentos');
      // Don't go back to upload in sequential mode - let user retry individual files
      if (!sequentialMode) {
        setStep('upload');
      }
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

  const toggleInstallmentSelection = (id: string) => {
    setInstallments(prev => prev.map(inst => 
      inst.id === id ? { ...inst, selected: !inst.selected } : inst
    ));
  };

  const toggleAllInstallments = (selected: boolean) => {
    setInstallments(prev => prev.map(inst => ({ ...inst, selected })));
  };

  const handleImport = async () => {
    const selectedCompanies = companies.filter(c => c.selected);
    const selectedContacts = contacts.filter(c => c.selected);
    const selectedInstallments = installments.filter(inst => inst.selected);

    if (selectedCompanies.length === 0 && selectedContacts.length === 0 && selectedInstallments.length === 0) {
      toast.error('Selecione pelo menos um item para importar');
      return;
    }

    setStep('importing');
    setImporting(true);
    const total = selectedCompanies.length + selectedContacts.length + selectedInstallments.length;
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
      const contactIdMap = new Map<string, string>(); // phone or document -> id
      
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

        const { data, error } = await supabase
          .from('contacts')
          .upsert({
            phone_number: contact.phone,
            name: contact.name,
            email: contact.email || null,
            cpf: contact.cpf || null,
            role: contact.role || null,
            is_billing_contact: contact.is_billing_contact,
            company_id: companyId
          }, { onConflict: 'phone_number' })
          .select('id')
          .single();

        if (error) {
          console.error('Error importing contact:', error);
          toast.error(`Erro ao importar ${contact.name}`);
        } else if (data) {
          contactIdMap.set(contact.phone, data.id);
          if (contact.cpf) {
            contactIdMap.set(contact.cpf, data.id);
          }
        }

        setImportProgress({ current: selectedCompanies.length + i + 1, total });
      }

      // Import installments (create policies and installments)
      const policyIdMap = new Map<string, string>(); // policy_number -> id
      
      for (let i = 0; i < selectedInstallments.length; i++) {
        const inst = selectedInstallments[i];
        
        try {
          // Use pre-matched contact if available
          let contactId: string | null = inst.matchedContactId || null;
          
          // If not pre-matched, try to find contact from our import map
          if (!contactId && inst.insured_phone) {
            contactId = contactIdMap.get(inst.insured_phone) || null;
          }
          
          if (!contactId && inst.insured_document) {
            // Try to find contact by document (CPF/CNPJ)
            const docClean = inst.insured_document.replace(/\D/g, '');
            
            if (docClean.length === 11) {
              // CPF
              const { data: existingContact } = await supabase
                .from('contacts')
                .select('id')
                .eq('cpf', docClean)
                .maybeSingle();
              
              if (existingContact) {
                contactId = existingContact.id;
              }
            } else if (docClean.length === 14) {
              // CNPJ - find company and associated contact
              const { data: existingCompany } = await supabase
                .from('companies')
                .select('id')
                .eq('cnpj', docClean)
                .maybeSingle();
              
              if (existingCompany) {
                // Find billing contact for this company
                const { data: billingContact } = await supabase
                  .from('contacts')
                  .select('id')
                  .eq('company_id', existingCompany.id)
                  .eq('is_billing_contact', true)
                  .maybeSingle();
                
                if (billingContact) {
                  contactId = billingContact.id;
                }
              }
            }
          }
          
          // Create contact if not found - either with phone or with pending phone
          if (!contactId) {
            const cleanPhone = inst.insured_phone?.replace(/\D/g, '') || '';
            const docClean = inst.insured_document?.replace(/\D/g, '') || '';
            
            // Generate phone: real phone, or temporary based on document/name
            let phoneNumber = cleanPhone.length >= 10 ? cleanPhone : null;
            if (!phoneNumber) {
              // Create with pending phone for later manual update
              phoneNumber = docClean ? `PENDENTE_${docClean}` : `PENDENTE_${Date.now()}`;
            }
            
            const { data: newContact } = await supabase
              .from('contacts')
              .upsert({
                phone_number: phoneNumber,
                name: inst.insured_name,
                email: inst.insured_email || null,
                cpf: docClean.length === 11 ? docClean : null,
                cnpj: docClean.length === 14 ? docClean : null,
                is_billing_contact: true,
                lead_source: 'import_cobranca',
                tags: cleanPhone.length < 10 ? ['telefone_pendente'] : null
              }, { onConflict: 'phone_number' })
              .select('id')
              .single();
            
            if (newContact) {
              contactId = newContact.id;
            }
          }
          
          // Find or create company if CNPJ
          let companyId: string | null = null;
          if (inst.insured_document?.replace(/\D/g, '').length === 14) {
            const cnpj = inst.insured_document.replace(/\D/g, '');
            
            const { data: existingCompany } = await supabase
              .from('companies')
              .select('id')
              .eq('cnpj', cnpj)
              .maybeSingle();
            
            if (existingCompany) {
              companyId = existingCompany.id;
            } else {
              const { data: newCompany } = await supabase
                .from('companies')
                .insert({
                  cnpj: cnpj,
                  razao_social: inst.insured_name
                })
                .select('id')
                .single();
              
              if (newCompany) {
                companyId = newCompany.id;
              }
            }
          }
          
          // Find or create policy
          let policyId = policyIdMap.get(inst.policy_number);
          
          if (!policyId) {
            const { data: existingPolicy } = await supabase
              .from('policies')
              .select('id')
              .eq('policy_number', inst.policy_number)
              .eq('insurer', inst.insurer)
              .maybeSingle();
            
            if (existingPolicy) {
              policyId = existingPolicy.id;
            } else {
              const { data: newPolicy, error: policyError } = await supabase
                .from('policies')
                .insert({
                  policy_number: inst.policy_number,
                  insurer: inst.insurer,
                  branch: inst.branch || null,
                  product: inst.product || null,
                  contact_id: contactId,
                  company_id: companyId,
                  status: 'active'
                })
                .select('id')
                .single();
              
              if (policyError) {
                console.error('Error creating policy:', policyError);
              } else if (newPolicy) {
                policyId = newPolicy.id;
                policyIdMap.set(inst.policy_number, policyId);
              }
            }
          }
          
          // Create installment
          if (policyId) {
            const { error: installmentError } = await supabase
              .from('installments')
              .upsert({
                policy_id: policyId,
                contact_id: contactId,
                installment_number: inst.installment_number,
                value: inst.value,
                due_date: inst.due_date,
                days_overdue: inst.days_overdue || 0,
                status: inst.status === 'VENCIDO' || inst.status === 'ATRASADO' ? 'overdue' : 'pending',
                metadata: {
                  receipt_number: inst.receipt_number,
                  endorsement: inst.endorsement,
                  cancellation_date: inst.cancellation_date,
                  commission: inst.commission,
                  source: inst.source
                }
              }, { 
                onConflict: 'policy_id,installment_number',
                ignoreDuplicates: false 
              });
            
            if (installmentError) {
              console.error('Error creating installment:', installmentError);
            }
          }
        } catch (err) {
          console.error('Error importing installment:', err);
        }

        setImportProgress({ current: selectedCompanies.length + selectedContacts.length + i + 1, total });
      }

      const summary = [];
      if (selectedCompanies.length > 0) summary.push(`${selectedCompanies.length} empresas`);
      if (selectedContacts.length > 0) summary.push(`${selectedContacts.length} contatos`);
      if (selectedInstallments.length > 0) summary.push(`${selectedInstallments.length} parcelas`);
      
      toast.success(`Importação concluída! ${summary.join(', ')}`);
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

  const getMatchStatusBadge = (status?: ExtractedInstallment['matchStatus'], matchedName?: string) => {
    switch (status) {
      case 'matched_document':
        return (
          <Badge className="bg-emerald-500/20 text-emerald-400 text-xs whitespace-nowrap">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            CPF/CNPJ
          </Badge>
        );
      case 'matched_phone':
        return (
          <Badge className="bg-blue-500/20 text-blue-400 text-xs whitespace-nowrap">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Telefone
          </Badge>
        );
      case 'matched_name':
        return (
          <Badge className="bg-amber-500/20 text-amber-400 text-xs whitespace-nowrap">
            <AlertCircle className="w-3 h-3 mr-1" />
            Nome
          </Badge>
        );
      default:
        return (
          <Badge className="bg-purple-500/20 text-purple-400 text-xs whitespace-nowrap">
            <User className="w-3 h-3 mr-1" />
            Novo
          </Badge>
        );
    }
  };

  const getStatusBadge = (status: string) => {
    if (status === 'VENCIDO' || status === 'ATRASADO') {
      return <Badge variant="destructive" className="text-xs">{status}</Badge>;
    }
    return <Badge variant="outline" className="text-xs">{status}</Badge>;
  };

  // Calculate installments summary
  const selectedInstallmentsTotal = installments
    .filter(inst => inst.selected)
    .reduce((sum, inst) => sum + inst.value, 0);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] bg-slate-900 border-slate-700">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Sparkles className="w-5 h-5 text-amber-400" />
            Importar com IA (PDF, Excel, Imagem)
            {insurerDetected && (
              <Badge className="ml-2 bg-blue-500/20 text-blue-400">{insurerDetected}</Badge>
            )}
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
                  <h4 className="text-sm font-medium text-slate-300">
                    Arquivos selecionados: {files.length}
                  </h4>
                  {files.map((f, index) => (
                    <div key={index} className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg">
                      {getFileIcon(f.file.type)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm text-slate-200 truncate">{f.file.name}</p>
                          {f.file.size > LARGE_FILE_THRESHOLD && (
                            <Badge className="bg-amber-500/20 text-amber-400 text-xs shrink-0">Grande</Badge>
                          )}
                        </div>
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

              {/* Sequential Mode Toggle */}
              {files.length > 0 && (
                <div className="flex items-center gap-3 p-4 bg-slate-800/30 rounded-lg border border-slate-700">
                  <Switch
                    checked={sequentialMode}
                    onCheckedChange={setSequentialMode}
                  />
                  <div className="flex-1">
                    <p className="text-sm text-slate-300">Processamento Sequencial</p>
                    <p className="text-xs text-slate-500">
                      Processa um arquivo por vez (evita timeout, permite retry individual)
                    </p>
                  </div>
                  {hasLargeFiles && (
                    <Badge className="bg-amber-500/20 text-amber-400 text-xs shrink-0">
                      <AlertTriangle className="w-3 h-3 mr-1" />
                      Recomendado
                    </Badge>
                  )}
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
                <p className="text-lg text-slate-200">
                  {sequentialMode 
                    ? `Processando arquivo ${files.filter(f => f.status === 'done').length + 1} de ${files.length}...`
                    : 'Processando documentos com IA...'
                  }
                </p>
                <p className="text-sm text-slate-500">
                  {sequentialMode 
                    ? 'Modo sequencial: cada arquivo é processado individualmente'
                    : 'Isso pode levar alguns segundos'
                  }
                </p>
              </div>

              {files.map((f, index) => (
                <div key={index} className="space-y-2">
                  <div className="flex items-center gap-3">
                    {getFileIcon(f.file.type)}
                    <span className="text-sm text-slate-300 flex-1 truncate">{f.file.name}</span>
                    {f.file.size > LARGE_FILE_THRESHOLD && (
                      <Badge className="bg-amber-500/20 text-amber-400 text-xs shrink-0">Grande</Badge>
                    )}
                    {f.status === 'done' && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />}
                    {f.status === 'error' && <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />}
                    {f.status === 'processing' && <Loader2 className="w-5 h-5 text-amber-400 animate-spin shrink-0" />}
                    {f.status === 'pending' && <div className="w-5 h-5 rounded-full border-2 border-slate-600 shrink-0" />}
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
                  {f.error && (
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-red-400 flex-1">{f.error}</p>
                      {sequentialMode && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => retryFile(index)}
                          className="text-xs h-6 px-2"
                        >
                          <RotateCcw className="w-3 h-3 mr-1" />
                          Tentar novamente
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {/* Continue with partial results button */}
              {sequentialMode && files.some(f => f.status === 'error') && files.some(f => f.status === 'done') && (
                <div className="pt-4 border-t border-slate-700">
                  <Button
                    variant="outline"
                    onClick={continueWithResults}
                    className="w-full"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Continuar com {files.filter(f => f.status === 'done').length} arquivo(s) processado(s)
                  </Button>
                </div>
              )}

              {/* Back button for errors */}
              {files.every(f => f.status === 'error') && (
                <div className="pt-4">
                  <Button
                    variant="outline"
                    onClick={() => setStep('upload')}
                    className="w-full"
                  >
                    Voltar e tentar novamente
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Review Step */}
          {step === 'review' && (
            <div className="space-y-6">
              {/* Summary */}
              <div className="flex items-center gap-4 text-sm flex-wrap">
                {companies.length > 0 && (
                  <Badge variant="outline" className="gap-1">
                    <Building2 className="w-3 h-3" />
                    {companies.filter(c => c.selected).length} empresas
                  </Badge>
                )}
                {contacts.length > 0 && (
                  <Badge variant="outline" className="gap-1">
                    <User className="w-3 h-3" />
                    {contacts.filter(c => c.selected).length} contatos
                  </Badge>
                )}
                {installments.length > 0 && (
                  <Badge variant="outline" className="gap-1">
                    <Receipt className="w-3 h-3" />
                    {installments.filter(i => i.selected).length} parcelas
                  </Badge>
                )}
                {selectedInstallmentsTotal > 0 && (
                  <Badge className="bg-emerald-500/20 text-emerald-400 gap-1">
                    <DollarSign className="w-3 h-3" />
                    {formatCurrency(selectedInstallmentsTotal)}
                  </Badge>
                )}
              </div>

              {/* Installments */}
              {installments.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-slate-300 flex items-center gap-2">
                      <Receipt className="w-4 h-4 text-amber-400" />
                      Parcelas Inadimplentes
                      {insurerDetected && (
                        <Badge className="bg-blue-500/20 text-blue-400 text-xs ml-2">{insurerDetected}</Badge>
                      )}
                    </h4>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleAllInstallments(true)}
                        className="text-xs"
                      >
                        Selecionar todas
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleAllInstallments(false)}
                        className="text-xs"
                      >
                        Desmarcar todas
                      </Button>
                    </div>
                  </div>
                  
                  <div className="rounded-lg border border-slate-700 overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-800/50 hover:bg-slate-800/50">
                          <TableHead className="w-10"></TableHead>
                          <TableHead>Segurado</TableHead>
                          <TableHead>Vinculação</TableHead>
                          <TableHead>CPF/CNPJ</TableHead>
                          <TableHead>Apólice</TableHead>
                          <TableHead className="text-center">Parcela</TableHead>
                          <TableHead className="text-right">Valor</TableHead>
                          <TableHead>Vencimento</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {installments.map((inst) => (
                          <TableRow 
                            key={inst.id} 
                            className={`${!inst.selected ? 'opacity-50' : ''} hover:bg-slate-800/30`}
                          >
                            <TableCell>
                              <Checkbox
                                checked={inst.selected}
                                onCheckedChange={() => toggleInstallmentSelection(inst.id)}
                              />
                            </TableCell>
                            <TableCell className="font-medium text-slate-200 max-w-[180px]">
                              <div className="truncate" title={inst.insured_name}>{inst.insured_name}</div>
                              {inst.matchedContactName && inst.matchedContactName !== inst.insured_name && (
                                <div className="text-xs text-slate-500 truncate" title={`Vinculado a: ${inst.matchedContactName}`}>
                                  → {inst.matchedContactName}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              {getMatchStatusBadge(inst.matchStatus, inst.matchedContactName)}
                            </TableCell>
                            <TableCell className="text-slate-400 text-sm">
                              {formatDocument(inst.insured_document)}
                            </TableCell>
                            <TableCell className="text-slate-300">
                              {inst.policy_number}
                              {inst.endorsement && <span className="text-slate-500 text-xs ml-1">/{inst.endorsement}</span>}
                            </TableCell>
                            <TableCell className="text-center text-slate-400">
                              {inst.installment_number}
                              {inst.total_installments && `/${inst.total_installments}`}
                            </TableCell>
                            <TableCell className="text-right font-medium text-emerald-400">
                              {formatCurrency(inst.value)}
                            </TableCell>
                            <TableCell className="text-slate-400">
                              <div className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {formatDate(inst.due_date)}
                              </div>
                              {inst.days_overdue && inst.days_overdue > 0 && (
                                <span className="text-xs text-red-400">
                                  {inst.days_overdue} dias
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              {getStatusBadge(inst.status)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

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
                            className="text-slate-400 hover:text-blue-400"
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
                                placeholder="Telefone"
                                className="bg-slate-900/50 text-sm"
                              />
                              <Input
                                value={contact.email || ''}
                                onChange={(e) => updateContact(contact.id, { email: e.target.value })}
                                placeholder="Email"
                                className="bg-slate-900/50 text-sm"
                              />
                              <Input
                                value={contact.cpf || ''}
                                onChange={(e) => updateContact(contact.id, { cpf: e.target.value.replace(/\D/g, '') })}
                                placeholder="CPF"
                                className="bg-slate-900/50 text-sm"
                              />
                            </div>
                          ) : (
                            <>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-slate-200">{contact.name}</span>
                                {contact.role && (
                                  <Badge variant="outline" className="text-xs">{contact.role}</Badge>
                                )}
                                {contact.is_billing_contact && (
                                  <Badge className="bg-blue-500/20 text-blue-400 text-xs">Cobrança</Badge>
                                )}
                                {getConfidenceBadge(contact.confidence)}
                              </div>
                              <p className="text-sm text-slate-400">
                                {formatPhone(contact.phone)}
                                {contact.email && ` • ${contact.email}`}
                                {contact.cpf && ` • CPF: ${formatCPF(contact.cpf)}`}
                              </p>
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
                            className="text-slate-400 hover:text-blue-400"
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

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-700">
                <Button variant="outline" onClick={handleClose}>
                  Cancelar
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={
                    companies.filter(c => c.selected).length === 0 && 
                    contacts.filter(c => c.selected).length === 0 &&
                    installments.filter(i => i.selected).length === 0
                  }
                  className="bg-emerald-600 hover:bg-emerald-700 gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Importar Selecionados
                </Button>
              </div>
            </div>
          )}

          {/* Importing Step */}
          {step === 'importing' && (
            <div className="space-y-4 py-8">
              <div className="text-center">
                <Loader2 className="w-12 h-12 mx-auto text-emerald-400 animate-spin mb-4" />
                <p className="text-lg text-slate-200">Importando dados...</p>
                <p className="text-sm text-slate-500">
                  {importProgress.current} de {importProgress.total} itens
                </p>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-3">
                <div
                  className="h-3 rounded-full bg-emerald-500 transition-all"
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
