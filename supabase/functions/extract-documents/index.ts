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
4. TELEFONE: Se encontrar, apenas números com DDD (10-11 dígitos)
5. STATUS: Use "PENDENTE", "VENCIDO" ou "ATRASADO"
6. days_overdue: Calcule se houver "dias em atraso" ou se a data de vencimento for anterior a hoje
7. policy_number: Número da apólice (pode incluir barra e endosso, ex: "540/592978")
8. endorsement: Se separado, extraia o número do endosso
9. branch: Ramo do seguro se disponível (ex: 309, 312, 531)

IMPORTANTE:
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
      "insured_phone": "",
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
function detectInsuranceReport(fileName: string, textContent?: string): { isInsurance: boolean; insurer?: string } {
  const lowerName = fileName.toLowerCase();
  const lowerContent = (textContent || '').toLowerCase();
  
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

    // Process each file
    for (const file of files) {
      const { name, type, content } = file;
      
      console.log(`Processing file: ${name}, type: ${type}`);
      
      let extractedText = '';
      let messages: any[] = [];
      
      // For text-based files, decode first to detect content
      if (type === 'text/csv' || type === 'application/vnd.ms-excel' || 
          type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
          type === 'text/plain') {
        try {
          extractedText = atob(content);
        } catch {
          extractedText = content;
        }
      }
      
      // Detect if this is an insurance report
      const detection = detectInsuranceReport(name, extractedText);
      const prompt = detection.isInsurance ? INSURANCE_EXTRACTION_PROMPT : EXTRACTION_PROMPT;
      
      if (detection.isInsurance) {
        console.log(`Detected insurance report: ${detection.insurer}`);
        if (!allResults.insurer_detected && detection.insurer) {
          allResults.insurer_detected = detection.insurer;
        }
      }
      
      // For images and PDFs, use Gemini Vision
      if (type.startsWith('image/') || type === 'application/pdf') {
        const mimeType = type === 'application/pdf' ? 'application/pdf' : type;
        
        messages = [
          { role: 'system', content: prompt },
          { 
            role: 'user', 
            content: [
              {
                type: 'text',
                text: detection.isInsurance 
                  ? `Extraia todas as parcelas inadimplentes deste relatório de seguradora. Arquivo: ${name}${detection.insurer ? ` (Seguradora detectada: ${detection.insurer})` : ''}`
                  : `Extraia todos os dados de empresas e contatos deste documento. Arquivo: ${name}`
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${content}`
                }
              }
            ]
          }
        ];
      } else if (extractedText) {
        // For text-based files with decoded content
        messages = [
          { role: 'system', content: prompt },
          { 
            role: 'user', 
            content: detection.isInsurance
              ? `Extraia todas as parcelas inadimplentes deste relatório de seguradora.
              
Arquivo: ${name}${detection.insurer ? ` (Seguradora detectada: ${detection.insurer})` : ''}

Conteúdo:
${extractedText}`
              : `Extraia todos os dados de empresas e contatos deste documento.
            
Arquivo: ${name}

Conteúdo:
${extractedText}`
          }
        ];
      } else {
        // For other types, try to decode as text or send as image
        try {
          extractedText = atob(content);
          const textDetection = detectInsuranceReport(name, extractedText);
          const textPrompt = textDetection.isInsurance ? INSURANCE_EXTRACTION_PROMPT : EXTRACTION_PROMPT;
          
          messages = [
            { role: 'system', content: textPrompt },
            { 
              role: 'user', 
              content: textDetection.isInsurance
                ? `Extraia todas as parcelas inadimplentes deste relatório de seguradora.

Arquivo: ${name}${textDetection.insurer ? ` (Seguradora detectada: ${textDetection.insurer})` : ''}

Conteúdo:
${extractedText}`
                : `Extraia todos os dados de empresas e contatos deste documento.
              
Arquivo: ${name}

Conteúdo:
${extractedText}`
            }
          ];
        } catch {
          // Treat as binary/image
          messages = [
            { role: 'system', content: prompt },
            { 
              role: 'user', 
              content: [
                {
                  type: 'text',
                  text: detection.isInsurance
                    ? `Extraia todas as parcelas inadimplentes deste relatório de seguradora. Arquivo: ${name}`
                    : `Extraia todos os dados de empresas e contatos deste documento. Arquivo: ${name}`
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${type};base64,${content}`
                  }
                }
              ]
            }
          ];
        }
      }

      // Call Lovable AI Gateway
      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages,
          temperature: 0.1,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`AI Gateway error for ${name}:`, response.status, errorText);
        
        if (response.status === 429) {
          return new Response(
            JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        if (response.status === 402) {
          return new Response(
            JSON.stringify({ error: 'Payment required. Please add credits to continue.' }),
            { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        continue; // Skip this file but continue with others
      }

      const data = await response.json();
      const aiResponse = data.choices?.[0]?.message?.content;

      if (aiResponse) {
        console.log(`AI response for ${name}:`, aiResponse.substring(0, 500));
        
        // Parse the JSON response
        try {
          // Remove markdown code blocks if present
          let jsonStr = aiResponse.trim();
          if (jsonStr.startsWith('```json')) {
            jsonStr = jsonStr.slice(7);
          } else if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.slice(3);
          }
          if (jsonStr.endsWith('```')) {
            jsonStr = jsonStr.slice(0, -3);
          }
          jsonStr = jsonStr.trim();
          
          const parsed = JSON.parse(jsonStr);
          
          // Update detected insurer if provided
          if (parsed.insurer_detected && !allResults.insurer_detected) {
            allResults.insurer_detected = parsed.insurer_detected;
          }
          
          // Add source info and merge results
          if (parsed.companies && Array.isArray(parsed.companies)) {
            for (const company of parsed.companies) {
              company.source = name;
              // Validate CNPJ
              if (company.cnpj && company.cnpj.replace(/\D/g, '').length === 14) {
                company.cnpj = company.cnpj.replace(/\D/g, '');
                allResults.companies.push(company);
              }
            }
          }
          
          if (parsed.contacts && Array.isArray(parsed.contacts)) {
            for (const contact of parsed.contacts) {
              contact.source = name;
              // Validate phone
              const cleanPhone = contact.phone?.replace(/\D/g, '') || '';
              if (cleanPhone.length >= 10 && cleanPhone.length <= 11) {
                contact.phone = cleanPhone;
                if (contact.cpf) {
                  contact.cpf = contact.cpf.replace(/\D/g, '');
                }
                if (contact.company_cnpj) {
                  contact.company_cnpj = contact.company_cnpj.replace(/\D/g, '');
                }
                allResults.contacts.push(contact);
              }
            }
          }
          
          // Process installments
          if (parsed.installments && Array.isArray(parsed.installments)) {
            for (const installment of parsed.installments) {
              installment.source = name;
              
              // Clean up document (CPF/CNPJ)
              if (installment.insured_document) {
                installment.insured_document = installment.insured_document.replace(/\D/g, '');
              }
              
              // Clean up phone if present
              if (installment.insured_phone) {
                installment.insured_phone = installment.insured_phone.replace(/\D/g, '');
                if (installment.insured_phone.length < 10 || installment.insured_phone.length > 11) {
                  installment.insured_phone = '';
                }
              }
              
              // Ensure value is a number
              if (typeof installment.value === 'string') {
                installment.value = parseFloat(installment.value.replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
              }
              
              // Ensure installment_number is a number
              if (typeof installment.installment_number === 'string') {
                installment.installment_number = parseInt(installment.installment_number) || 1;
              }
              
              // Validate required fields
              if (installment.policy_number && installment.insured_name && installment.value > 0) {
                allResults.installments.push(installment);
              }
            }
          }
        } catch (parseError) {
          console.error(`Error parsing AI response for ${name}:`, parseError);
        }
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
    
    // Deduplicate installments by policy_number + installment_number (keep highest confidence)
    const uniqueInstallments = new Map<string, ExtractedInstallment>();
    for (const installment of allResults.installments) {
      const key = `${installment.policy_number}-${installment.installment_number}`;
      const existing = uniqueInstallments.get(key);
      if (!existing || (installment.confidence > existing.confidence)) {
        uniqueInstallments.set(key, installment);
      }
    }

    const result: ExtractionResult = {
      insurer_detected: allResults.insurer_detected,
      companies: Array.from(uniqueCompanies.values()),
      contacts: Array.from(uniqueContacts.values()),
      installments: Array.from(uniqueInstallments.values())
    };

    console.log(`Extraction complete: ${result.companies.length} companies, ${result.contacts.length} contacts, ${result.installments.length} installments`);

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
