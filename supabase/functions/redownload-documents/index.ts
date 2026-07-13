import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DocumentResult {
  messageId: string;
  filename: string;
  status: 'success' | 'failed' | 'skipped';
  error?: string;
  mediaUrl?: string;
}

async function getWhatsAppAccessToken(supabase: any): Promise<string | null> {
  // First check if token is in Vault
  const { data: settings } = await supabase
    .from('nina_settings')
    .select('whatsapp_access_token, whatsapp_token_in_vault')
    .single();

  if (!settings) {
    console.error('[Redownload] No nina_settings found');
    return null;
  }

  if (settings.whatsapp_token_in_vault) {
    // Get from Vault
    const { data: vaultToken } = await supabase.rpc('get_vault_secret', {
      secret_name: 'WHATSAPP_ACCESS_TOKEN'
    });
    return vaultToken || null;
  }

  return settings.whatsapp_access_token;
}

async function downloadMediaFromWhatsApp(
  mediaId: string,
  accessToken: string
): Promise<{ buffer: ArrayBuffer; mimeType: string } | null> {
  try {
    console.log('[Redownload] Fetching media info for:', mediaId);
    
    // Step 1: Get media URL from WhatsApp API
    const mediaInfoResponse = await fetch(
      `https://graph.facebook.com/v18.0/${mediaId}`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }
    );

    if (!mediaInfoResponse.ok) {
      const errorText = await mediaInfoResponse.text();
      console.error('[Redownload] Failed to get media info:', errorText);
      return null;
    }

    const mediaInfo = await mediaInfoResponse.json();
    console.log('[Redownload] Media info received, URL:', mediaInfo.url ? 'present' : 'missing');

    if (!mediaInfo.url) {
      console.error('[Redownload] No URL in media info');
      return null;
    }

    // Step 2: Download the actual file
    const mediaResponse = await fetch(mediaInfo.url, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!mediaResponse.ok) {
      console.error('[Redownload] Failed to download media:', mediaResponse.status);
      return null;
    }

    const buffer = await mediaResponse.arrayBuffer();
    const mimeType = mediaInfo.mime_type || 'application/octet-stream';

    console.log('[Redownload] Downloaded media, size:', buffer.byteLength, 'mime:', mimeType);

    return { buffer, mimeType };
  } catch (error) {
    console.error('[Redownload] Error downloading media:', error);
    return null;
  }
}

function getFileExtension(mimeType: string, filename: string): string {
  // Try to get extension from filename first
  const filenameExt = filename.split('.').pop()?.toLowerCase();
  if (filenameExt && filenameExt.length <= 5) {
    return filenameExt;
  }

  // Fallback to mime type
  if (mimeType.includes('pdf')) return 'pdf';
  if (mimeType.includes('msword')) return 'doc';
  if (mimeType.includes('wordprocessingml')) return 'docx';
  if (mimeType.includes('spreadsheetml')) return 'xlsx';
  if (mimeType.includes('ms-excel')) return 'xls';
  if (mimeType.includes('presentation')) return 'pptx';
  if (mimeType.includes('powerpoint')) return 'ppt';
  if (mimeType.includes('text/plain')) return 'txt';
  if (mimeType.includes('text/csv')) return 'csv';
  
  return 'bin';
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // --- Auth guard: internal service-role (cron/triggers/bridge) OR authenticated staff (admin/operator) ---
  {
    const _supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const _svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const _anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const _token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
    if (_token !== _svcKey) {
      if (!_token) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const _authClient = createClient(_supabaseUrl, _anonKey, { global: { headers: { Authorization: `Bearer ${_token}` } } });
      const { data: _authData, error: _authErr } = await _authClient.auth.getUser();
      if (_authErr || !_authData?.user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const { data: _roleRows } = await _authClient.from('user_roles').select('role').eq('user_id', _authData.user.id);
      if (!(_roleRows || []).some((r: any) => r.role === 'admin' || r.role === 'operator')) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }
  }


  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Parse request body for options
    let options = { dryRun: false, messageId: null as string | null, limit: 50 };
    try {
      const body = await req.json();
      options = { ...options, ...body };
    } catch {
      // Use defaults
    }

    console.log('[Redownload] Starting with options:', options);

    // Get WhatsApp access token
    const accessToken = await getWhatsAppAccessToken(supabase);
    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: 'WhatsApp access token not configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Query documents without media_url
    let query = supabase
      .from('messages')
      .select(`
        id,
        content,
        metadata,
        created_at,
        conversation_id
      `)
      .eq('type', 'document')
      .is('media_url', null)
      .order('created_at', { ascending: false })
      .limit(options.limit);

    if (options.messageId) {
      query = query.eq('id', options.messageId);
    }

    const { data: documents, error: queryError } = await query;

    if (queryError) {
      console.error('[Redownload] Query error:', queryError);
      return new Response(
        JSON.stringify({ error: 'Failed to query documents', details: queryError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[Redownload] Found', documents?.length || 0, 'documents to process');

    if (!documents || documents.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No documents to reprocess', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Dry run - just return what would be processed
    if (options.dryRun) {
      const summary = documents.map(doc => ({
        id: doc.id,
        filename: doc.content,
        mediaId: doc.metadata?.raw?.document?.id || 'not found',
        createdAt: doc.created_at
      }));

      return new Response(
        JSON.stringify({ 
          dryRun: true, 
          documentsToProcess: documents.length,
          documents: summary 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Process each document
    const results: DocumentResult[] = [];

    for (const doc of documents) {
      const filename = doc.content || 'documento';
      const mediaId = doc.metadata?.raw?.document?.id;
      // Get phone from metadata
      const phone = doc.metadata?.raw?.from;

      console.log('[Redownload] Processing:', doc.id, filename, 'mediaId:', mediaId, 'phone:', phone);

      if (!mediaId) {
        results.push({
          messageId: doc.id,
          filename,
          status: 'skipped',
          error: 'No media ID in metadata'
        });
        continue;
      }

      if (!phone) {
        results.push({
          messageId: doc.id,
          filename,
          status: 'skipped',
          error: 'No phone number found'
        });
        continue;
      }

      // Download from WhatsApp
      const media = await downloadMediaFromWhatsApp(mediaId, accessToken);

      if (!media) {
        results.push({
          messageId: doc.id,
          filename,
          status: 'failed',
          error: 'Failed to download from WhatsApp (may be expired after 30 days)'
        });
        continue;
      }

      // Upload to Supabase Storage
      const normalizedPhone = phone.replace(/\D/g, '');
      const extension = getFileExtension(media.mimeType, filename);
      const storagePath = `document/${normalizedPhone}/${Date.now()}_${doc.id.slice(0, 8)}.${extension}`;

      console.log('[Redownload] Uploading to:', storagePath);

      const { error: uploadError } = await supabase.storage
        .from('whatsapp-media')
        .upload(storagePath, media.buffer, {
          contentType: media.mimeType,
          upsert: false
        });

      if (uploadError) {
        console.error('[Redownload] Upload error:', uploadError);
        results.push({
          messageId: doc.id,
          filename,
          status: 'failed',
          error: `Upload failed: ${uploadError.message}`
        });
        continue;
      }

      // Get public URL
      const { data: publicUrlData } = supabase.storage
        .from('whatsapp-media')
        .getPublicUrl(storagePath);

      const mediaUrl = publicUrlData?.publicUrl;

      // Update message with media_url
      const { error: updateError } = await supabase
        .from('messages')
        .update({ media_url: mediaUrl })
        .eq('id', doc.id);

      if (updateError) {
        console.error('[Redownload] Update error:', updateError);
        results.push({
          messageId: doc.id,
          filename,
          status: 'failed',
          error: `Update failed: ${updateError.message}`
        });
        continue;
      }

      console.log('[Redownload] Successfully processed:', doc.id);
      results.push({
        messageId: doc.id,
        filename,
        status: 'success',
        mediaUrl
      });

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Summary
    const summary = {
      processed: results.length,
      success: results.filter(r => r.status === 'success').length,
      failed: results.filter(r => r.status === 'failed').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      results
    };

    console.log('[Redownload] Completed:', summary.success, 'success,', summary.failed, 'failed,', summary.skipped, 'skipped');

    return new Response(
      JSON.stringify(summary),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Redownload] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
