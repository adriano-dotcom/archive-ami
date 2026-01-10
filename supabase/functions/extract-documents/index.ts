import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExtractedCompany {
  cnpj: string;
  razao_social: string;
  nome_fantasia?: string;
  city?: string;
  state?: string;
  cep?: string;
  street?: string;
  number?: string;
  neighborhood?: string;
  confidence: number;
}

interface ExtractedContact {
  name: string;
  phone: string;
  email?: string;
  cpf?: string;
  role?: string;
  company_cnpj?: string;
  is_billing_contact: boolean;
  confidence: number;
}

interface ExtractedInstallment {
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
  branch?: string;
  product?: string;
  status: string;
  days_overdue?: number;
  commission?: number;
  source?: string;
  confidence: number;
}

interface ExtractionResult {
  insurer_detected?: string;
  companies: ExtractedCompany[];
  contacts: ExtractedContact[];
  installments: ExtractedInstallment[];
  raw_text?: string;
}

// Generic extraction prompt for company/contact documents
const EXTRACTION_PROMPT = `Você é um especialista em extração de dados de documentos empresariais brasileiros.
Analise o conteúdo fornecido e extraia TODAS as informações de empresas e contatos/pessoas que encontrar.

REGRAS IMPORTANTES:
1. Extraia CNPJ no formato numérico (apenas números, 14 dígitos)
2. Extraia telefones no formato numérico (apenas números, 10-11 dígitos com DDD)
3. CPF no formato numérico (apenas números, 11 dígitos)
4. Identifique se um contato é de cobrança/financeiro pelo contexto (cargo, setor mencionado)
5. Tente associar cada contato à empresa correspondente pelo CNPJ quando possível
6. Atribua um valor de confiança (0-100) para cada extração

Retorne APENAS um JSON válido no formato:
{
  "companies": [
    {
      "cnpj": "12345678000190",
      "razao_social": "Nome da Empresa Ltda",
      "nome_fantasia": "Nome Fantasia",
      "city": "Cidade",
      "state": "UF",
      "cep": "00000000",
      "street": "Rua",
      "number": "123",
      "neighborhood": "Bairro",
      "confidence": 95
    }
  ],
  "contacts": [
    {
      "name": "Nome Completo",
      "phone": "43999998888",
      "email": "email@exemplo.com",
      "cpf": "12345678900",
      "role": "Gerente Financeiro",
      "company_cnpj": "12345678000190",
      "is_billing_contact": true,
      "confidence": 90
    }
  ],
  "installments": []
}

Se não encontrar dados, retorne {"companies": [], "contacts": [], "installments": []}.
NÃO inclua explicações, apenas o JSON.`;

// Specialized prompt for insurance delinquency reports
const INSURANCE_EXTRACTION_PROMPT = `Você é um especialista em processamento de relatórios de inadimplência de seguradoras brasileiras.
Analise o documento e extraia TODAS as parcelas pendentes/inadimplentes.

EXTRAÇÃO DE DADOS DE CONTATO (MUITO IMPORTANTE):
- Sempre tente extrair o TELEFONE do segurado/cliente quando disponível no documento
- Procure por padrões como: (XX) XXXXX-XXXX, XX XXXXX-XXXX, 11999998888, etc.
- Extraia EMAIL se disponível: procure por padrões user@domain.com
- Se o telefone ou email estiver em qualquer lugar do documento associado ao segurado, extraia-o

SEGURADORAS CONHECIDAS E SEUS FORMATOS:

1. AKAD Digital: 
   - Campos: PRODUTO, N° APOLICE, SEGURADO, CPF/CNPJ, VALOR DA PARCELA, DIAS EM ATRASO, SITUAÇÃO
   - Arquivo geralmente tem "AkadDigital" ou "Inadimplentes" no nome

2. Allianz:
   - Campos: RECIBO, APOLICE, SEGURADO, CPF_CNPJ, PREMIO_TOTAL, VENCIMENTO, DT_PREV_CANC, POL_SUSEP
   - Separador: ponto-e-vírgula (;)
   - Arquivo geralmente tem "gerarArquivoServlet" no nome

3. Tokio Marine:
   - Campos: RECIBO, NOME_DO_SEGURADO, CPF_CNPJ, PREMIO_LIQ_ATUAL, VENCIMENTO, DT_PREV_CANCELAMENTO, COMISSAO
   - Arquivo geralmente tem "GESTAO_DE_INADIMPLENTES" no nome

4. Sompo:
   - Campos: Apólice/Endosso/Parcela, Nome Segurado, Valor, Situação, Data Venc. Parcela
   - Pode aparecer "Parcelas de Apólice" como título
   - Site sompo.com.br

5. ACX / Diversos:
   - Campos: Parceiro de Negócio, Segurado, CPF/CNPJ, Apólice, Parcela, Valor Parcela, Vencimento
   - Sistema Origem: ACX

6. Porto Seguro:
   - Campos: APÓLICE, SEGURADO, CPF/CNPJ, PARCELA, VALOR, VENCIMENTO, SITUAÇÃO
   - Pode ter "Porto Seguro" ou "portoseguro" no cabeçalho/rodapé
   - Sistema Portal do Corretor ou extranet

7. HDI Seguros:
   - Campos: PROPOSTA, APÓLICE, SEGURADO, CPF/CNPJ, PRÊMIO, DATA VENCIMENTO
   - Relatório pode ter "HDI" ou "hdi.com.br"
   - Portal do Corretor HDI

8. Mapfre:
   - Campos: APÓLICE, ENDOSSO, SEGURADO, CPF/CNPJ, PARCELA, VALOR, VENCIMENTO
   - Pode ter "MAPFRE" ou "mapfre.com.br" no documento
   - Relatório de pendências ou comissões

9. Bradesco Seguros:
   - Campos: APÓLICE, SEGURADO, CPF/CNPJ, PARCELA, PRÊMIO, VENCIMENTO, STATUS
   - Relatório pode ter "Bradesco Seguros" ou "bradescoseguros.com.br"
   - Portal de corretores Bradesco

REGRAS DE EXTRAÇÃO:
1. DATAS: Converta SEMPRE para formato YYYY-MM-DD (ex: 25/12/2025 → 2025-12-25)
2. VALORES: Remova R$, pontos de milhar, converta vírgula decimal para ponto (ex: R$ 1.234,56 → 1234.56)
3. CPF/CNPJ: Apenas números (11 dígitos = CPF, 14 dígitos = CNPJ)
4. TELEFONE: SEMPRE tente extrair se disponível, apenas números com DDD (10-11 dígitos). Procure em qualquer parte do documento.
5. EMAIL: Extraia se disponível no documento, associado ao segurado
6. STATUS: Use "PENDENTE", "VENCIDO" ou "ATRASADO"
7. days_overdue: Calcule se houver "dias em atraso" ou se a data de vencimento for anterior a hoje
8. policy_number: Número da apólice (pode incluir barra e endosso, ex: "540/592978")
9. endorsement: Se separado, extraia o número do endosso
10. branch: Ramo do seguro se disponível (ex: 309, 312, 531, 540, 550)

FORMATOS ESPECIAIS DE SCREENSHOTS/PORTAIS DE CORRETORA:

10. Sistema de Gestão de Corretora / Portal Scroll / Screenshot de Portal:
    - Colunas típicas: Segurado, CPF/CNPJ, Negócio, Ramo, Apólice, Endosso, 
                       Vigência Proporcional, Telefone, Vencimento, Parcela, Valor Parcela
    - Formato: Tabela HTML, screenshot de sistema ou imagem de portal
    - CADA LINHA representa uma parcela individual - extraia TODAS
    - "Ramo" = código do produto de seguro (540, 550, 531, 309, 312, etc.)
    - "Negócio" pode ser ignorado (geralmente 0)
    - Se não houver coluna de status, usar "PENDENTE"
    - policy_number deve ser APENAS o número da coluna "Apólice"
    - branch deve receber o valor da coluna "Ramo"
    - installment_number é o valor da coluna "Parcela"
    - Telefones podem estar parcialmente visíveis - extraia o que for legível

IMPORTANTE PARA SCREENSHOTS E IMAGENS:
- Analise cuidadosamente TODAS as linhas visíveis na tabela
- Cada linha com dados deve gerar um objeto installment separado
- Números de telefone podem estar parcialmente ocultos - extraia o que for visível
- Valores com "R$" devem ser convertidos para número decimal
- Se a imagem mostrar uma tabela de parcelas, EXTRAIA CADA LINHA

REGRAS GERAIS:
- Extraia TODAS as linhas/parcelas do documento
- Cada linha do relatório geralmente representa uma parcela diferente
- Se o mesmo segurado tiver múltiplas parcelas, extraia cada uma separadamente

Retorne APENAS um JSON válido no formato:
{
  "insurer_detected": "TOKIO MARINE",
  "companies": [],
  "contacts": [],
  "installments": [
    {
      "insurer": "TOKIO MARINE",
      "policy_number": "540/592978",
      "endorsement": "2",
      "receipt_number": "237291509",
      "installment_number": 1,
      "total_installments": 1,
      "value": 536.90,
      "due_date": "2025-12-25",
      "cancellation_date": "2026-02-23",
      "insured_name": "MBL TRANSPORTES E NEGOCIOS LTDA",
      "insured_document": "12467840000148",
      "insured_phone": "43999998888",
      "insured_email": "contato@mbl.com.br",
      "branch": "309",
      "product": "Transporte",
      "status": "PENDENTE",
      "days_overdue": 14,
      "commission": 125.00,
      "confidence": 95
    }
  ]
}

Se não encontrar parcelas, retorne {"insurer_detected": null, "companies": [], "contacts": [], "installments": []}.
NÃO inclua explicações, apenas o JSON.`;

// Detect if document is an insurance delinquency report
function detectInsuranceReport(fileName: string, textContent?: string, mimeType?: string): { isInsurance: boolean; insurer?: string } {
  const lowerName = fileName.toLowerCase();
  const lowerContent = (textContent || '').toLowerCase();
  
  // ===== DETECÇÃO PARA IMAGENS/SCREENSHOTS =====
  // Screenshots de portais de corretoras devem ser analisados como relatórios de seguros
  if (mimeType?.startsWith('image/')) {
    // Screenshots com nomes genéricos de captura de tela
    if (lowerName.includes('captura') || lowerName.includes('screenshot') || 
        lowerName.includes('print') || lowerName.includes('tela') ||
        lowerName.includes('whatsapp') || lowerName.includes('screen') ||
        lowerName.includes('foto') || lowerName.includes('imagem') ||
        lowerName.includes('img_') || lowerName.includes('image')) {
      return { isInsurance: true, insurer: 'SCREENSHOT_ANALYSIS' };
    }
    // Qualquer imagem pode ser um relatório de seguros - usar análise visual
    return { isInsurance: true, insurer: 'VISUAL_ANALYSIS' };
  }
  
  // ===== DETECÇÃO POR NOME DO ARQUIVO =====
  
  // AKAD
  if (lowerName.includes('inadimplente') || lowerName.includes('akaddigital') || lowerName.includes('akad')) {
    return { isInsurance: true, insurer: 'AKAD' };
  }
  // Allianz
  if (lowerName.includes('gerararquivoservlet') || lowerName.includes('allianz')) {
    return { isInsurance: true, insurer: 'ALLIANZ' };
  }
  // Tokio Marine
  if (lowerName.includes('gestao_de_inadimplentes') || lowerName.includes('tokio') || lowerName.includes('tokiomarine')) {
    return { isInsurance: true, insurer: 'TOKIO MARINE' };
  }
  // Sompo
  if (lowerName.includes('sompo') || lowerName.includes('parcelas')) {
    return { isInsurance: true, insurer: 'SOMPO' };
  }
  // ACX
  if (lowerName.includes('acx')) {
    return { isInsurance: true, insurer: 'ACX' };
  }
  // Porto Seguro
  if (lowerName.includes('portoseguro') || lowerName.includes('porto_seguro') || lowerName.includes('porto-seguro')) {
    return { isInsurance: true, insurer: 'PORTO SEGURO' };
  }
  // HDI
  if (lowerName.includes('hdi')) {
    return { isInsurance: true, insurer: 'HDI' };
  }
  // Mapfre
  if (lowerName.includes('mapfre')) {
    return { isInsurance: true, insurer: 'MAPFRE' };
  }
  // Bradesco Seguros
  if (lowerName.includes('bradesco') || lowerName.includes('bradescoseguros')) {
    return { isInsurance: true, insurer: 'BRADESCO SEGUROS' };
  }
  
  // ===== DETECÇÃO POR CONTEÚDO DO DOCUMENTO =====
  
  // Allianz
  if (lowerContent.includes('pol_susep') || lowerContent.includes('dt_prev_canc')) {
    return { isInsurance: true, insurer: 'ALLIANZ' };
  }
  // Tokio Marine
  if (lowerContent.includes('premio_liq_atual') || lowerContent.includes('dt_prev_cancelamento')) {
    return { isInsurance: true, insurer: 'TOKIO MARINE' };
  }
  // Sompo
  if (lowerContent.includes('parcelas de apólice') || lowerContent.includes('sompo.com.br')) {
    return { isInsurance: true, insurer: 'SOMPO' };
  }
  // ACX
  if (lowerContent.includes('sistema origem') && lowerContent.includes('acx')) {
    return { isInsurance: true, insurer: 'ACX' };
  }
  // Porto Seguro
  if (lowerContent.includes('porto seguro') || lowerContent.includes('portoseguro.com.br') || lowerContent.includes('portal corretor porto')) {
    return { isInsurance: true, insurer: 'PORTO SEGURO' };
  }
  // HDI
  if (lowerContent.includes('hdi seguros') || lowerContent.includes('hdi.com.br') || lowerContent.includes('portal hdi')) {
    return { isInsurance: true, insurer: 'HDI' };
  }
  // Mapfre
  if (lowerContent.includes('mapfre') || lowerContent.includes('mapfre.com.br')) {
    return { isInsurance: true, insurer: 'MAPFRE' };
  }
  // Bradesco Seguros
  if (lowerContent.includes('bradesco seguros') || lowerContent.includes('bradescoseguros.com.br') || lowerContent.includes('portal bradesco')) {
    return { isInsurance: true, insurer: 'BRADESCO SEGUROS' };
  }
  
  // Detecção genérica de relatório de seguros
  if (lowerContent.includes('dias em atraso') || (lowerContent.includes('situação') && lowerContent.includes('apólice'))) {
    return { isInsurance: true, insurer: 'UNKNOWN' };
  }
  
  return { isInsurance: false };
}

// Limit content size for large text files (CSVs, etc.)
// IMPORTANT: Edge functions have a hard wall-clock timeout. For large CSVs we process in chunks.
const MAX_TEXT_CONTENT_LENGTH = 20000; // ~20KB of text content
const MAX_CSV_LINES = 100; // Header + 99 data rows (non-chunk mode)
const CSV_CHUNK_SIZE = 80; // Data rows per chunk (chunk mode)

function clampTextByChars(content: string, maxChars: number): { content: string; truncated: boolean } {
  if (content.length <= maxChars) return { content, truncated: false };

  const lines = content.split('\n');
  let out = '';
  let kept = 0;
  for (const line of lines) {
    if (out.length + line.length + 1 > maxChars) break;
    out += line + '\n';
    kept++;
  }
  console.log(`Content is ${content.length} chars, clamped to ~${out.length} chars (kept ${kept} lines)`);
  return { content: out, truncated: true };
}

function limitTextContent(content: string, fileName: string): { content: string; truncated: boolean; originalLines?: number } {
  const isCSV = fileName.toLowerCase().endsWith('.csv');
  const lines = content.split('\n');
  const originalLines = lines.length;

  // For CSVs in non-chunk mode: limit by number of lines first (predictable)
  if (isCSV && lines.length > MAX_CSV_LINES) {
    console.log(`CSV ${fileName} has ${lines.length} lines, limiting to ${MAX_CSV_LINES}`);
    const header = lines[0] ?? '';
    const dataLines = lines.slice(1, MAX_CSV_LINES); // header + (MAX_CSV_LINES-1) data lines
    const truncatedContent = [header, ...dataLines].join('\n');
    return { content: truncatedContent, truncated: true, originalLines };
  }

  // Then clamp by character length
  const clamped = clampTextByChars(content, MAX_TEXT_CONTENT_LENGTH);
  return { ...clamped, originalLines };
}

function splitCSVIntoChunks(content: string, chunkSize: number): { chunks: string[]; originalLines: number } {
  const lines = content.split('\n');
  const originalLines = lines.length;
  const header = lines[0] ?? '';
  const dataLines = lines.slice(1).filter(l => l.trim().length > 0);

  const chunks: string[] = [];
  for (let i = 0; i < dataLines.length; i += chunkSize) {
    const chunkLines = dataLines.slice(i, i + chunkSize);
    const chunk = [header, ...chunkLines].join('\n');
    chunks.push(chunk);
  }

  return { chunks: chunks.length ? chunks : [header], originalLines };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { files } = await req.json();

    if (!files || !Array.isArray(files) || files.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No files provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log incoming request size
    console.log(`Processing ${files.length} file(s)`);
    for (const file of files) {
      console.log(`  - ${file.name}: ${file.type}, content length: ${file.content?.length || 0} chars`);
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const allResults: ExtractionResult = {
      insurer_detected: undefined,
      companies: [],
      contacts: [],
      installments: []
    };

    const callAIGateway = async (fileLabel: string, messages: any[], model: string) => {
      const startedAt = Date.now();
      console.log('[AI] Calling model=' + model + ' for ' + fileLabel + ' (messages=' + messages.length + ')');

      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.1,
        }),
      });

      const elapsed = Date.now() - startedAt;
      console.log('[AI] Response status=' + response.status + ' for ' + fileLabel + ' in ' + elapsed + 'ms');

      if (!response.ok) {
        const errorText = await response.text();
        console.error('AI Gateway error for ' + fileLabel + ':', response.status, errorText);

        if (response.status === 429) {
          return { kind: 'fatal' as const, status: 429, message: 'Rate limit exceeded. Please try again later.' };
        }
        if (response.status === 402) {
          return { kind: 'fatal' as const, status: 402, message: 'Payment required. Please add credits to continue.' };
        }

        return { kind: 'skip' as const, status: response.status, message: errorText };
      }

      const data = await response.json();
      const aiResponse = data.choices?.[0]?.message?.content;
      return { kind: 'ok' as const, aiResponse: (aiResponse ?? '') as string };
    };

    const mergeParsedIntoResults = (parsed: any, sourceName: string, detection: { isInsurance: boolean; insurer?: string }) => {
      // Update detected insurer if provided
      if (parsed?.insurer_detected && !allResults.insurer_detected) {
        allResults.insurer_detected = parsed.insurer_detected;
      }

      // Add source info and merge results
      if (parsed?.companies && Array.isArray(parsed.companies)) {
        for (const company of parsed.companies) {
          company.source = sourceName;
          if (company.cnpj && company.cnpj.replace(/\D/g, '').length === 14) {
            company.cnpj = company.cnpj.replace(/\D/g, '');
            allResults.companies.push(company);
          }
        }
      }

      if (parsed?.contacts && Array.isArray(parsed.contacts)) {
        for (const contact of parsed.contacts) {
          contact.source = sourceName;
          const cleanPhone = contact.phone?.replace(/\D/g, '') || '';
          if (cleanPhone.length >= 10 && cleanPhone.length <= 11) {
            contact.phone = cleanPhone;
            if (contact.cpf) contact.cpf = contact.cpf.replace(/\D/g, '');
            if (contact.company_cnpj) contact.company_cnpj = contact.company_cnpj.replace(/\D/g, '');
            allResults.contacts.push(contact);
          }
        }
      }

      if (parsed?.installments && Array.isArray(parsed.installments)) {
        console.log('Processing ' + parsed.installments.length + ' installments from ' + sourceName);
        let validCount = 0;
        let skippedCount = 0;
        
        for (const installment of parsed.installments) {
          installment.source = sourceName;

          if (installment.insured_document) {
            installment.insured_document = installment.insured_document.replace(/\D/g, '');
          }

          if (installment.insured_phone) {
            installment.insured_phone = installment.insured_phone.replace(/\D/g, '');
            if (installment.insured_phone.length < 10 || installment.insured_phone.length > 11) {
              installment.insured_phone = '';
            }
          }

          // CRITICAL FIX: Validate and ensure installment_number is a valid positive integer
          // This prevents NOT-NULL constraint violation in the database
          if (installment.installment_number === null || 
              installment.installment_number === undefined || 
              installment.installment_number === '' ||
              isNaN(Number(installment.installment_number))) {
            console.log('WARN: installment_number is null/undefined for ' + installment.policy_number + ', defaulting to 1');
            installment.installment_number = 1;
          } else if (typeof installment.installment_number === 'string') {
            const parsed = parseInt(installment.installment_number);
            installment.installment_number = isNaN(parsed) || parsed < 1 ? 1 : parsed;
          } else if (typeof installment.installment_number === 'number') {
            installment.installment_number = Math.max(1, Math.floor(installment.installment_number));
          } else {
            installment.installment_number = 1;
          }

          // Validate and parse value
          if (typeof installment.value === 'string') {
            installment.value = parseFloat(String(installment.value).replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
          } else if (typeof installment.value !== 'number') {
            installment.value = 0;
          }

          if (!installment.insurer) {
            installment.insurer = allResults.insurer_detected || detection.insurer || 'NÃO IDENTIFICADA';
          }

          // Validate required fields - skip entries with invalid data
          if (!installment.policy_number) {
            console.log('WARN: Skipping installment without policy_number');
            skippedCount++;
            continue;
          }
          if (!installment.insured_name) {
            console.log('WARN: Skipping installment without insured_name: ' + installment.policy_number);
            skippedCount++;
            continue;
          }
          if (installment.value <= 0) {
            console.log('WARN: Skipping installment with invalid value: ' + installment.policy_number + ' value=' + installment.value);
            skippedCount++;
            continue;
          }

          validCount++;
          allResults.installments.push(installment);
        }
        
        console.log('Installments from ' + sourceName + ': ' + validCount + ' valid, ' + skippedCount + ' skipped');
      }
    };

    const parseAIResponseToJson = (aiResponseRaw: string, sourceName: string) => {
      if (!aiResponseRaw) return null;

      console.log('AI response for ' + sourceName + ':', aiResponseRaw.substring(0, 500));
      console.log('AI response length for ' + sourceName + ':', aiResponseRaw.length);

      let jsonStr = aiResponseRaw.trim();
      if (jsonStr.startsWith('```json')) jsonStr = jsonStr.slice(7);
      else if (jsonStr.startsWith('```')) jsonStr = jsonStr.slice(3);
      if (jsonStr.endsWith('```')) jsonStr = jsonStr.slice(0, -3);
      jsonStr = jsonStr.trim();

      try {
        return JSON.parse(jsonStr);
      } catch (initialParseError) {
        console.warn('Initial JSON parse failed for ' + sourceName + ', attempting to fix truncated response...');

        let openBraces = 0;
        let openBrackets = 0;
        let inString = false;
        let escapeNext = false;

        for (const char of jsonStr) {
          if (escapeNext) {
            escapeNext = false;
            continue;
          }
          if (char === '\\') {
            escapeNext = true;
            continue;
          }
          if (char === '"') {
            inString = !inString;
            continue;
          }
          if (!inString) {
            if (char === '{') openBraces++;
            else if (char === '}') openBraces--;
            else if (char === '[') openBrackets++;
            else if (char === ']') openBrackets--;
          }
        }

        console.log('Unmatched brackets for', sourceName, '{ =', openBraces, '[ =', openBrackets);

        let fixedJson = jsonStr;
        if (inString) fixedJson += '"';

        const lastChar = fixedJson.trim().slice(-1);
        if (lastChar === ':' || lastChar === ',') fixedJson += 'null';

        for (let i = 0; i < openBrackets; i++) fixedJson += ']';
        for (let i = 0; i < openBraces; i++) fixedJson += '}';

        try {
          const parsed = JSON.parse(fixedJson);
          console.log('Successfully parsed fixed JSON for ' + sourceName);
          return parsed;
        } catch (fixParseError) {
          console.error('Failed to parse fixed JSON for ' + sourceName + ':', fixParseError);

          const installmentsMatch = jsonStr.match(/"installments"\s*:\s*\[([\s\S]*?)(?:\]|$)/);
          if (installmentsMatch) {
            const installmentObjects = installmentsMatch[1].match(/\{[^{}]*\}/g);
            if (installmentObjects && installmentObjects.length > 0) {
              const partialInstallments = [];
              for (const obj of installmentObjects) {
                try {
                  partialInstallments.push(JSON.parse(obj));
                } catch {
                  // ignore
                }
              }
              if (partialInstallments.length > 0) {
                console.log('Recovered ' + partialInstallments.length + ' installments from truncated response (' + sourceName + ')');
                return { companies: [], contacts: [], installments: partialInstallments };
              }
            }
          }

          throw initialParseError;
        }
      }
    };

    const pickModel = (opts: { isVision: boolean; isLargeText: boolean; isCSV: boolean }) => {
      if (opts.isVision) return 'google/gemini-2.5-flash';
      if (opts.isLargeText || opts.isCSV) return 'google/gemini-2.5-flash-lite';
      return 'google/gemini-2.5-flash';
    };

    // Process each file
    for (const file of files) {
      const { name, type, content } = file;

      console.log('Processing file: ' + name + ', type: ' + type);

      let extractedText = '';

      // For text-based files, decode first to detect content and decide chunking
      const isTextBased = type === 'text/csv' || type === 'application/vnd.ms-excel' ||
        type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        type === 'text/plain';

      if (isTextBased) {
        try {
          const decoded = atob(content);
          extractedText = decoded;
        } catch {
          extractedText = '';
        }
      }

      // Detect if this is an insurance report (pass mimeType for images)
      const detection = detectInsuranceReport(name, extractedText, type);
      const prompt = detection.isInsurance ? INSURANCE_EXTRACTION_PROMPT : EXTRACTION_PROMPT;

      if (detection.isInsurance) {
        console.log('Detected insurance report: ' + detection.insurer);
        if (!allResults.insurer_detected && detection.insurer) {
          allResults.insurer_detected = detection.insurer;
        }
      }

      const isCSV = type === 'text/csv' || name.toLowerCase().endsWith('.csv');

      // ===== CSV CHUNK MODE (prevents timeouts) =====
      if (isCSV && extractedText) {
        const { chunks, originalLines } = splitCSVIntoChunks(extractedText, CSV_CHUNK_SIZE);

        if (originalLines > MAX_CSV_LINES) {
          console.log('Large CSV detected (' + originalLines + ' lines): processing ' + chunks.length + ' chunk(s)');

          for (let idx = 0; idx < chunks.length; idx++) {
            const chunkLabel = name + ' (parte ' + (idx + 1) + '/' + chunks.length + ')';
            const clamped = clampTextByChars(chunks[idx], MAX_TEXT_CONTENT_LENGTH);
            if (clamped.truncated) console.log('Warning: Chunk content truncated for ' + chunkLabel);

            const userContent = detection.isInsurance
              ? 'Extraia todas as parcelas inadimplentes deste relatório de seguradora.\n\nArquivo: ' + chunkLabel + (detection.insurer ? ' (Seguradora detectada: ' + detection.insurer + ')' : '') + '\n\nConteúdo:\n' + clamped.content
              : 'Extraia todos os dados de empresas e contatos deste documento.\n\nArquivo: ' + chunkLabel + '\n\nConteúdo:\n' + clamped.content;

            const messages = [
              { role: 'system', content: prompt },
              { role: 'user', content: userContent }
            ];

            const model = pickModel({ isVision: false, isLargeText: clamped.content.length > 15000, isCSV: true });
            const ai = await callAIGateway(chunkLabel, messages, model);

            if (ai.kind === 'fatal') {
              return new Response(
                JSON.stringify({ error: ai.message }),
                { status: ai.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }
            if (ai.kind === 'skip') {
              console.warn('Skipping chunk due to AI error: ' + chunkLabel);
              continue;
            }

            try {
              const parsed = parseAIResponseToJson(ai.aiResponse, chunkLabel);
              if (parsed) mergeParsedIntoResults(parsed, chunkLabel, detection);
            } catch (err) {
              console.error('Error parsing AI response for ' + chunkLabel + ':', err);
            }
          }

          // done with this file
          continue;
        }
      }

      // ===== NORMAL MODE (single request per file) =====
      let messages: any[] = [];
      let contentTruncated = false;

      if (isTextBased && extractedText) {
        const limited = limitTextContent(extractedText, name);
        extractedText = limited.content;
        contentTruncated = limited.truncated;
        if (contentTruncated) {
          console.log('Warning: Content truncated for ' + name + ' to prevent timeout');
        }
      }

      // For images and PDFs, use Vision
      if (type.startsWith('image/') || type === 'application/pdf') {
        const mimeType = type === 'application/pdf' ? 'application/pdf' : type;
        const imageInstructionsBase = detection.isInsurance
          ? 'Analise esta imagem e extraia TODAS as parcelas de seguro visíveis.\n\nINSTRUÇÕES CRÍTICAS:\n1. Se for uma TABELA com múltiplas linhas, extraia CADA linha como uma parcela separada\n2. Identifique as colunas: Segurado, CPF/CNPJ, Ramo, Apólice, Endosso, Vencimento, Parcela, Valor\n3. Para CADA linha da tabela, crie um objeto installment separado\n4. Mapeie os campos conforme as regras.\n\nArquivo: ' + name + (detection.insurer ? ' (Modo: ' + detection.insurer + ')' : '')
          : 'Extraia todos os dados de empresas e contatos deste documento. Arquivo: ' + name;

        messages = [
          { role: 'system', content: prompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: imageInstructionsBase },
              { type: 'image_url', image_url: { url: 'data:' + mimeType + ';base64,' + content } }
            ]
          }
        ];
      } else if (extractedText) {
        const textContent = detection.isInsurance
          ? 'Extraia todas as parcelas inadimplentes deste relatório de seguradora.\n\nArquivo: ' + name + (detection.insurer ? ' (Seguradora detectada: ' + detection.insurer + ')' : '') + (contentTruncated ? ' (conteúdo truncado)' : '') + '\n\nConteúdo:\n' + extractedText
          : 'Extraia todos os dados de empresas e contatos deste documento.\n\nArquivo: ' + name + (contentTruncated ? ' (conteúdo truncado)' : '') + '\n\nConteúdo:\n' + extractedText;

        messages = [
          { role: 'system', content: prompt },
          { role: 'user', content: textContent }
        ];
      } else {
        // Fallback: treat as binary/image
        const fallbackText = detection.isInsurance
          ? 'Extraia todas as parcelas inadimplentes deste relatório de seguradora. Arquivo: ' + name
          : 'Extraia todos os dados de empresas e contatos deste documento. Arquivo: ' + name;

        messages = [
          { role: 'system', content: prompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: fallbackText },
              { type: 'image_url', image_url: { url: 'data:' + type + ';base64,' + content } }
            ]
          }
        ];
      }

      const model = pickModel({
        isVision: type.startsWith('image/') || type === 'application/pdf',
        isLargeText: extractedText.length > 15000,
        isCSV
      });

      const ai = await callAIGateway(name, messages, model);

      if (ai.kind === 'fatal') {
        return new Response(
          JSON.stringify({ error: ai.message }),
          { status: ai.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (ai.kind === 'skip') {
        continue;
      }

      try {
        const parsed = parseAIResponseToJson(ai.aiResponse, name);
        if (parsed) mergeParsedIntoResults(parsed, name, detection);
      } catch (err) {
        console.error('Error parsing AI response for ' + name + ':', err);
      }
    }

    // Deduplicate companies by CNPJ (keep highest confidence)
    const uniqueCompanies = new Map<string, ExtractedCompany>();
    for (const company of allResults.companies) {
      const existing = uniqueCompanies.get(company.cnpj);
      if (!existing || (company.confidence > existing.confidence)) {
        uniqueCompanies.set(company.cnpj, company);
      }
    }

    // Deduplicate contacts by phone (keep highest confidence)
    const uniqueContacts = new Map<string, ExtractedContact>();
    for (const contact of allResults.contacts) {
      const existing = uniqueContacts.get(contact.phone);
      if (!existing || (contact.confidence > existing.confidence)) {
        uniqueContacts.set(contact.phone, contact);
      }
    }

    // Deduplicate installments by policy_number + endorsement + installment_number + due_date
    const uniqueInstallments = new Map<string, ExtractedInstallment>();
    for (const installment of allResults.installments) {
      const endorsement = (installment as any).endorsement || '';
      const dueDate = installment.due_date || '';
      const key = installment.policy_number + '-' + endorsement + '-' + installment.installment_number + '-' + dueDate;
      const existing = uniqueInstallments.get(key);
      if (!existing || (installment.confidence > existing.confidence)) {
        uniqueInstallments.set(key, installment);
      }
    }

    console.log('Deduplication: ' + allResults.installments.length + ' raw -> ' + uniqueInstallments.size + ' unique installments');

    const result: ExtractionResult = {
      insurer_detected: allResults.insurer_detected,
      companies: Array.from(uniqueCompanies.values()),
      contacts: Array.from(uniqueContacts.values()),
      installments: Array.from(uniqueInstallments.values())
    };

    console.log('Extraction complete: ' + result.companies.length + ' companies, ' + result.contacts.length + ' contacts, ' + result.installments.length + ' installments');

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in extract-documents:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});