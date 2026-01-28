import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const DAILY_LIMIT = 10;

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const now = new Date();
    // Início do dia atual (meia-noite)
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    console.log(`[validate-campaign-limit] Checking campaigns since ${todayStart.toISOString()}`);

    // Contar campanhas criadas hoje
    const { count, error } = await supabase
      .from("collection_batches")
      .select("*", { count: "exact", head: true })
      .gte("created_at", todayStart.toISOString());

    if (error) {
      console.error('[validate-campaign-limit] Error counting campaigns:', error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const used = count || 0;
    const remaining = Math.max(0, DAILY_LIMIT - used);
    const allowed = remaining > 0;

    console.log(`[validate-campaign-limit] Used: ${used}, Remaining: ${remaining}, Allowed: ${allowed}`);

    return new Response(
      JSON.stringify({ 
        allowed,
        remaining,
        limit: DAILY_LIMIT,
        used
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );

  } catch (error) {
    console.error('[validate-campaign-limit] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
