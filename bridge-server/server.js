/**
 * WhatsApp Calling — Bridge Server
 *
 * Bridges WebRTC audio between Meta's WhatsApp Cloud API and the agent's browser.
 *
 * Flow:
 *  1. Meta notifies whatsapp-call-webhook (Supabase Edge Function)
 *  2. The webhook POSTs to POST /incoming-call here with { wa_call_id, sdp_offer, ... }
 *  3. This server emits `incoming_call` to all connected agent browsers via Socket.IO
 *  4. An agent accepts → their browser sends an SDP offer to the server via Socket.IO
 *  5. Server creates two RTCPeerConnections (one for Meta, one for the browser) and bridges audio
 *  6. Server calls whatsapp-call-accept edge function passing the SDP answer for Meta
 */

'use strict';

const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const fetch = require('node-fetch');
const cors = require('cors');

// @roamhq/wrtc — server-side WebRTC implementation
const wrtc = require('@roamhq/wrtc');
const { RTCPeerConnection, RTCSessionDescription, RTCIceCandidate } = wrtc;
const { RTCAudioSource, RTCAudioSink } = wrtc.nonstandard;

// ─── Config ──────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || '3001', 10);
const BRIDGE_SECRET = process.env.BRIDGE_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Pending calls waiting for an agent to pick up (wa_call_id -> PendingCall)
const pendingCalls = new Map();

// Active bridged calls (wa_call_id -> ActiveCall)
const activeCalls = new Map();

// ICE servers — add TURN if needed for production
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

// ─── App ─────────────────────────────────────────────────────────────────────

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

app.use(cors());
app.use(express.json());

// ─── Helpers ─────────────────────────────────────────────────────────────────

function validateBridgeSecret(req, res) {
  const provided = req.headers['x-bridge-secret'];
  if (!BRIDGE_SECRET || provided !== BRIDGE_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

async function callEdgeFunction(path, body) {
  const url = `${SUPABASE_URL}/functions/v1/${path}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(`Edge function ${path} failed (${resp.status}): ${data?.error || JSON.stringify(data)}`);
  }
  return data;
}

function cleanupCall(waCallId) {
  const call = activeCalls.get(waCallId);
  if (call) {
    try { call.metaPc.close(); } catch (_) {}
    try { call.browserPc.close(); } catch (_) {}
    activeCalls.delete(waCallId);
  }
  pendingCalls.delete(waCallId);
}

// ─── REST Endpoints ──────────────────────────────────────────────────────────

/**
 * GET /health
 * Health check for Railway / uptime monitors.
 */
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    pending_calls: pendingCalls.size,
    active_calls: activeCalls.size,
  });
});

/**
 * POST /incoming-call
 * Called by the whatsapp-call-webhook Supabase Edge Function when Meta signals an incoming call.
 *
 * Body: {
 *   wa_call_id:     string  — Meta's call ID
 *   sdp_offer:      string  — SDP offer from Meta (optional at this stage; Meta may send it later)
 *   phone_number_id: string — WhatsApp phone number ID
 *   from_number:    string  — caller's WhatsApp number
 *   call_db_id:     string  — UUID of the whatsapp_calls row in Supabase
 * }
 */
app.post('/incoming-call', (req, res) => {
  if (!validateBridgeSecret(req, res)) return;

  const { wa_call_id, sdp_offer, phone_number_id, from_number, call_db_id } = req.body;

  if (!wa_call_id) {
    return res.status(400).json({ error: 'wa_call_id is required' });
  }

  console.log(`[bridge] Incoming call: ${wa_call_id} from ${from_number}`);

  pendingCalls.set(wa_call_id, {
    wa_call_id,
    sdp_offer: sdp_offer || null,
    phone_number_id,
    from_number,
    call_db_id,
    received_at: Date.now(),
  });

  // Notify all connected agents
  io.emit('incoming_call', {
    wa_call_id,
    from_number,
    call_db_id,
    received_at: new Date().toISOString(),
  });

  res.json({ success: true, message: 'Call queued for agent' });
});

/**
 * POST /sdp-offer
 * Called by the whatsapp-call-webhook if Meta's SDP offer arrives in a separate event
 * (some implementations send ringing first, then the SDP offer).
 *
 * Body: { wa_call_id: string, sdp_offer: string }
 */
app.post('/sdp-offer', (req, res) => {
  if (!validateBridgeSecret(req, res)) return;

  const { wa_call_id, sdp_offer } = req.body;
  const pending = pendingCalls.get(wa_call_id);

  if (!pending) {
    return res.status(404).json({ error: 'Call not found' });
  }

  pending.sdp_offer = sdp_offer;
  console.log(`[bridge] SDP offer received for call ${wa_call_id}`);

  // Let the agent's browser know the SDP is ready (in case it was waiting)
  io.emit('call_sdp_ready', { wa_call_id });

  res.json({ success: true });
});

// ─── Socket.IO — Agent Browser ───────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log(`[bridge] Agent connected: ${socket.id}`);

  // ── List pending calls for newly connected agent ──────────────────────────
  socket.emit('pending_calls', Array.from(pendingCalls.values()).map((c) => ({
    wa_call_id: c.wa_call_id,
    from_number: c.from_number,
    call_db_id: c.call_db_id,
    received_at: new Date(c.received_at).toISOString(),
  })));

  // ── Agent accepts the call ─────────────────────────────────────────────────
  // Payload: { wa_call_id, browser_sdp_offer }
  socket.on('accept_call', async ({ wa_call_id, browser_sdp_offer }) => {
    const pending = pendingCalls.get(wa_call_id);
    if (!pending) {
      socket.emit('call_error', { wa_call_id, error: 'Call not found or already handled' });
      return;
    }

    console.log(`[bridge] Agent ${socket.id} accepting call ${wa_call_id}`);
    pendingCalls.delete(wa_call_id);

    // Notify other agents so they stop ringing
    io.emit('call_taken', { wa_call_id });

    try {
      // ── Peer connection: server <-> Meta ───────────────────────────────────
      const metaAudioSource = new RTCAudioSource();
      const metaAudioTrack = metaAudioSource.createTrack();

      const metaPc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      metaPc.addTrack(metaAudioTrack);

      metaPc.onicecandidate = ({ candidate }) => {
        if (candidate) {
          console.log(`[bridge] Meta ICE candidate for call ${wa_call_id}`);
          // If Meta supports trickle ICE, forward here. Otherwise gathered in answer SDP.
        }
      };

      metaPc.onconnectionstatechange = () => {
        console.log(`[bridge] Meta PC state [${wa_call_id}]:`, metaPc.connectionState);
        if (['disconnected', 'failed', 'closed'].includes(metaPc.connectionState)) {
          handleCallEnded(wa_call_id, 'meta_disconnected');
        }
      };

      // ── Peer connection: server <-> browser ───────────────────────────────
      const browserAudioSource = new RTCAudioSource();
      const browserAudioTrack = browserAudioSource.createTrack();

      const browserPc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      browserPc.addTrack(browserAudioTrack);

      browserPc.onicecandidate = ({ candidate }) => {
        if (candidate) {
          socket.emit('ice_candidate', { wa_call_id, candidate: candidate.toJSON() });
        }
      };

      browserPc.onconnectionstatechange = () => {
        console.log(`[bridge] Browser PC state [${wa_call_id}]:`, browserPc.connectionState);
        if (['disconnected', 'failed', 'closed'].includes(browserPc.connectionState)) {
          handleCallEnded(wa_call_id, 'browser_disconnected');
        }
      };

      // ── Audio bridge: Meta track -> browser audio source ──────────────────
      metaPc.ontrack = ({ track }) => {
        console.log(`[bridge] Received audio track from Meta for call ${wa_call_id}`);
        const sink = new RTCAudioSink(track);
        sink.ondata = (data) => browserAudioSource.onData(data);
      };

      // ── Audio bridge: browser track -> Meta audio source ──────────────────
      browserPc.ontrack = ({ track }) => {
        console.log(`[bridge] Received audio track from browser for call ${wa_call_id}`);
        const sink = new RTCAudioSink(track);
        sink.ondata = (data) => metaAudioSource.onData(data);
      };

      // ── Store active call ─────────────────────────────────────────────────
      activeCalls.set(wa_call_id, {
        metaPc,
        browserPc,
        socket,
        pending,
        started_at: Date.now(),
      });

      // ── SDP handshake with browser ────────────────────────────────────────
      await browserPc.setRemoteDescription(
        new RTCSessionDescription({ type: 'offer', sdp: browser_sdp_offer })
      );
      const browserAnswer = await browserPc.createAnswer();
      await browserPc.setLocalDescription(browserAnswer);

      // Send SDP answer to the browser
      socket.emit('call_accepted', {
        wa_call_id,
        sdp_answer: browserAnswer.sdp,
      });

      // ── SDP handshake with Meta ───────────────────────────────────────────
      let metaSdpAnswer = null;

      if (pending.sdp_offer) {
        await metaPc.setRemoteDescription(
          new RTCSessionDescription({ type: 'offer', sdp: pending.sdp_offer })
        );
        const metaAnswer = await metaPc.createAnswer();
        await metaPc.setLocalDescription(metaAnswer);
        metaSdpAnswer = metaAnswer.sdp;
      }

      // ── Notify edge function to accept call with Meta ─────────────────────
      const edgePayload = {
        call_id: pending.call_db_id,
        whatsapp_call_id: wa_call_id,
      };
      if (metaSdpAnswer) edgePayload.sdp_answer = metaSdpAnswer;

      await callEdgeFunction('whatsapp-call-accept', edgePayload);
      console.log(`[bridge] Call ${wa_call_id} bridged successfully`);
    } catch (err) {
      console.error(`[bridge] Error bridging call ${wa_call_id}:`, err);
      cleanupCall(wa_call_id);
      socket.emit('call_error', { wa_call_id, error: err.message });
    }
  });

  // ── ICE candidate from browser ─────────────────────────────────────────────
  socket.on('ice_candidate', async ({ wa_call_id, candidate }) => {
    const call = activeCalls.get(wa_call_id);
    if (!call) return;
    try {
      await call.browserPc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error(`[bridge] ICE candidate error for ${wa_call_id}:`, err.message);
    }
  });

  // ── Agent rejects the call ─────────────────────────────────────────────────
  socket.on('reject_call', async ({ wa_call_id }) => {
    console.log(`[bridge] Agent ${socket.id} rejecting call ${wa_call_id}`);
    const pending = pendingCalls.get(wa_call_id);
    pendingCalls.delete(wa_call_id);

    io.emit('call_rejected', { wa_call_id });

    try {
      await callEdgeFunction('whatsapp-call-reject', {
        call_id: pending?.call_db_id,
        whatsapp_call_id: wa_call_id,
      });
    } catch (err) {
      console.error(`[bridge] reject edge function error for ${wa_call_id}:`, err.message);
    }
  });

  // ── Agent terminates an active call ───────────────────────────────────────
  socket.on('terminate_call', async ({ wa_call_id }) => {
    console.log(`[bridge] Agent ${socket.id} terminating call ${wa_call_id}`);
    await handleCallEnded(wa_call_id, 'user_hangup');
  });

  socket.on('disconnect', () => {
    console.log(`[bridge] Agent disconnected: ${socket.id}`);
  });
});

// ─── Call ended (from any side) ───────────────────────────────────────────────

async function handleCallEnded(waCallId, cause = 'unknown') {
  const call = activeCalls.get(waCallId);
  if (!call) return; // already cleaned up

  console.log(`[bridge] Call ${waCallId} ended — cause: ${cause}`);
  cleanupCall(waCallId);

  io.emit('call_terminated', { wa_call_id: waCallId, cause });

  try {
    await callEdgeFunction('whatsapp-call-terminate', {
      call_id: call.pending.call_db_id,
      whatsapp_call_id: waCallId,
    });
  } catch (err) {
    console.error(`[bridge] terminate edge function error for ${waCallId}:`, err.message);
  }
}

// ─── Cleanup stale pending calls (older than 60 s) ────────────────────────────

setInterval(() => {
  const now = Date.now();
  for (const [waCallId, call] of pendingCalls) {
    if (now - call.received_at > 60_000) {
      console.log(`[bridge] Expiring stale pending call: ${waCallId}`);
      pendingCalls.delete(waCallId);
      io.emit('call_expired', { wa_call_id: waCallId });
      callEdgeFunction('whatsapp-call-reject', { whatsapp_call_id: waCallId }).catch(() => {});
    }
  }
}, 10_000);

// ─── Start ────────────────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log(`[bridge] Server running on port ${PORT}`);
  console.log(`[bridge] Supabase URL: ${SUPABASE_URL}`);
});
