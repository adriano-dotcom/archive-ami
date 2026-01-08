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

interface ExtractionResult {
  companies: ExtractedCompany[];
  contacts: ExtractedContact[];
  raw_text?: string;
}

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
  ]
}

Se não encontrar dados, retorne {\"companies\": [], \"contacts\": []}.
NÃO inclua explicações, apenas o JSON.`;

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
      companies: [],
      contacts: []
    };

    // Process each file
    for (const file of files) {
      const { name, type, content } = file;
      
      console.log(`Processing file: ${name}, type: ${type}`);
      
      let extractedText = '';
      let messages: any[] = [];
      
      // For images and PDFs, use Gemini Vision
      if (type.startsWith('image/') || type === 'application/pdf') {
        // For PDFs converted to images or direct images
        const mimeType = type === 'application/pdf' ? 'application/pdf' : type;
        
        messages = [
          { role: 'system', content: EXTRACTION_PROMPT },
          { 
            role: 'user', 
            content: [
              {
                type: 'text',
                text: `Extraia todos os dados de empresas e contatos deste documento. Arquivo: ${name}`
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
      } else if (type === 'text/csv' || type === 'application/vnd.ms-excel' || 
                 type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
                 type === 'text/plain') {
        // For text-based files, decode and send as text
        try {
          extractedText = atob(content);
        } catch {
          extractedText = content;
        }
        
        messages = [
          { role: 'system', content: EXTRACTION_PROMPT },
          { 
            role: 'user', 
            content: `Extraia todos os dados de empresas e contatos deste documento.
            
Arquivo: ${name}

Conteúdo:
${extractedText}`
          }
        ];
      } else {
        // For other types, try to decode as text or send as image
        try {
          extractedText = atob(content);
          messages = [
            { role: 'system', content: EXTRACTION_PROMPT },
            { 
              role: 'user', 
              content: `Extraia todos os dados de empresas e contatos deste documento.
              
Arquivo: ${name}

Conteúdo:
${extractedText}`
            }
          ];
        } catch {
          // Treat as binary/image
          messages = [
            { role: 'system', content: EXTRACTION_PROMPT },
            { 
              role: 'user', 
              content: [
                {
                  type: 'text',
                  text: `Extraia todos os dados de empresas e contatos deste documento. Arquivo: ${name}`
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

    const result: ExtractionResult = {
      companies: Array.from(uniqueCompanies.values()),
      contacts: Array.from(uniqueContacts.values())
    };

    console.log(`Extraction complete: ${result.companies.length} companies, ${result.contacts.length} contacts`);

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
