import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
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
  DollarSign,
  Mail,
  ArrowRight,
  Save,
  History,
  RefreshCw,
  GitMerge,
  Replace,
  Ban
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuth } from '@/hooks/useAuth';

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
  // Duplicate detection
  duplicateStatus?: 'new' | 'duplicate' | 'merge_available';
  existingCompanyId?: string;
  existingData?: {
    razao_social: string;
    nome_fantasia: string | null;
    city: string | null;
    state: string | null;
    contacts_count: number;
    policies_count: number;
  };
  mergeStrategy?: 'ignore' | 'merge' | 'replace';
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
  insured_company_name?: string;
  insured_is_company?: boolean;
  branch?: string;
  product?: string;
  status: string;
  days_overdue?: number;
  commission?: number;
  source?: string;
  confidence: number;
  selected: boolean;
  // Contact matching status
  matchStatus?: 'matched_document' | 'matched_phone' | 'matched_name' | 'matched_similar' | 'new';
  matchedContactId?: string;
  matchedContactName?: string;
  // Company matching status
  companyMatchStatus?: 'matched_cnpj' | 'matched_name' | 'matched_similar' | 'new_company' | 'not_company';
  matchedCompanyId?: string;
  matchedCompanyName?: string;
  // Duplicate detection status
  duplicateStatus?: 'new' | 'duplicate' | 'update_available';
  existingInstallmentId?: string;
  existingValue?: number;
  existingStatus?: string;
  existingDueDate?: string;
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
  onGoToInstallments?: () => void;
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
const LARGE_FILE_THRESHOLD = 200 * 1024; // 200KB - triggers sequential mode (Base64 adds ~33% overhead)
const MAX_PARALLEL_SIZE = 500 * 1024; // 500KB total for parallel processing

const PENDING_IMPORT_KEY = 'pending_import_data';

export const ImportDocumentAIModal: React.FC<Props> = ({ open, onOpenChange, onSuccess, onGoToInstallments }) => {
  const { user } = useAuth();
  const [step, setStep] = useState<'upload' | 'processing' | 'review' | 'importing' | 'done'>('upload');
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [companies, setCompanies] = useState<ExtractedCompany[]>([]);
  const [contacts, setContacts] = useState<ExtractedContact[]>([]);
  const [installments, setInstallments] = useState<ExtractedInstallment[]>([]);
  const [insurerDetected, setInsurerDetected] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [dragActive, setDragActive] = useState(false);
  const [sequentialMode, setSequentialMode] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [hasPendingData, setHasPendingData] = useState(false);
  const [auditLogId, setAuditLogId] = useState<string | null>(null);
  const sessionIdRef = useRef<string>(`session_${Date.now()}`);

  // Check if any file is large and auto-enable sequential mode
  const hasLargeFiles = files.some(f => f.file.size > LARGE_FILE_THRESHOLD);
  const hasMultipleFiles = files.length > 1;
  const totalFileSize = files.reduce((sum, f) => sum + f.file.size, 0);
  const shouldForceSequential = hasLargeFiles || hasMultipleFiles || totalFileSize > MAX_PARALLEL_SIZE;

  useEffect(() => {
    // Auto-enable sequential mode for large files, multiple files, or large total size
    if (shouldForceSequential && !sequentialMode && files.length > 0) {
      setSequentialMode(true);
      if (hasLargeFiles) {
        toast.info('Modo sequencial ativado: arquivo(s) grande(s) detectado(s)', {
          description: 'Isso evita erros de conexão e timeout'
        });
      } else if (hasMultipleFiles) {
        toast.info('Modo sequencial ativado para múltiplos arquivos', {
          description: 'Processamento um a um é mais estável'
        });
      }
    }
  }, [shouldForceSequential, files.length]);

  // Check for pending data on mount
  useEffect(() => {
    if (open) {
      const pendingData = localStorage.getItem(PENDING_IMPORT_KEY);
      if (pendingData) {
        try {
          const data = JSON.parse(pendingData);
          // Check if data is recent (less than 24 hours)
          if (data.timestamp && Date.now() - data.timestamp < 24 * 60 * 60 * 1000) {
            setHasPendingData(true);
          } else {
            localStorage.removeItem(PENDING_IMPORT_KEY);
          }
        } catch {
          localStorage.removeItem(PENDING_IMPORT_KEY);
        }
      }
    }
  }, [open]);

  // Auto-save extracted data to localStorage
  useEffect(() => {
    if (step === 'review' && (companies.length > 0 || contacts.length > 0 || installments.length > 0)) {
      const dataToSave = {
        companies,
        contacts,
        installments,
        insurerDetected,
        fileNames: files.map(f => f.file.name),
        timestamp: Date.now()
      };
      localStorage.setItem(PENDING_IMPORT_KEY, JSON.stringify(dataToSave));
    }
  }, [step, companies, contacts, installments, insurerDetected, files]);

  // Create audit log on extraction start
  const createAuditLog = async (fileNames: string[]) => {
    if (!user) return null;
    
    try {
      const { data, error } = await supabase
        .from('import_audit_logs')
        .insert({
          user_id: user.id,
          session_id: sessionIdRef.current,
          file_names: fileNames,
          status: 'extracting'
        })
        .select('id')
        .single();
      
      if (error) throw error;
      return data.id;
    } catch (err) {
      console.error('Error creating audit log:', err);
      return null;
    }
  };

  // Update audit log
  const updateAuditLog = async (updates: Record<string, any>) => {
    if (!auditLogId) return;
    
    try {
      await supabase
        .from('import_audit_logs')
        .update(updates)
        .eq('id', auditLogId);
    } catch (err) {
      console.error('Error updating audit log:', err);
    }
  };

  // Load pending data from localStorage
  const loadPendingData = () => {
    const pendingData = localStorage.getItem(PENDING_IMPORT_KEY);
    if (pendingData) {
      try {
        const data = JSON.parse(pendingData);
        setCompanies(data.companies || []);
        setContacts(data.contacts || []);
        setInstallments(data.installments || []);
        setInsurerDetected(data.insurerDetected || null);
        setStep('review');
        setHasPendingData(false);
        toast.success(`Dados recuperados: ${data.installments?.length || 0} parcelas, ${data.companies?.length || 0} empresas, ${data.contacts?.length || 0} contatos`);
      } catch (err) {
        toast.error('Erro ao recuperar dados pendentes');
        localStorage.removeItem(PENDING_IMPORT_KEY);
      }
    }
  };

  const clearPendingData = () => {
    localStorage.removeItem(PENDING_IMPORT_KEY);
    setHasPendingData(false);
  };

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
    setAuditLogId(null);
    sessionIdRef.current = `session_${Date.now()}`;
  };

  const handleClose = () => {
    // Check if there's data that would be lost
    if (step === 'review' && (companies.length > 0 || contacts.length > 0 || installments.length > 0)) {
      setShowCloseConfirm(true);
      return;
    }
    resetState();
    onOpenChange(false);
  };

  const confirmClose = (savePending: boolean) => {
    if (savePending) {
      toast.info('Dados salvos temporariamente. Você pode recuperá-los ao abrir o modal novamente.');
    } else {
      clearPendingData();
    }
    resetState();
    onOpenChange(false);
    setShowCloseConfirm(false);
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

  const formatDocument = (doc: string | null | undefined) => {
    if (!doc) return '-';
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

  // Calculate similarity between two strings (fuzzy matching)
  const calculateSimilarity = (str1: string, str2: string): number => {
    const s1 = normalizeText(str1);
    const s2 = normalizeText(str2);
    
    if (s1 === s2) return 1.0;
    if (!s1 || !s2) return 0;
    
    // If one contains the other, high similarity
    if (s1.includes(s2) || s2.includes(s1)) return 0.85;
    
    // Calculate word-based similarity
    const words1 = s1.split(' ').filter(w => w.length > 2);
    const words2 = s2.split(' ').filter(w => w.length > 2);
    
    if (words1.length === 0 || words2.length === 0) return 0;
    
    const commonWords = words1.filter(w => words2.some(w2 => w2.includes(w) || w.includes(w2)));
    return commonWords.length / Math.max(words1.length, words2.length);
  };

  // Intelligent matching function to link installments to existing contacts
  const matchInstallmentsToContacts = async (installments: ExtractedInstallment[]): Promise<ExtractedInstallment[]> => {
    const matchedInstallments: ExtractedInstallment[] = [];
    
    // Pre-fetch all contacts for fuzzy matching
    const { data: allContacts } = await supabase
      .from('contacts')
      .select('id, name, phone_number, cpf, cnpj')
      .not('name', 'is', null)
      .limit(1000);
    
    for (const inst of installments) {
      let matchStatus: ExtractedInstallment['matchStatus'] = 'new';
      let matchedContactId: string | undefined;
      let matchedContactName: string | undefined;
      
      const docClean = inst.insured_document?.replace(/\D/g, '') || '';
      
      // Priority 1a: Match by CPF
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
      }
      
      // Priority 1b: Match by CNPJ in contacts table
      if (!matchedContactId && docClean.length === 14) {
        const { data: contactByCnpj } = await supabase
          .from('contacts')
          .select('id, name')
          .eq('cnpj', docClean)
          .maybeSingle();
        
        if (contactByCnpj) {
          matchStatus = 'matched_document';
          matchedContactId = contactByCnpj.id;
          matchedContactName = contactByCnpj.name || undefined;
        }
        
        // If not found, try to find company and its billing contact
        if (!matchedContactId) {
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
      }
      
      // Priority 2: Match by phone DESABILITADO para parcelas
      // Telefones de relatórios de inadimplência são da corretora, não do segurado
      // Não usar para matching pois criaria associações incorretas
      
      // Priority 3: Match by name (exact match using pattern)
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
      
      // Priority 4: Fuzzy matching by name similarity
      if (!matchedContactId && inst.insured_name && allContacts && allContacts.length > 0) {
        let bestMatch: { contact: typeof allContacts[0]; score: number } | null = null;
        
        for (const contact of allContacts) {
          if (!contact.name) continue;
          const score = calculateSimilarity(inst.insured_name, contact.name);
          
          // Require higher similarity (80%) for fuzzy matching
          if (score >= 0.80 && (!bestMatch || score > bestMatch.score)) {
            bestMatch = { contact, score };
          }
        }
        
        if (bestMatch) {
          matchStatus = 'matched_similar';
          matchedContactId = bestMatch.contact.id;
          matchedContactName = bestMatch.contact.name || undefined;
        }
      }
      
      matchedInstallments.push({
        ...inst,
        matchStatus,
        matchedContactId,
        matchedContactName
      });
    }
    
    const matchedByDoc = matchedInstallments.filter(i => i.matchStatus === 'matched_document').length;
    const matchedByPhone = matchedInstallments.filter(i => i.matchStatus === 'matched_phone').length;
    const matchedByName = matchedInstallments.filter(i => i.matchStatus === 'matched_name').length;
    const matchedBySimilar = matchedInstallments.filter(i => i.matchStatus === 'matched_similar').length;
    const newCount = matchedInstallments.filter(i => i.matchStatus === 'new').length;
    
    const parts = [];
    if (matchedByDoc > 0) parts.push(`${matchedByDoc} por documento`);
    if (matchedByPhone > 0) parts.push(`${matchedByPhone} por telefone`);
    if (matchedByName > 0) parts.push(`${matchedByName} por nome`);
    if (matchedBySimilar > 0) parts.push(`${matchedBySimilar} similar(es)`);
    if (newCount > 0) parts.push(`${newCount} novo(s)`);
    
    if (parts.length > 0) {
      toast.info(`Segurados: ${parts.join(', ')}`);
    }
    
    return matchedInstallments;
  };

  // Helper function to extract CNPJ from concatenated fields like "PENDENTE_56703304000170"
  const extractCNPJFromField = (value: string): string | null => {
    if (!value) return null;
    const numbers = value.replace(/\D/g, '');
    // CNPJ has exactly 14 digits
    if (numbers.length === 14 && numbers !== '00000000000000' && /^\d{14}$/.test(numbers)) {
      return numbers;
    }
    return null;
  };

  // Helper function to detect if a name represents a company
  const detectCompanyName = (name: string): boolean => {
    if (!name) return false;
    const companyIndicators = [
      'LTDA', 'S/A', 'S.A.', 'ME', 'EPP', 'EIRELI', 
      'TRANSPORTES', 'TRANSPORTADORA', 'LOGISTICA', 'LOGÍSTICA',
      'INDUSTRIA', 'INDÚSTRIA', 'COMERCIO', 'COMÉRCIO', 'SERVICOS', 'SERVIÇOS',
      'DISTRIBUIDORA', 'ATACADISTA', 'VAREJISTA', 'IMPORTADORA', 'EXPORTADORA',
      'AGROPECUARIA', 'AGROPECUÁRIA', 'AGRICOLA', 'AGRÍCOLA', 'CONSTRUTORA',
      'ENGENHARIA', 'CONSULTORIA', 'ASSESSORIA', 'HOLDING', 'PARTICIPACOES',
      'PARTICIPAÇÕES', 'EMPREENDIMENTOS', 'INCORPORADORA'
    ];
    const upperName = name.toUpperCase();
    return companyIndicators.some(ind => upperName.includes(ind));
  };

  // Match installments to existing companies in the database
  const matchInstallmentsToCompanies = async (installments: ExtractedInstallment[]): Promise<ExtractedInstallment[]> => {
    const matchedInstallments: ExtractedInstallment[] = [];
    
    // Fetch all companies for matching
    const { data: companies } = await supabase
      .from('companies')
      .select('id, cnpj, razao_social, nome_fantasia');
    
    for (const inst of installments) {
      let companyMatchStatus: ExtractedInstallment['companyMatchStatus'] = 'not_company';
      let matchedCompanyId: string | undefined;
      let matchedCompanyName: string | undefined;
      
      // Check if this is a company (either marked by AI or detected by name)
      const isCompany = inst.insured_is_company || detectCompanyName(inst.insured_name);
      
      if (!isCompany) {
        matchedInstallments.push({
          ...inst,
          companyMatchStatus: 'not_company'
        });
        continue;
      }
      
      // Extract CNPJ from document field (may be concatenated like PENDENTE_56703304000170)
      const docClean = inst.insured_document?.replace(/\D/g, '') || '';
      const extractedCNPJ = docClean.length === 14 ? docClean : extractCNPJFromField(inst.insured_document || '');
      
      // Priority 1: Match by CNPJ (most reliable)
      if (extractedCNPJ) {
        const matchByCNPJ = companies?.find(c => c.cnpj === extractedCNPJ);
        if (matchByCNPJ) {
          companyMatchStatus = 'matched_cnpj';
          matchedCompanyId = matchByCNPJ.id;
          matchedCompanyName = matchByCNPJ.razao_social;
        }
      }
      
      // Priority 2: Match by name/razão social (exact)
      if (!matchedCompanyId && inst.insured_name) {
        const normalizedInsuredName = normalizeText(inst.insured_name);
        const normalizedCompanyName = inst.insured_company_name ? normalizeText(inst.insured_company_name) : null;
        
        const matchByName = companies?.find(c => {
          const normalizedRazao = normalizeText(c.razao_social);
          const normalizedFantasia = c.nome_fantasia ? normalizeText(c.nome_fantasia) : '';
          
          return normalizedRazao === normalizedInsuredName ||
                 normalizedRazao === normalizedCompanyName ||
                 (normalizedFantasia && normalizedFantasia === normalizedInsuredName) ||
                 (normalizedFantasia && normalizedFantasia === normalizedCompanyName);
        });
        
        if (matchByName) {
          companyMatchStatus = 'matched_name';
          matchedCompanyId = matchByName.id;
          matchedCompanyName = matchByName.razao_social;
        }
      }
      
      // Priority 3: Match by fuzzy name similarity
      if (!matchedCompanyId && inst.insured_name && companies && companies.length > 0) {
        let bestMatch: { company: typeof companies[0]; score: number } | null = null;
        
        for (const company of companies) {
          const scoreRazao = calculateSimilarity(inst.insured_name, company.razao_social);
          const scoreFantasia = company.nome_fantasia 
            ? calculateSimilarity(inst.insured_name, company.nome_fantasia) 
            : 0;
          
          const maxScore = Math.max(scoreRazao, scoreFantasia);
          
          // Require 75% similarity for company matching
          if (maxScore >= 0.75 && (!bestMatch || maxScore > bestMatch.score)) {
            bestMatch = { company, score: maxScore };
          }
        }
        
        if (bestMatch) {
          companyMatchStatus = 'matched_similar';
          matchedCompanyId = bestMatch.company.id;
          matchedCompanyName = bestMatch.company.razao_social;
        }
      }
      
      // No match found - it's a new company
      if (!matchedCompanyId) {
        companyMatchStatus = 'new_company';
      }
      
      matchedInstallments.push({
        ...inst,
        insured_is_company: true,
        insured_document: extractedCNPJ || inst.insured_document,
        companyMatchStatus,
        matchedCompanyId,
        matchedCompanyName
      });
    }
    
    // Show summary toast
    const matchedByCNPJ = matchedInstallments.filter(i => i.companyMatchStatus === 'matched_cnpj').length;
    const matchedByName = matchedInstallments.filter(i => i.companyMatchStatus === 'matched_name').length;
    const matchedBySimilar = matchedInstallments.filter(i => i.companyMatchStatus === 'matched_similar').length;
    const newCompanies = matchedInstallments.filter(i => i.companyMatchStatus === 'new_company').length;
    
    if (matchedByCNPJ > 0 || matchedByName > 0 || matchedBySimilar > 0 || newCompanies > 0) {
      const parts = [];
      if (matchedByCNPJ > 0) parts.push(`${matchedByCNPJ} por CNPJ`);
      if (matchedByName > 0) parts.push(`${matchedByName} por nome`);
      if (matchedBySimilar > 0) parts.push(`${matchedBySimilar} similar(es)`);
      if (newCompanies > 0) parts.push(`${newCompanies} nova(s)`);
      toast.info(`Empresas: ${parts.join(', ')}`);
    }
    
    return matchedInstallments;
  };

  // Check for duplicate installments in the database before import
  const checkDuplicatesInDatabase = async (installments: ExtractedInstallment[]): Promise<ExtractedInstallment[]> => {
    const checkedInstallments: ExtractedInstallment[] = [];
    
    // Group installments by policy_number + insurer for batch lookup
    const policyMap = new Map<string, ExtractedInstallment[]>();
    
    for (const inst of installments) {
      const key = `${inst.policy_number}|${inst.insurer || 'UNKNOWN'}`;
      if (!policyMap.has(key)) {
        policyMap.set(key, []);
      }
      policyMap.get(key)!.push(inst);
    }
    
    // Check each policy group
    for (const [key, policyInstallments] of policyMap) {
      const [policyNumber, insurer] = key.split('|');
      
      // Find policy in database
      const { data: existingPolicy } = await supabase
        .from('policies')
        .select('id')
        .eq('policy_number', policyNumber)
        .eq('insurer', insurer)
        .maybeSingle();
      
      if (!existingPolicy) {
        // Policy doesn't exist - all installments are new
        for (const inst of policyInstallments) {
          checkedInstallments.push({
            ...inst,
            duplicateStatus: 'new',
            selected: true // Select new installments by default
          });
        }
        continue;
      }
      
      // Policy exists - check each installment
      for (const inst of policyInstallments) {
        const installmentNumber = (
          inst.installment_number != null && 
          !isNaN(Number(inst.installment_number)) && 
          Number(inst.installment_number) > 0
        ) ? Math.floor(Number(inst.installment_number)) : 1;
        
        // Check if installment already exists with same key
        const { data: existingInstallment } = await supabase
          .from('installments')
          .select('id, value, status, due_date')
          .eq('policy_id', existingPolicy.id)
          .eq('installment_number', installmentNumber)
          .eq('due_date', inst.due_date)
          .maybeSingle();
        
        if (!existingInstallment) {
          // Installment doesn't exist - it's new
          checkedInstallments.push({
            ...inst,
            duplicateStatus: 'new',
            selected: true
          });
        } else {
          // Installment exists - check if it's exactly the same or has updates
          const expectedStatus = inst.status === 'VENCIDO' || inst.status === 'ATRASADO' ? 'overdue' : 'pending';
          const isSameValue = Math.abs(existingInstallment.value - inst.value) < 0.01;
          const isSameStatus = existingInstallment.status === expectedStatus;
          
          if (isSameValue && isSameStatus) {
            // Exact duplicate - deselect by default
            checkedInstallments.push({
              ...inst,
              duplicateStatus: 'duplicate',
              existingInstallmentId: existingInstallment.id,
              existingValue: existingInstallment.value,
              existingStatus: existingInstallment.status,
              existingDueDate: existingInstallment.due_date,
              selected: false // Deselect duplicates by default
            });
          } else {
            // Has updates available
            checkedInstallments.push({
              ...inst,
              duplicateStatus: 'update_available',
              existingInstallmentId: existingInstallment.id,
              existingValue: existingInstallment.value,
              existingStatus: existingInstallment.status,
              existingDueDate: existingInstallment.due_date,
              selected: true // Select for update
            });
          }
        }
      }
    }
    
    // Show summary toast
    const newCount = checkedInstallments.filter(i => i.duplicateStatus === 'new').length;
    const duplicateCount = checkedInstallments.filter(i => i.duplicateStatus === 'duplicate').length;
    const updateCount = checkedInstallments.filter(i => i.duplicateStatus === 'update_available').length;
    
    if (duplicateCount > 0 || updateCount > 0) {
      const parts = [];
      if (newCount > 0) parts.push(`${newCount} nova(s)`);
      if (duplicateCount > 0) parts.push(`${duplicateCount} já importada(s)`);
      if (updateCount > 0) parts.push(`${updateCount} com atualização`);
      toast.info(`Verificação: ${parts.join(', ')}`);
    }
    
    return checkedInstallments;
  };

  // Check for duplicate companies in the database before import
  const matchCompaniesToDatabase = async (companies: ExtractedCompany[]): Promise<ExtractedCompany[]> => {
    const checkedCompanies: ExtractedCompany[] = [];
    
    for (const company of companies) {
      const cnpjClean = company.cnpj.replace(/\D/g, '');
      
      // Skip if CNPJ is invalid
      if (cnpjClean.length !== 14 || cnpjClean === '00000000000000') {
        checkedCompanies.push({
          ...company,
          cnpj: cnpjClean,
          duplicateStatus: 'new',
          selected: true
        });
        continue;
      }
      
      // Search for existing company by CNPJ
      const { data: existing } = await supabase
        .from('companies')
        .select('id, razao_social, nome_fantasia, city, state')
        .eq('cnpj', cnpjClean)
        .maybeSingle();
      
      if (!existing) {
        // New company
        checkedCompanies.push({
          ...company,
          cnpj: cnpjClean,
          duplicateStatus: 'new',
          selected: true
        });
      } else {
        // CNPJ already exists - check for differences
        const hasNameChange = company.razao_social !== existing.razao_social;
        const hasFantasiaChange = (company.nome_fantasia || null) !== existing.nome_fantasia;
        const hasCityChange = (company.city || null) !== existing.city;
        const hasStateChange = (company.state || null) !== existing.state;
        
        // Check if new data fills empty fields
        const canFillEmpty = 
          (!existing.nome_fantasia && company.nome_fantasia) ||
          (!existing.city && company.city) ||
          (!existing.state && company.state);
        
        // Get counts of related records
        const { count: contactsCount } = await supabase
          .from('contacts')
          .select('*', { count: 'exact', head: true })
          .eq('company_id', existing.id);
        
        const { count: policiesCount } = await supabase
          .from('policies')
          .select('*', { count: 'exact', head: true })
          .eq('company_id', existing.id);
        
        const hasChanges = hasNameChange || hasFantasiaChange || hasCityChange || hasStateChange || canFillEmpty;
        
        checkedCompanies.push({
          ...company,
          cnpj: cnpjClean,
          duplicateStatus: hasChanges ? 'merge_available' : 'duplicate',
          existingCompanyId: existing.id,
          existingData: {
            razao_social: existing.razao_social,
            nome_fantasia: existing.nome_fantasia,
            city: existing.city,
            state: existing.state,
            contacts_count: contactsCount || 0,
            policies_count: policiesCount || 0
          },
          mergeStrategy: hasChanges ? 'merge' : 'ignore',
          selected: !!hasChanges // Select only if there are changes to merge
        });
      }
    }
    
    // Show summary toast
    const newCount = checkedCompanies.filter(c => c.duplicateStatus === 'new').length;
    const duplicateCount = checkedCompanies.filter(c => c.duplicateStatus === 'duplicate').length;
    const mergeCount = checkedCompanies.filter(c => c.duplicateStatus === 'merge_available').length;
    
    if (duplicateCount > 0 || mergeCount > 0) {
      const parts = [];
      if (newCount > 0) parts.push(`${newCount} nova(s)`);
      if (duplicateCount > 0) parts.push(`${duplicateCount} já cadastrada(s)`);
      if (mergeCount > 0) parts.push(`${mergeCount} com dados novos`);
      toast.info(`Empresas: ${parts.join(', ')}`);
    }
    
    return checkedCompanies;
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

  // Helper to get user-friendly error message
  const getErrorMessage = (error: any): string => {
    const errorStr = String(error?.message || error || '').toLowerCase();
    
    // Network/timeout errors
    if (errorStr.includes('failed to fetch') || errorStr.includes('networkerror') || errorStr.includes('network error')) {
      return 'Erro de conexão. O arquivo pode ser muito grande ou a rede está instável. Tente arquivos menores ou um de cada vez.';
    }
    if (errorStr.includes('timeout') || errorStr.includes('timed out')) {
      return 'Tempo limite excedido. Arquivo muito grande para processar. Tente arquivos menores.';
    }
    if (errorStr.includes('payload too large') || errorStr.includes('request entity too large')) {
      return 'Arquivo muito grande. O limite é 5MB para processamento com IA.';
    }
    if (errorStr.includes('rate limit') || errorStr.includes('429')) {
      return 'Limite de requisições atingido. Aguarde alguns segundos e tente novamente.';
    }
    if (errorStr.includes('payment') || errorStr.includes('402')) {
      return 'Créditos insuficientes. Adicione créditos para continuar.';
    }
    
    return error?.message || 'Erro ao processar documento';
  };

  // Process files in parallel (all at once) - NOT recommended for large/multiple files
  const processFilesParallel = async () => {
    // Update all files to processing
    setFiles(prev => prev.map(f => ({ ...f, status: 'processing' as const, progress: 10 })));

    try {
      // Check total size before processing - use conservative limit accounting for Base64 overhead
      const totalSize = files.reduce((sum, f) => sum + f.file.size, 0);
      const estimatedBase64Size = totalSize * 1.4; // Base64 adds ~33% overhead
      if (estimatedBase64Size > MAX_PARALLEL_SIZE) {
        throw new Error('Arquivos muito grandes para processamento paralelo. Ativando modo sequencial automaticamente.');
      }

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

      // Call edge function with timeout handling
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
      const friendlyError = getErrorMessage(error);
      setFiles(prev => prev.map(f => ({ 
        ...f, 
        status: 'error' as const, 
        error: friendlyError 
      })));
      throw new Error(friendlyError);
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
        const friendlyError = getErrorMessage(error);
        setFiles(prev => prev.map((pf, idx) => 
          idx === i ? { ...pf, status: 'error' as const, error: friendlyError } : pf
        ));
        
        // For network errors, pause briefly before continuing to avoid hammering the server
        if (friendlyError.includes('conexão') || friendlyError.includes('rede')) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
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
    
    // Create audit log
    const fileNames = files.map(f => f.file.name);
    const logId = await createAuditLog(fileNames);
    if (logId) {
      setAuditLogId(logId);
    }

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
        await updateAuditLog({ 
          status: 'error', 
          error_message: 'Todos os arquivos falharam no processamento' 
        });
        toast.error('Erro ao processar todos os documentos');
        setStep('upload');
        return;
      }

      // Process results
      let extractedCompanies: ExtractedCompany[] = (data.companies || []).map((c: any, i: number) => ({
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

      // Check if Excel files were uploaded but no installments extracted
      const hasExcelFiles = files.some(f => 
        f.file.name.toLowerCase().endsWith('.xls') || 
        f.file.name.toLowerCase().endsWith('.xlsx') ||
        f.file.type === 'application/vnd.ms-excel' ||
        f.file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );

      if (extractedCompanies.length === 0 && extractedContacts.length === 0 && extractedInstallments.length === 0) {
        if (hasExcelFiles) {
          toast.warning('Nenhuma parcela foi identificada nos arquivos Excel. Verifique se o layout da planilha está correto ou exporte como CSV.', {
            duration: 8000
          });
        } else {
          toast.warning('Nenhum dado foi identificado nos documentos');
        }
        setStep('upload');
        return;
      }

      // Warn if Excel files were uploaded but 0 installments extracted
      if (hasExcelFiles && extractedInstallments.length === 0 && (extractedCompanies.length > 0 || extractedContacts.length > 0)) {
        toast.warning('Empresas/contatos identificados, mas nenhuma parcela foi extraída dos arquivos Excel. Verifique o layout da planilha.', {
          duration: 6000
        });
      }

      // Run intelligent matching for installments
      if (extractedInstallments.length > 0) {
        toast.info('Vinculando parcelas a clientes existentes...');
        extractedInstallments = await matchInstallmentsToContacts(extractedInstallments);
        
        // Match installments to companies
        toast.info('Identificando empresas...');
        extractedInstallments = await matchInstallmentsToCompanies(extractedInstallments);
        
        // Check for duplicates in database
        toast.info('Verificando duplicatas no banco de dados...');
        extractedInstallments = await checkDuplicatesInDatabase(extractedInstallments);
      }

      // Check for duplicate companies in database
      if (extractedCompanies.length > 0) {
        toast.info('Verificando empresas duplicadas...');
        extractedCompanies = await matchCompaniesToDatabase(extractedCompanies);
      }

      setCompanies(extractedCompanies);
      setContacts(extractedContacts);
      setInstallments(extractedInstallments);
      
      if (data.insurer_detected) {
        setInsurerDetected(data.insurer_detected);
      }
      
      setStep('review');
      
      // Update audit log with extraction results
      await updateAuditLog({
        status: 'extracted',
        extracted_companies: extractedCompanies.length,
        extracted_contacts: extractedContacts.length,
        extracted_installments: extractedInstallments.length,
        extraction_errors: files.filter(f => f.status === 'error').map(f => ({ 
          file: f.file.name, 
          error: f.error 
        }))
      });

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
      await updateAuditLog({ 
        status: 'error', 
        error_message: error.message || 'Erro ao processar documentos' 
      });
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
        
        // Skip if it's a duplicate and strategy is ignore
        if (company.duplicateStatus === 'duplicate' && company.mergeStrategy === 'ignore') {
          if (company.existingCompanyId) {
            companyIdMap.set(company.cnpj, company.existingCompanyId);
          }
          setImportProgress({ current: i + 1, total });
          continue;
        }
        
        // Handle merge strategy
        if (company.duplicateStatus === 'merge_available' && company.mergeStrategy === 'merge' && company.existingCompanyId) {
          // Merge - only fill empty fields in existing record
          const updates: Record<string, any> = {};
          if (company.nome_fantasia && !company.existingData?.nome_fantasia) {
            updates.nome_fantasia = company.nome_fantasia;
          }
          if (company.city && !company.existingData?.city) {
            updates.city = company.city;
          }
          if (company.state && !company.existingData?.state) {
            updates.state = company.state;
          }
          if (company.cep) updates.cep = company.cep;
          if (company.street) updates.street = company.street;
          if (company.number) updates.number = company.number;
          if (company.neighborhood) updates.neighborhood = company.neighborhood;
          
          if (Object.keys(updates).length > 0) {
            const { error } = await supabase
              .from('companies')
              .update(updates)
              .eq('id', company.existingCompanyId);
            
            if (error) {
              console.error('Error merging company:', error);
              toast.error(`Erro ao mesclar ${company.razao_social}`);
            }
          }
          
          companyIdMap.set(company.cnpj, company.existingCompanyId);
          setImportProgress({ current: i + 1, total });
          continue;
        }
        
        // Upsert (new or replace strategy)
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
      
      // Counters for accurate tracking
      let successfulInstallments = 0;
      let updatedInstallments = 0;
      let skippedDuplicates = 0;
      let failedInstallments = 0;
      const importErrors: Array<{ type: string; data: any; error: string }> = [];
      
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
          
          // CORREÇÃO: Criar empresa ANTES do contato para poder vincular
          const docClean = inst.insured_document?.replace(/\D/g, '') || '';
          const isCompanyDocument = docClean.length === 14;
          
          // Helper para detectar nome de empresa
          const detectCompanyName = (name: string | null): boolean => {
            if (!name) return false;
            const upperName = name.toUpperCase();
            const companyIndicators = ['LTDA', 'S/A', 'S.A.', ' SA ', ' ME', 'EIRELI', 'EPP', 'TRANSPORTES', 'TRANSPORTE', 'LOGISTICA', 'LOGÍSTICA', 'COMERCIO', 'COMÉRCIO', 'INDUSTRIA', 'INDÚSTRIA', 'SERVICOS', 'SERVIÇOS', 'DISTRIBUIDORA', 'ATACADO', 'METALURGICA', 'METALÚRGICA', 'CONSTRUTORA', 'ENGENHARIA', 'LOCADORA', 'AGROPECUARIA', 'AGROPECUÁRIA'];
            return companyIndicators.some(ind => upperName.includes(ind));
          };
          
          const isCompany = isCompanyDocument || detectCompanyName(inst.insured_name);
          
          // 1. PRIMEIRO: Buscar ou criar empresa (se for CNPJ ou nome de empresa)
          let companyId: string | null = inst.matchedCompanyId || null;
          
          if (!companyId && (isCompanyDocument || isCompany)) {
            if (isCompanyDocument) {
              // Check if company exists by CNPJ
              const { data: existingCompany } = await supabase
                .from('companies')
                .select('id')
                .eq('cnpj', docClean)
                .maybeSingle();
              
              if (existingCompany) {
                companyId = existingCompany.id;
              } else {
                // Check for similar company by name before creating
                if (inst.insured_name) {
                  const { data: similarCompanies } = await supabase
                    .from('companies')
                    .select('id, razao_social, cnpj')
                    .limit(20);
                  
                  const matchedSimilar = similarCompanies?.find(c => 
                    calculateSimilarity(inst.insured_name, c.razao_social) >= 0.75
                  );
                  
                  if (matchedSimilar) {
                    companyId = matchedSimilar.id;
                    // Update CNPJ if it was null
                    if (!matchedSimilar.cnpj) {
                      await supabase
                        .from('companies')
                        .update({ cnpj: docClean })
                        .eq('id', matchedSimilar.id);
                    }
                  }
                }
                
                // Create new company only if no match found
                if (!companyId) {
                  const { data: newCompany } = await supabase
                    .from('companies')
                    .insert({
                      cnpj: docClean,
                      razao_social: inst.insured_name
                    })
                    .select('id')
                    .single();
                  
                  if (newCompany) {
                    companyId = newCompany.id;
                  }
                }
              }
            } else if (isCompany && inst.insured_name) {
              // Nome de empresa sem CNPJ - buscar por nome similar
              const { data: similarCompanies } = await supabase
                .from('companies')
                .select('id, razao_social')
                .limit(50);
              
              const matchedSimilar = similarCompanies?.find(c => 
                calculateSimilarity(inst.insured_name!, c.razao_social) >= 0.8
              );
              
              if (matchedSimilar) {
                companyId = matchedSimilar.id;
              } else {
                // Criar empresa sem CNPJ (apenas com nome)
                const { data: newCompany } = await supabase
                  .from('companies')
                  .insert({
                    cnpj: `PENDENTE_${Date.now()}`, // CNPJ pendente
                    razao_social: inst.insured_name
                  })
                  .select('id')
                  .single();
                
                if (newCompany) {
                  companyId = newCompany.id;
                }
              }
            }
          }
          
          // 2. DEPOIS: Criar contato já vinculado à empresa
          if (!contactId) {
            // Sempre criar com telefone pendente - telefones do arquivo são da corretora
            const phoneNumber = docClean ? `PENDENTE_${docClean}` : `PENDENTE_${Date.now()}`;
            
            const { data: newContact } = await supabase
              .from('contacts')
              .upsert({
                phone_number: phoneNumber,
                name: inst.insured_name,
                email: inst.insured_email || null,
                cpf: docClean.length === 11 ? docClean : null,
                cnpj: docClean.length === 14 ? docClean : null,
                company_id: companyId, // ✅ VINCULAR À EMPRESA
                is_billing_contact: true,
                lead_source: 'import_cobranca',
                tags: ['telefone_pendente']
              }, { onConflict: 'phone_number' })
              .select('id')
              .single();
            
            if (newContact) {
              contactId = newContact.id;
              // Se o contato já existia (upsert), atualizar o company_id
              if (companyId) {
                await supabase
                  .from('contacts')
                  .update({ company_id: companyId })
                  .eq('id', contactId)
                  .is('company_id', null);
              }
            }
          } else if (companyId) {
            // Contato já existia, vincular à empresa se ainda não estiver
            await supabase
              .from('contacts')
              .update({ company_id: companyId })
              .eq('id', contactId)
              .is('company_id', null);
          }
          
          // Find or create policy
          let policyId = policyIdMap.get(inst.policy_number);
          
          if (!policyId) {
            // Fallback para insurer quando vier null da IA
            const insurerValue = inst.insurer || 'NÃO IDENTIFICADA';
            
            const { data: existingPolicy } = await supabase
              .from('policies')
              .select('id')
              .eq('policy_number', inst.policy_number)
              .eq('insurer', insurerValue)
              .maybeSingle();
            
            if (existingPolicy) {
              policyId = existingPolicy.id;
              // Atualizar company_id se estava NULL e agora temos
              if (companyId) {
                await supabase
                  .from('policies')
                  .update({ company_id: companyId })
                  .eq('id', policyId)
                  .is('company_id', null);
              }
            } else {
              const { data: newPolicy, error: policyError } = await supabase
                .from('policies')
                .insert({
                  policy_number: inst.policy_number,
                  insurer: insurerValue,
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
          
          // CRITICAL FIX: Validate installment_number before inserting
          // Fallback to 1 if null/undefined/invalid to prevent NOT-NULL constraint violation
          const installmentNumber = (
            inst.installment_number != null && 
            !isNaN(Number(inst.installment_number)) && 
            Number(inst.installment_number) > 0
          ) ? Math.floor(Number(inst.installment_number)) : 1;
          
          // Validate value - skip if invalid
          if (!inst.value || inst.value <= 0) {
            console.error('Skipping installment with invalid value:', inst.policy_number, 'value:', inst.value);
            importErrors.push({
              type: 'installment',
              data: inst,
              error: 'Valor inválido ou ausente'
            });
            failedInstallments++;
            continue;
          }
          
          // Create installment - Use existingInstallmentId from duplicate check if available
          if (policyId) {
            // Use pre-detected existingInstallmentId to avoid redundant query
            const existingInstId = inst.existingInstallmentId;
            
            const installmentData = {
              policy_id: policyId,
              contact_id: contactId,
              installment_number: installmentNumber,
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
            };
            
            if (existingInstId) {
              // Update existing installment
              const { error: updateError } = await supabase
                .from('installments')
                .update(installmentData)
                .eq('id', existingInstId);
              
              if (updateError) {
                console.error('Error updating installment:', updateError);
                importErrors.push({
                  type: 'installment',
                  data: inst,
                  error: updateError.message
                });
                failedInstallments++;
              } else {
                updatedInstallments++;
              }
            } else {
              // Insert new installment
              const { error: insertError } = await supabase
                .from('installments')
                .insert(installmentData);
              
              if (insertError) {
                console.error('Error creating installment:', insertError);
                importErrors.push({
                  type: 'installment',
                  data: inst,
                  error: insertError.message
                });
                failedInstallments++;
              } else {
                successfulInstallments++;
              }
            }
          } else {
            console.error('Skipping installment without policyId:', inst.policy_number);
            importErrors.push({
              type: 'installment',
              data: inst,
              error: 'Falha ao criar apólice'
            });
            failedInstallments++;
          }
        } catch (err) {
          console.error('Error importing installment:', err);
          importErrors.push({
            type: 'installment',
            data: inst,
            error: err instanceof Error ? err.message : 'Erro desconhecido'
          });
          failedInstallments++;
        }

        setImportProgress({ current: selectedCompanies.length + selectedContacts.length + i + 1, total });
      }

      // Build summary with ACTUAL counts (not just selection counts)
      const summary = [];
      if (selectedCompanies.length > 0) summary.push(`${selectedCompanies.length} empresas`);
      if (selectedContacts.length > 0) summary.push(`${selectedContacts.length} contatos`);
      
      // Use actual counts for installments
      if (successfulInstallments > 0) {
        summary.push(`${successfulInstallments} novas parcelas`);
      }
      if (updatedInstallments > 0) {
        summary.push(`${updatedInstallments} atualizadas`);
      }
      
      // Log import errors for debugging
      if (importErrors.length > 0) {
        console.error('Import errors summary:', importErrors);
      }
      
      // Update audit log with REAL import counts
      await updateAuditLog({
        status: failedInstallments > 0 && successfulInstallments === 0 && updatedInstallments === 0 ? 'partial_error' : 'completed',
        imported_companies: selectedCompanies.length,
        imported_contacts: selectedContacts.length,
        imported_installments: successfulInstallments + updatedInstallments,
        extraction_errors: importErrors.length > 0 ? importErrors.slice(0, 20) : null // Store first 20 errors
      });
      
      // Clear pending data since import is complete
      clearPendingData();
      
      // Show appropriate toast based on results
      const totalSuccess = successfulInstallments + updatedInstallments;
      if (failedInstallments > 0 && totalSuccess > 0) {
        toast.warning(`Importação parcial: ${totalSuccess} parcelas OK, ${failedInstallments} com erro`, {
          description: updatedInstallments > 0 ? `${updatedInstallments} foram atualizadas` : undefined
        });
      } else if (failedInstallments > 0 && totalSuccess === 0) {
        toast.error(`Falha na importação: ${failedInstallments} parcelas com erro`, {
          description: 'Nenhuma parcela foi importada. Verifique os dados.'
        });
      } else {
        toast.success(`Importação concluída! ${summary.join(', ')}`);
      }
      
      onSuccess();
      // Close modal and navigate to installments automatically
      resetState();
      onOpenChange(false);
      onGoToInstallments?.();

    } catch (error) {
      console.error('Error during import:', error);
      await updateAuditLog({ 
        status: 'error', 
        error_message: error instanceof Error ? error.message : 'Erro durante a importação' 
      });
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
      case 'matched_similar':
        return (
          <Badge className="bg-cyan-500/20 text-cyan-400 text-xs whitespace-nowrap" title={`Similar a: ${matchedName}`}>
            <AlertCircle className="w-3 h-3 mr-1" />
            Similar
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

  // Get duplicate status badge
  const getDuplicateStatusBadge = (duplicateStatus?: string, existingValue?: number, existingStatus?: string) => {
    switch (duplicateStatus) {
      case 'new':
        return (
          <Badge className="bg-emerald-500/20 text-emerald-400 text-xs whitespace-nowrap">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Nova
          </Badge>
        );
      case 'duplicate':
        return (
          <Badge className="bg-yellow-500/20 text-yellow-400 text-xs whitespace-nowrap" title={`Valor: R$ ${existingValue?.toFixed(2)}, Status: ${existingStatus}`}>
            <AlertCircle className="w-3 h-3 mr-1" />
            Já importada
          </Badge>
        );
      case 'update_available':
        return (
          <Badge className="bg-blue-500/20 text-blue-400 text-xs whitespace-nowrap" title={`Valor anterior: R$ ${existingValue?.toFixed(2)}, Status anterior: ${existingStatus}`}>
            <RefreshCw className="w-3 h-3 mr-1" />
            Atualizar
          </Badge>
        );
      default:
        return null;
    }
  };

  // Get company match status badge
  const getCompanyMatchBadge = (status?: ExtractedInstallment['companyMatchStatus'], matchedName?: string) => {
    switch (status) {
      case 'matched_cnpj':
        return (
          <Badge className="bg-emerald-500/20 text-emerald-400 text-xs whitespace-nowrap" title={`Empresa: ${matchedName}`}>
            <Building2 className="w-3 h-3 mr-1" />
            CNPJ
          </Badge>
        );
      case 'matched_name':
        return (
          <Badge className="bg-amber-500/20 text-amber-400 text-xs whitespace-nowrap" title={`Empresa: ${matchedName}`}>
            <Building2 className="w-3 h-3 mr-1" />
            Nome
          </Badge>
        );
      case 'matched_similar':
        return (
          <Badge className="bg-cyan-500/20 text-cyan-400 text-xs whitespace-nowrap" title={`Empresa similar: ${matchedName}`}>
            <Building2 className="w-3 h-3 mr-1" />
            Similar
          </Badge>
        );
      case 'new_company':
        return (
          <Badge className="bg-purple-500/20 text-purple-400 text-xs whitespace-nowrap">
            <Building2 className="w-3 h-3 mr-1" />
            Nova
          </Badge>
        );
      default:
        return null;
    }
  };

  // Calculate installments summary
  const selectedInstallmentsTotal = installments
    .filter(inst => inst.selected)
    .reduce((sum, inst) => sum + inst.value, 0);
  
  // Calculate duplicate statistics
  const duplicateStats = {
    new: installments.filter(i => i.duplicateStatus === 'new').length,
    duplicate: installments.filter(i => i.duplicateStatus === 'duplicate').length,
    update_available: installments.filter(i => i.duplicateStatus === 'update_available').length
  };
  
  // Calculate company statistics (from installments matching)
  const companyStats = {
    matched_cnpj: installments.filter(i => i.companyMatchStatus === 'matched_cnpj').length,
    matched_name: installments.filter(i => i.companyMatchStatus === 'matched_name').length,
    matched_similar: installments.filter(i => i.companyMatchStatus === 'matched_similar').length,
    new_company: installments.filter(i => i.companyMatchStatus === 'new_company').length
  };
  
  // Calculate extracted companies duplicate statistics
  const companyDuplicateStats = {
    new: companies.filter(c => c.duplicateStatus === 'new').length,
    duplicate: companies.filter(c => c.duplicateStatus === 'duplicate').length,
    merge_available: companies.filter(c => c.duplicateStatus === 'merge_available').length
  };
  
  // Calculate contact statistics
  const contactStats = {
    matched_document: installments.filter(i => i.matchStatus === 'matched_document').length,
    matched_phone: installments.filter(i => i.matchStatus === 'matched_phone').length,
    matched_name: installments.filter(i => i.matchStatus === 'matched_name').length,
    matched_similar: installments.filter(i => i.matchStatus === 'matched_similar').length,
    new: installments.filter(i => i.matchStatus === 'new').length
  };

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
        {step !== 'done' && (
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
        )}

        <ScrollArea className="max-h-[60vh]">
          {/* Upload Step */}
          {step === 'upload' && (
            <div className="space-y-4">
              {/* Pending Data Recovery Banner */}
              {hasPendingData && (
                <div className="p-4 rounded-lg bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border border-blue-500/20">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-500/20">
                      <History className="w-5 h-5 text-blue-400" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-blue-200">Dados pendentes encontrados</p>
                      <p className="text-sm text-slate-400">
                        Você tem uma importação não finalizada. Deseja recuperar os dados?
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={clearPendingData}
                        className="border-slate-600"
                      >
                        Descartar
                      </Button>
                      <Button 
                        size="sm" 
                        onClick={loadPendingData}
                        className="bg-blue-600 hover:bg-blue-700 gap-2"
                      >
                        <History className="w-4 h-4" />
                        Recuperar
                      </Button>
                    </div>
                  </div>
                </div>
              )}
              
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
                    ? (files.some(f => f.file.type === 'text/csv' && f.file.size > LARGE_FILE_THRESHOLD)
                      ? 'CSV grande: o backend processa em partes para evitar timeout'
                      : 'Modo sequencial: cada arquivo é processado individualmente')
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
              
              {/* Contact Statistics */}
              {installments.length > 0 && (contactStats.matched_document > 0 || contactStats.matched_phone > 0 || contactStats.matched_similar > 0 || contactStats.new > 0) && (
                <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                  <User className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm text-slate-300">
                    <span className="font-medium">Segurados:</span>
                    {contactStats.matched_document > 0 && (
                      <span className="text-emerald-400 ml-2">{contactStats.matched_document} por CPF/CNPJ</span>
                    )}
                    {contactStats.matched_phone > 0 && (
                      <span className="text-blue-400 ml-2">{contactStats.matched_phone} por telefone</span>
                    )}
                    {contactStats.matched_name > 0 && (
                      <span className="text-amber-400 ml-2">{contactStats.matched_name} por nome</span>
                    )}
                    {contactStats.matched_similar > 0 && (
                      <span className="text-cyan-400 ml-2">{contactStats.matched_similar} similar(es)</span>
                    )}
                    {contactStats.new > 0 && (
                      <span className="text-purple-400 ml-2">{contactStats.new} novo(s)</span>
                    )}
                  </span>
                </div>
              )}
              
              {/* Company Statistics */}
              {installments.length > 0 && (companyStats.matched_cnpj > 0 || companyStats.matched_name > 0 || companyStats.matched_similar > 0 || companyStats.new_company > 0) && (
                <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                  <Building2 className="w-4 h-4 text-blue-400" />
                  <span className="text-sm text-slate-300">
                    <span className="font-medium">Empresas:</span>
                    {companyStats.matched_cnpj > 0 && (
                      <span className="text-emerald-400 ml-2">{companyStats.matched_cnpj} por CNPJ</span>
                    )}
                    {companyStats.matched_name > 0 && (
                      <span className="text-amber-400 ml-2">{companyStats.matched_name} por nome</span>
                    )}
                    {companyStats.matched_similar > 0 && (
                      <span className="text-cyan-400 ml-2">{companyStats.matched_similar} similar(es)</span>
                    )}
                    {companyStats.new_company > 0 && (
                      <span className="text-purple-400 ml-2">{companyStats.new_company} nova(s)</span>
                    )}
                  </span>
                </div>
              )}

              {/* Duplicate Statistics */}
              {installments.length > 0 && (duplicateStats.duplicate > 0 || duplicateStats.update_available > 0) && (
                <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                  <AlertCircle className="w-4 h-4 text-amber-400" />
                  <span className="text-sm text-slate-300">
                    {duplicateStats.new > 0 && (
                      <span className="text-emerald-400 font-medium">{duplicateStats.new} nova(s)</span>
                    )}
                    {duplicateStats.new > 0 && (duplicateStats.duplicate > 0 || duplicateStats.update_available > 0) && ' • '}
                    {duplicateStats.duplicate > 0 && (
                      <span className="text-yellow-400">{duplicateStats.duplicate} já importada(s)</span>
                    )}
                    {duplicateStats.duplicate > 0 && duplicateStats.update_available > 0 && ' • '}
                    {duplicateStats.update_available > 0 && (
                      <span className="text-blue-400">{duplicateStats.update_available} com atualização</span>
                    )}
                  </span>
                  {duplicateStats.duplicate > 0 && (
                    <span className="text-xs text-slate-500 ml-auto">
                      Duplicatas desmarcadas automaticamente
                    </span>
                  )}
                </div>
              )}

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
                          <TableHead>Empresa</TableHead>
                          <TableHead>Banco</TableHead>
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
                            className={`${!inst.selected ? 'opacity-50' : ''} ${inst.duplicateStatus === 'duplicate' ? 'bg-yellow-500/5' : ''} hover:bg-slate-800/30`}
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
                            <TableCell>
                              {getCompanyMatchBadge(inst.companyMatchStatus, inst.matchedCompanyName)}
                            </TableCell>
                            <TableCell>
                              {getDuplicateStatusBadge(inst.duplicateStatus, inst.existingValue, inst.existingStatus)}
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
                              {inst.duplicateStatus === 'update_available' && inst.existingValue && (
                                <div className="text-xs text-slate-500 line-through">
                                  {formatCurrency(inst.existingValue)}
                                </div>
                              )}
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
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-slate-300 flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-blue-400" />
                      Empresas Encontradas
                    </h4>
                    {(companyDuplicateStats.duplicate > 0 || companyDuplicateStats.merge_available > 0) && (
                      <div className="flex items-center gap-2 text-xs">
                        {companyDuplicateStats.new > 0 && (
                          <span className="text-emerald-400">{companyDuplicateStats.new} nova(s)</span>
                        )}
                        {companyDuplicateStats.duplicate > 0 && (
                          <span className="text-yellow-400">{companyDuplicateStats.duplicate} já cadastrada(s)</span>
                        )}
                        {companyDuplicateStats.merge_available > 0 && (
                          <span className="text-blue-400">{companyDuplicateStats.merge_available} com dados novos</span>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {companies.map((company) => (
                    <Card key={company.id} className={`p-4 bg-slate-800/50 border-slate-700 ${!company.selected ? 'opacity-50' : ''} ${company.duplicateStatus === 'duplicate' ? 'border-yellow-500/30' : company.duplicateStatus === 'merge_available' ? 'border-blue-500/30' : ''}`}>
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={company.selected}
                          onCheckedChange={(checked) => updateCompany(company.id, { selected: !!checked })}
                          disabled={company.duplicateStatus === 'duplicate' && company.mergeStrategy === 'ignore'}
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
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-slate-200">{company.razao_social}</span>
                                {company.nome_fantasia && (
                                  <span className="text-sm text-slate-500">({company.nome_fantasia})</span>
                                )}
                                {/* Duplicate status badge */}
                                {company.duplicateStatus === 'new' && (
                                  <Badge className="bg-emerald-500/20 text-emerald-400 text-xs">
                                    <CheckCircle2 className="w-3 h-3 mr-1" />
                                    Nova
                                  </Badge>
                                )}
                                {company.duplicateStatus === 'duplicate' && (
                                  <Badge className="bg-yellow-500/20 text-yellow-400 text-xs">
                                    <AlertCircle className="w-3 h-3 mr-1" />
                                    Já cadastrada
                                  </Badge>
                                )}
                                {company.duplicateStatus === 'merge_available' && (
                                  <Badge className="bg-blue-500/20 text-blue-400 text-xs">
                                    <RefreshCw className="w-3 h-3 mr-1" />
                                    Atualizar
                                  </Badge>
                                )}
                                {getConfidenceBadge(company.confidence)}
                              </div>
                              <p className="text-sm text-slate-400">
                                CNPJ: {formatCNPJ(company.cnpj)}
                                {company.city && ` • ${company.city}`}
                                {company.state && `/${company.state}`}
                              </p>
                              
                              {/* Show existing data for duplicates/merge */}
                              {company.existingData && (company.duplicateStatus === 'duplicate' || company.duplicateStatus === 'merge_available') && (
                                <div className="mt-2 p-2 bg-slate-900/50 rounded-md border border-slate-700">
                                  <p className="text-xs text-slate-500 mb-1">
                                    Cadastro atual: {company.existingData.razao_social}
                                    {company.existingData.nome_fantasia && ` (${company.existingData.nome_fantasia})`}
                                    {company.existingData.city && ` • ${company.existingData.city}`}
                                    {company.existingData.state && `/${company.existingData.state}`}
                                  </p>
                                  <p className="text-xs text-slate-600">
                                    {company.existingData.contacts_count} contato(s), {company.existingData.policies_count} apólice(s)
                                  </p>
                                  
                                  {/* Merge strategy options */}
                                  {company.duplicateStatus === 'merge_available' && (
                                    <div className="flex items-center gap-2 mt-2">
                                      <span className="text-xs text-slate-400">Ação:</span>
                                      <Button
                                        variant={company.mergeStrategy === 'merge' ? 'default' : 'outline'}
                                        size="sm"
                                        className={`h-6 text-xs ${company.mergeStrategy === 'merge' ? 'bg-blue-600 hover:bg-blue-700' : ''}`}
                                        onClick={() => updateCompany(company.id, { mergeStrategy: 'merge', selected: true })}
                                      >
                                        <GitMerge className="w-3 h-3 mr-1" />
                                        Mesclar
                                      </Button>
                                      <Button
                                        variant={company.mergeStrategy === 'replace' ? 'default' : 'outline'}
                                        size="sm"
                                        className={`h-6 text-xs ${company.mergeStrategy === 'replace' ? 'bg-amber-600 hover:bg-amber-700' : ''}`}
                                        onClick={() => updateCompany(company.id, { mergeStrategy: 'replace', selected: true })}
                                      >
                                        <Replace className="w-3 h-3 mr-1" />
                                        Substituir
                                      </Button>
                                      <Button
                                        variant={company.mergeStrategy === 'ignore' ? 'default' : 'outline'}
                                        size="sm"
                                        className={`h-6 text-xs ${company.mergeStrategy === 'ignore' ? 'bg-slate-600 hover:bg-slate-700' : ''}`}
                                        onClick={() => updateCompany(company.id, { mergeStrategy: 'ignore', selected: false })}
                                      >
                                        <Ban className="w-3 h-3 mr-1" />
                                        Ignorar
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              )}
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

          {/* Done Step */}
          {step === 'done' && (
            <div className="space-y-6 py-8">
              <div className="text-center">
                <CheckCircle2 className="w-16 h-16 mx-auto text-emerald-400 mb-4" />
                <h3 className="text-xl font-semibold text-slate-200">
                  Importação Concluída!
                </h3>
                <p className="text-slate-400 mt-2">
                  {importProgress.total} registros importados com sucesso
                </p>
              </div>

              {/* Next Step CTA */}
              {onGoToInstallments && (
                <div className="p-4 rounded-lg bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 rounded-lg bg-amber-500/20">
                      <FileSpreadsheet className="w-5 h-5 text-amber-400" />
                    </div>
                    <div>
                      <p className="font-medium text-amber-200">Próximo Passo: Revisar Parcelas</p>
                      <p className="text-sm text-slate-400">
                        Selecione as parcelas que deseja cobrar e gere emails com IA
                      </p>
                    </div>
                  </div>
                  <Button 
                    onClick={() => {
                      handleClose();
                      onGoToInstallments();
                    }}
                    className="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 gap-2"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    Ver Parcelas Importadas
                    <ArrowRight className="w-4 h-4 ml-auto" />
                  </Button>
                </div>
              )}

              <div className="flex justify-center gap-3">
                <Button variant="outline" onClick={handleClose} className="border-white/20">
                  Fechar
                </Button>
              </div>
            </div>
          )}
        </ScrollArea>

        {/* Footer Actions - Outside ScrollArea for visibility */}
        {step === 'review' && (
          <div className="border-t border-slate-700 pt-4 mt-2">
            <p className="text-sm text-slate-400 mb-3 text-center">
              ✓ Revise os dados acima e clique em <span className="text-emerald-400 font-medium">Importar Selecionados</span> para finalizar
            </p>
            <div className="flex justify-end gap-2">
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
                Importar Selecionados ({
                  companies.filter(c => c.selected).length + 
                  contacts.filter(c => c.selected).length + 
                  installments.filter(i => i.selected).length
                } itens)
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
      
      {/* Close Confirmation Dialog */}
      <AlertDialog open={showCloseConfirm} onOpenChange={setShowCloseConfirm}>
        <AlertDialogContent className="bg-slate-900 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              Descartar dados extraídos?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Você tem {installments.length} parcelas, {companies.length} empresas e {contacts.length} contatos 
              prontos para importar. O que deseja fazer?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel 
              onClick={() => setShowCloseConfirm(false)}
              className="border-slate-600"
            >
              Voltar
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => confirmClose(false)}
              className="bg-red-600 hover:bg-red-700"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Descartar
            </AlertDialogAction>
            <AlertDialogAction 
              onClick={() => confirmClose(true)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Save className="w-4 h-4 mr-2" />
              Salvar para depois
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
};
