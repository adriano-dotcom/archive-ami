import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
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


  console.log('[CleanupQueues] Starting queue cleanup...');

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Execute cleanup_processed_queues (removes completed >24h, failed >7d from nina_processing_queue and send_queue)
    console.log('[CleanupQueues] Running cleanup_processed_queues...');
    const { error: cleanupError1 } = await supabase.rpc('cleanup_processed_queues');
    if (cleanupError1) {
      console.error('[CleanupQueues] Error in cleanup_processed_queues:', cleanupError1);
    } else {
      console.log('[CleanupQueues] cleanup_processed_queues completed successfully');
    }

    // Execute cleanup_processed_message_queue (removes processed >1h from message_grouping_queue)
    console.log('[CleanupQueues] Running cleanup_processed_message_queue...');
    const { error: cleanupError2 } = await supabase.rpc('cleanup_processed_message_queue');
    if (cleanupError2) {
      console.error('[CleanupQueues] Error in cleanup_processed_message_queue:', cleanupError2);
    } else {
      console.log('[CleanupQueues] cleanup_processed_message_queue completed successfully');
    }

    // Execute cleanup_rate_limit_hits (removes rate-limit buckets >1h)
    const { error: cleanupError3 } = await supabase.rpc('cleanup_rate_limit_hits');
    if (cleanupError3) {
      console.error('[CleanupQueues] Error in cleanup_rate_limit_hits:', cleanupError3);
    } else {
      console.log('[CleanupQueues] cleanup_rate_limit_hits completed successfully');
    }

    // Reset stuck processing items (processing for more than 5 minutes)
    console.log('[CleanupQueues] Checking for stuck processing items...');
    const stuckThreshold = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5 minutes ago
    
    const { data: stuckItems, error: stuckError } = await supabase
      .from('nina_processing_queue')
      .update({ 
        status: 'pending',
        error_message: 'Reset from stuck processing state',
        scheduled_for: new Date().toISOString()
      })
      .eq('status', 'processing')
      .lt('updated_at', stuckThreshold)
      .select('id, conversation_id');
    
    if (stuckError) {
      console.error('[CleanupQueues] Error resetting stuck items:', stuckError);
    } else if (stuckItems && stuckItems.length > 0) {
      console.warn(`[CleanupQueues] Reset ${stuckItems.length} stuck processing items:`, 
        stuckItems.map(i => i.id));
    } else {
      console.log('[CleanupQueues] No stuck processing items found');
    }

    // Get current queue stats for reporting
    const { data: ninaStats } = await supabase
      .from('nina_processing_queue')
      .select('status', { count: 'exact' });
    
    const { data: sendStats } = await supabase
      .from('send_queue')
      .select('status', { count: 'exact' });
    
    const { data: messageStats } = await supabase
      .from('message_grouping_queue')
      .select('id', { count: 'exact' });

    const stats = {
      nina_processing_queue: ninaStats?.length || 0,
      send_queue: sendStats?.length || 0,
      message_grouping_queue: messageStats?.length || 0,
      cleaned_at: new Date().toISOString()
    };

    console.log('[CleanupQueues] Cleanup completed. Current stats:', stats);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Queue cleanup completed successfully',
        stats
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('[CleanupQueues] Unexpected error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
