import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  let productId: string | null = null;

  try {
    const body = await req.json();
    productId = body.productId;
    const fileUrl = body.fileUrl;

    if (!productId || !fileUrl) {
      return new Response(JSON.stringify({ error: 'productId and fileUrl are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[extract-product-text] Processing product ${productId}, file: ${fileUrl}`);

    // Update status to processing
    await supabase
      .from('product_knowledge')
      .update({ extraction_status: 'processing' })
      .eq('id', productId);

    // Download the PDF from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('whatsapp-media')
      .download(fileUrl);

    if (downloadError || !fileData) {
      console.error('[extract-product-text] Download error:', downloadError);
      await supabase
        .from('product_knowledge')
        .update({ extraction_status: 'error' })
        .eq('id', productId);
      return new Response(JSON.stringify({ error: 'Failed to download file' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Convert to base64 for Gemini (byte-by-byte to avoid stack overflow)
    const arrayBuffer = await fileData.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);

    console.log(`[extract-product-text] File downloaded, size: ${arrayBuffer.byteLength} bytes`);

    // Use Gemini to extract text from PDF
    const response = await fetch(LOVABLE_AI_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `Você é um extrator de texto especializado em documentos de seguros.
Sua tarefa é extrair TODO o conteúdo textual do PDF de condições gerais de seguro fornecido.

REGRAS:
1. Extraia TUDO: coberturas, exclusões, carências, limites, definições, procedimentos, cláusulas
2. Mantenha a estrutura hierárquica (capítulos, seções, artigos)
3. Preserve números de artigos e cláusulas
4. Inclua tabelas de coberturas/limites como texto formatado
5. NÃO resuma - extraia o texto COMPLETO e FIEL ao documento
6. Use markdown para formatar (# títulos, ## subtítulos, - listas, etc)
7. No início, crie um RESUMO de 3-5 linhas do documento

Formato de saída:
RESUMO: [resumo breve do documento]

---

[conteúdo completo extraído]`
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Extraia todo o conteúdo textual deste PDF de condições gerais de seguro:'
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:application/pdf;base64,${base64}`
                }
              }
            ]
          }
        ],
        max_tokens: 64000,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[extract-product-text] AI error:', response.status, errorText);
      
      await supabase
        .from('product_knowledge')
        .update({ extraction_status: 'error' })
        .eq('id', productId);

      return new Response(JSON.stringify({ error: 'AI extraction failed', details: errorText }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiResult = await response.json();
    const extractedText = aiResult.choices?.[0]?.message?.content || '';

    console.log(`[extract-product-text] Extracted ${extractedText.length} characters`);

    // Parse summary from the extracted text
    let summary = '';
    let fullContent = extractedText;
    
    const summaryMatch = extractedText.match(/^RESUMO:\s*([\s\S]*?)(?:\n---|\n\n#)/);
    if (summaryMatch) {
      summary = summaryMatch[1].trim();
      const separatorIndex = extractedText.indexOf('\n---');
      if (separatorIndex > -1) {
        fullContent = extractedText.substring(separatorIndex + 4).trim();
      }
    }

    // Update product_knowledge with extracted content
    const { error: updateError } = await supabase
      .from('product_knowledge')
      .update({
        full_content: fullContent,
        summary: summary || fullContent.substring(0, 300) + '...',
        extraction_status: 'completed',
      })
      .eq('id', productId);

    if (updateError) {
      console.error('[extract-product-text] Update error:', updateError);
      return new Response(JSON.stringify({ error: 'Failed to save extracted text' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[extract-product-text] ✅ Successfully extracted and saved for product ${productId}`);

    return new Response(JSON.stringify({ 
      success: true, 
      contentLength: fullContent.length,
      summaryLength: summary.length 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[extract-product-text] Fatal error:', error);

    // Safety net: mark as error so it doesn't stay stuck in "processing"
    if (productId) {
      try {
        await supabase
          .from('product_knowledge')
          .update({ extraction_status: 'error' })
          .eq('id', productId);
      } catch (e) {
        console.error('[extract-product-text] Failed to update status to error:', e);
      }
    }

    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
