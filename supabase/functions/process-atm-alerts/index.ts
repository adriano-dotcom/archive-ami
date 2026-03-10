import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// This function has been deprecated - ATM alerts are not applicable for OrbePet
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({
      success: true,
      message: 'ATM alerts have been deprecated - not applicable for this platform',
      processed: 0,
      alerts_sent: 0
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
