import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Get auth token from request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ accepted: false, reason: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create client with user's token to get their info
    const supabaseUser = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });

    // Get user from token
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      console.error('Error getting user:', userError);
      return new Response(
        JSON.stringify({ accepted: false, reason: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userEmail = user.email?.toLowerCase();
    if (!userEmail) {
      return new Response(
        JSON.stringify({ accepted: false, reason: 'User has no email' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing invite acceptance for: ${userEmail}`);

    // Use service role client for admin operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Check if user is already an active team member
    const { data: existingMember } = await supabaseAdmin
      .from('team_members')
      .select('id, status')
      .eq('email', userEmail)
      .single();

    if (existingMember?.status === 'active') {
      console.log(`User ${userEmail} is already an active team member`);
      return new Response(
        JSON.stringify({ accepted: true, message: 'Already active' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check for pending invite
    const { data: pendingInvite, error: inviteError } = await supabaseAdmin
      .from('pending_invites')
      .select('*')
      .eq('email', userEmail)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (inviteError && inviteError.code !== 'PGRST116') {
      console.error('Error checking pending invite:', inviteError);
    }

    // If there's a team member entry (invited status), activate it
    if (existingMember) {
      console.log(`Activating team member: ${userEmail}`);
      
      const { error: updateError } = await supabaseAdmin
        .from('team_members')
        .update({ 
          status: 'active',
          last_active: new Date().toISOString()
        })
        .eq('id', existingMember.id);

      if (updateError) {
        console.error('Error updating team member:', updateError);
        return new Response(
          JSON.stringify({ accepted: false, reason: 'Failed to activate member' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Set user role from pending invite or default to operator
      const role = pendingInvite?.app_role || 'operator';
      
      // Upsert user role
      const { error: roleError } = await supabaseAdmin
        .from('user_roles')
        .upsert({
          user_id: user.id,
          role: role
        }, { onConflict: 'user_id,role' });

      if (roleError) {
        console.error('Error setting user role:', roleError);
        // Don't fail the whole operation for this
      }

      // Delete the pending invite if it exists
      if (pendingInvite) {
        await supabaseAdmin
          .from('pending_invites')
          .delete()
          .eq('id', pendingInvite.id);
      }

      console.log(`Successfully activated ${userEmail} with role ${role}`);
      return new Response(
        JSON.stringify({ accepted: true, role }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // No team member entry exists - check if there's a pending invite to create one
    if (pendingInvite) {
      console.log(`Creating new active team member from invite: ${userEmail}`);
      
      // Create new team member as active
      const { error: insertError } = await supabaseAdmin
        .from('team_members')
        .insert({
          email: userEmail,
          name: user.user_metadata?.full_name || userEmail.split('@')[0],
          status: 'active',
          last_active: new Date().toISOString()
        });

      if (insertError) {
        console.error('Error creating team member:', insertError);
        return new Response(
          JSON.stringify({ accepted: false, reason: 'Failed to create member' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Set user role
      const { error: roleError } = await supabaseAdmin
        .from('user_roles')
        .upsert({
          user_id: user.id,
          role: pendingInvite.app_role || 'operator'
        }, { onConflict: 'user_id,role' });

      if (roleError) {
        console.error('Error setting user role:', roleError);
      }

      // Delete the pending invite
      await supabaseAdmin
        .from('pending_invites')
        .delete()
        .eq('id', pendingInvite.id);

      console.log(`Successfully created and activated ${userEmail}`);
      return new Response(
        JSON.stringify({ accepted: true, role: pendingInvite.app_role }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // No invite found - user is not invited
    console.log(`No invite found for: ${userEmail}`);
    return new Response(
      JSON.stringify({ accepted: false, reason: 'No pending invite found' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ accepted: false, reason: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
