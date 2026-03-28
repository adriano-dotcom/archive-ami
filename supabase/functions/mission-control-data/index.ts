import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ALLOWED_VIEWS = [
  'support_tickets',
  'support_daily',
  'support_weekly',
  'reembolsos',
  'reembolsos_daily',
] as const;

type ViewName = typeof ALLOWED_VIEWS[number];

const VIEW_MAP: Record<ViewName, string> = {
  support_tickets: 'orbe_support_tickets_v',
  support_daily: 'orbe_support_daily_metrics_v',
  support_weekly: 'orbe_support_weekly_metrics_v',
  reembolsos: 'orbe_reembolsos_v',
  reembolsos_daily: 'orbe_reembolsos_daily_metrics_v',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate BRIDGE_SECRET
    const authHeader = req.headers.get('Authorization');
    const bridgeSecret = Deno.env.get('BRIDGE_SECRET');

    if (!bridgeSecret) {
      console.error('BRIDGE_SECRET not configured');
      return new Response(
        JSON.stringify({ error: 'Server misconfigured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader?.replace('Bearer ', '');
    if (!token || token !== bridgeSecret) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request
    const { view, limit } = await req.json().catch(() => ({ view: null, limit: null }));

    if (!view || !ALLOWED_VIEWS.includes(view)) {
      return new Response(
        JSON.stringify({
          error: `Invalid view. Use: ${ALLOWED_VIEWS.join(', ')}`,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Query using service role (bypasses RLS)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const viewName = VIEW_MAP[view as ViewName];
    let query = supabase.from(viewName).select('*');

    if (limit && typeof limit === 'number' && limit > 0) {
      query = query.limit(Math.min(limit, 1000));
    }

    const { data, error } = await query;

    if (error) {
      console.error(`Error querying ${viewName}:`, error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        view,
        generated_at: new Date().toISOString(),
        count: data?.length || 0,
        data,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in mission-control-data:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
