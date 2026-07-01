import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Read WhatsApp config (never return the token itself)
    const { data: settings } = await supabase
      .from('nina_settings')
      .select('whatsapp_phone_number_id, whatsapp_access_token, whatsapp_token_in_vault')
      .limit(1)
      .maybeSingle()

    const phone_configured = !!settings?.whatsapp_phone_number_id

    let token_present = !!(settings?.whatsapp_access_token && String(settings.whatsapp_access_token).trim().length > 0)

    // Fallback: check the vault if flagged or not found on the table
    if (!token_present) {
      try {
        const { data: vaultHas } = await supabase.rpc('has_vault_secret', {
          secret_name: 'vault_whatsapp_token',
        })
        if (vaultHas === true) token_present = true
      } catch (_e) {
        // ignore vault check errors
      }
    }

    // Count messages stuck in the send queue
    const { count: pending_count } = await supabase
      .from('send_queue')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')

    let oldest_pending_at: string | null = null
    if ((pending_count ?? 0) > 0) {
      const { data: oldest } = await supabase
        .from('send_queue')
        .select('created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      oldest_pending_at = oldest?.created_at ?? null
    }

    const connected = phone_configured && token_present

    return new Response(
      JSON.stringify({
        connected,
        phone_configured,
        token_present,
        pending_count: pending_count ?? 0,
        oldest_pending_at,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error) {
    console.error('[whatsapp-connection-status] error', error)
    return new Response(
      JSON.stringify({
        connected: false,
        phone_configured: false,
        token_present: false,
        pending_count: 0,
        oldest_pending_at: null,
        error: String((error as Error)?.message ?? error),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  }
})
