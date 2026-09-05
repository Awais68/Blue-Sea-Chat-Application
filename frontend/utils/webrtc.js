import { getSocket } from "./socket";

/**
 * WebRTC configuration with multiple STUN/TURN servers
 * IMPORTANT: For production, add your own TURN servers for better NAT traversal
 */
const rtcConfig = {
  iceServers: [
    // Google STUN servers
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
    
    // Additional public STUN servers for redundancy
    { urls: "stun:stun.services.mozilla.com" },
    
    // TURN server examples (replace with your own for production)
    // Uncomment and configure with your TURN server credentials
    // {
    //   urls: "turn:your-turn-server.com:3478",
    //   username: "your-username",
    //   credential: "your-password"
    // },
    // {
    //   urls: "turns:your-turn-server.com:5349",
    //   username: "your-username",
    //   credential: "your-password"
    // }
  ],
  iceCandidatePoolSize: 10, // Pre-gather ICE candidates
  bundlePolicy: "max-bundle", // Bundle all media into one connection
  rtcpMuxPolicy: "require", // Multiplex RTP and RTCP
};

/**
 * Optimal media constraints for audio and video
 */
const MEDIA_CONSTRAINTS = {
  audio: {
    // High-quality audio settings
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    sampleRate: 48000,
    channelCount: 1,
    volume: 1.0,
  },
  video: {
    // HD video settings with fallback
    width: { ideal: 1280, min: 640 },
    height: { ideal: 720, min: 480 },
    aspectRatio: 16 / 9,
    frameRate: { ideal: 30, min: 15 },
    facingMode: "user", // Front camera for video calls
  },
};

/**
 * WebRTC Manager class to handle peer connections
 * Enhanced with better audio/video handling and error recovery
 */
class WebRTCManager {
  constructor() {
    this.peerConnections = new Map(); // userId -> RTCPeerConnection
    this.localStream = null;
    this.remoteStreams = new Map(); // userId -> MediaStream
    this.pendingIceCandidates = new Map(); // userId -> [candidates]
    this.callId = null;
  }

  /**
   * Get user media (audio/video) with optimized constraints
   * @param {Object} constraints - Media constraints override
   * @returns {Promise<MediaStream>} Local media stream
   */
  async getUserMedia(constraints = {}) {
    try {
      // Determine if this is audio-only or video call
      const isVideoCall = constraints.video !== false && constraints.video !== undefined;
      
      const finalConstraints = {
        audio: constraints.audio !== false ? {
          ...MEDIA_CONSTRAINTS.audio,
          ...(typeof constraints.audio === 'object' ? constraints.audio : {})
        } : false,
        video: isVideoCall ? {
          ...MEDIA_CONSTRAINTS.video,
          ...(typeof constraints.video === 'object' ? constraints.video : {})
        } : false
      };

      console.log("🎥 [getUserMedia] Requesting media with constraints:", JSON.stringify(finalConstraints, null, 2));
      
      this.localStream = await navigator.mediaDevices.getUserMedia(finalConstraints);
      
      console.log("✅ [getUserMedia] Success! Tracks:", 
        this.localStream.getTracks().map((t) => ({
          kind: t.kind,
          enabled: t.enabled,
          muted: t.muted,
          readyState: t.readyState,
          label: t.label
        }))
      );
      
      // Ensure audio tracks are unmuted and enabled
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = true;
        console.log(`🎤 Audio track ${track.label}: enabled=${track.enabled}, muted=${track.muted}`);
      });
      
      // Ensure video tracks are enabled for video calls
      if (isVideoCall) {
        this.localStream.getVideoTracks().forEach(track => {
          track.enabled = true;
          console.log(`📹 Video track ${track.label}: enabled=${track.enabled}`);
        });
      }
      
      return this.localStream;
      
    } catch (error) {
      console.error("❌ [getUserMedia] Error:", error.name, error.message);
      
      // Provide user-friendly error messages
      if (error.name === "NotAllowedError") {
        throw new Error("Camera/microphone permission denied. Please allow access in browser settings.");
      } else if (error.name === "NotFoundError") {
        throw new Error("No camera or microphone found. Please connect a device.");
      } else if (error.name === "NotReadableError") {
        throw new Error("Camera/microphone is already in use by another application.");
      } else if (error.name === "OverconstrainedError") {
        throw new Error("Could not satisfy media constraints. Trying with lower quality...");
      } else {
        throw new Error(`Media access error: ${error.message}`);
      }
    }
  }

  /**
   * Create peer connection with enhanced monitoring and error handling
   * @param {string} userId - Remote user ID
   * @param {Function} onRemoteStream - Callback when remote stream is received
   * @param {Function} onIceCandidate - Callback when ICE candidate is generated
   * @returns {RTCPeerConnection} Peer connection instance
   */
  createPeerConnection(userId, onRemoteStream, onIceCandidate) {
    console.log("🔧 [createPeerConnection] Creating for user:", userId);
    
    const peerConnection = new RTCPeerConnection(rtcConfig);

    // Add local stream tracks to peer connection
    if (this.localStream) {
      const tracks = this.localStream.getTracks();
      console.log(`➕ [createPeerConnection] Adding ${tracks.length} local tracks:`, 
        tracks.map(t => `${t.kind}(${t.enabled})`)
      );
      
      tracks.forEach((track) => {
        const sender = peerConnection.addTrack(track, this.localStream);
        console.log(`   ✓ Added ${track.kind} track, sender:`, sender);
      });
    } else {
      console.warn("⚠️ [createPeerConnection] No local stream available!");
    }

    // Handle remote stream - CRITICAL FOR AUDIO/VIDEO
    peerConnection.ontrack = (event) => {
      console.log("📥 [ontrack] Received from:", userId);
      console.log("   Track:", event.track.kind, "enabled:", event.track.enabled, "muted:", event.track.muted);
      console.log("   Streams:", event.streams.length);
      
      if (event.streams && event.streams[0]) {
        const remoteStream = event.streams[0];
        
        console.log("   Remote stream tracks:", 
          remoteStream.getTracks().map(t => ({
            kind: t.kind,
            enabled: t.enabled,
            muted: t.muted,
            readyState: t.readyState
          }))
        );
        
        // Store remote stream
        this.remoteStreams.set(userId, remoteStream);
        
        // Ensure audio tracks are enabled
        remoteStream.getAudioTracks().forEach(track => {
          track.enabled = true;
          console.log(`   🔊 Remote audio track: ${track.label}, enabled: ${track.enabled}`);
        });
        
        // Ensure video tracks are enabled
        remoteStream.getVideoTracks().forEach(track => {
          track.enabled = true;
          console.log(`   📹 Remote video track: ${track.label}, enabled: ${track.enabled}`);
        });
        
        // Call the callback
        if (onRemoteStream) {
          onRemoteStream(remoteStream, userId);
        }
      }
    };

    // Handle ICE candidates - CRITICAL FOR CONNECTION
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`❄️ [onicecandidate] New ICE candidate for ${userId}:`, 
          event.candidate.type, event.candidate.protocol
        );
        if (onIceCandidate) {
          onIceCandidate(event.candidate, userId);
        }
      } else {
        console.log(`❄️ [onicecandidate] ICE gathering complete for ${userId}`);
      }
    };

    // Handle ICE connection state changes
    peerConnection.oniceconnectionstatechange = () => {
      console.log(`❄️ [ICE Connection State] ${userId}:`, peerConnection.iceConnectionState);
      
      if (peerConnection.iceConnectionState === "failed") {
        console.error("❌ ICE connection failed! Attempting ICE restart...");
        peerConnection.restartIce();
      } else if (peerConnection.iceConnectionState === "disconnected") {
        console.warn("⚠️ ICE connection disconnected");
      } else if (peerConnection.iceConnectionState === "connected") {
        console.log("✅ ICE connection established!");
      }
    };

    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
      console.log(`🔗 [Connection State] ${userId}:`, peerConnection.connectionState);
      
      if (peerConnection.connectionState === "connected") {
        console.log("✅ Peer connection fully established!");
      } else if (peerConnection.connectionState === "failed") {
        console.error("❌ Peer connection failed!");
      } else if (peerConnection.connectionState === "disconnected") {
        console.warn("⚠️ Peer connection disconnected");
      }
    };

    // Handle signaling state changes
    peerConnection.onsignalingstatechange = () => {
      console.log(`📡 [Signaling State] ${userId}:`, peerConnection.signalingState);
    };

    // Handle negotiation needed
    peerConnection.onnegotiationneeded = () => {
      console.log(`🔄 [Negotiation Needed] ${userId}`);
    };

    this.peerConnections.set(userId, peerConnection);
    return peerConnection;
  }

  /**
   * Create and send offer
   * Enhanced with better SDP handling
   * @param {string} userId - Remote user ID
   * @param {Function} onRemoteStream - Callback for remote stream
   * @param {Function} onIceCandidate - Callback for ICE candidates
   * @returns {Promise<RTCSessionDescriptionInit>} SDP offer
   */
  async createOffer(userId, onRemoteStream, onIceCandidate) {
    console.log("📤 [createOffer] Creating offer for:", userId);
    
    const peerConnection = this.createPeerConnection(
      userId,
      onRemoteStream,
      onIceCandidate
    );

    try {
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      
      console.log("   Offer created, type:", offer.type);
      await peerConnection.setLocalDescription(offer);
      console.log("   Local description set");
      
      return offer;
    } catch (error) {
      console.error("❌ [createOffer] Error:", error);
      throw error;
    }
  }

  /**
   * Handle incoming offer and create answer
   * Enhanced with better error handling
   * @param {string} userId - Remote user ID
   * @param {RTCSessionDescriptionInit} offer - SDP offer
   * @param {Function} onRemoteStream - Callback for remote stream
   * @param {Function} onIceCandidate - Callback for ICE candidates
   * @returns {Promise<RTCSessionDescriptionInit>} SDP answer
   */
  async handleOffer(userId, offer, onRemoteStream, onIceCandidate) {
    console.log("📥 [handleOffer] Handling offer from:", userId);
    
    const peerConnection = this.createPeerConnection(
      userId,
      onRemoteStream,
      onIceCandidate
    );

    try {
      console.log("   Setting remote description (offer)");
      await peerConnection.setRemoteDescription(
        new RTCSessionDescription(offer)
      );
      
      // Add any pending ICE candidates now that remote description is set
      if (this.pendingIceCandidates.has(userId)) {
        const candidates = this.pendingIceCandidates.get(userId);
        console.log(`   Adding ${candidates.length} pending ICE candidates`);
        for (const candidate of candidates) {
          try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (e) {
            console.warn("   Failed to add ICE candidate:", e);
          }
        }
        this.pendingIceCandidates.delete(userId);
      }
      
      console.log("   Creating answer");
      const answer = await peerConnection.createAnswer();
      
      console.log("   Setting local description (answer)");
      await peerConnection.setLocalDescription(answer);
      
      console.log("✅ [handleOffer] Answer created successfully");
      return answer;
    } catch (error) {
      console.error("❌ [handleOffer] Error:", error);
      throw error;
    }
  }

  /**
   * Handle incoming answer
   * Enhanced with better error handling and pending candidates
   * @param {string} userId - Remote user ID
   * @param {RTCSessionDescriptionInit} answer - SDP answer
   */
  async handleAnswer(userId, answer) {
    console.log("📥 [handleAnswer] Handling answer from:", userId);
    
    const peerConnection = this.peerConnections.get(userId);
    if (!peerConnection) {
      console.error("❌ [handleAnswer] No peer connection found for:", userId);
      return;
    }

    try {
      console.log("   Current signaling state:", peerConnection.signalingState);
      
      if (peerConnection.signalingState === "have-local-offer") {
        await peerConnection.setRemoteDescription(
          new RTCSessionDescription(answer)
        );
        console.log("✅ [handleAnswer] Remote description set");
        
        // Add any pending ICE candidates
        if (this.pendingIceCandidates.has(userId)) {
          const candidates = this.pendingIceCandidates.get(userId);
          console.log(`   Adding ${candidates.length} pending ICE candidates`);
          for (const candidate of candidates) {
            try {
              await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (e) {
              console.warn("   Failed to add ICE candidate:", e);
            }
          }
          this.pendingIceCandidates.delete(userId);
        }
      } else {
        console.warn("⚠️ [handleAnswer] Unexpected signaling state:", peerConnection.signalingState);
      }
    } catch (error) {
      console.error("❌ [handleAnswer] Error:", error);
      throw error;
    }
  }

  /**
   * Handle incoming ICE candidate
   * Enhanced with pending candidates queue for early arrivals
   * @param {string} userId - Remote user ID
   * @param {RTCIceCandidateInit} candidate - ICE candidate
   */
  async handleIceCandidate(userId, candidate) {
    const peerConnection = this.peerConnections.get(userId);
    
    if (peerConnection && peerConnection.remoteDescription) {
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        console.log(`❄️ [handleIceCandidate] Added ICE candidate for ${userId}`);
      } catch (error) {
        console.error("❌ [handleIceCandidate] Error adding candidate:", error);
      }
    } else {
      // Queue candidate if remote description not set yet
      console.log(`❄️ [handleIceCandidate] Queueing ICE candidate for ${userId} (no remote description yet)`);
      if (!this.pendingIceCandidates.has(userId)) {
        this.pendingIceCandidates.set(userId, []);
      }
      this.pendingIceCandidates.get(userId).push(candidate);
    }
  }

  /**
   * Close peer connection for a specific user
   * @param {string} userId - Remote user ID
   */
  closePeerConnection(userId) {
    console.log("🔌 [closePeerConnection] Closing connection for:", userId);
    
    const peerConnection = this.peerConnections.get(userId);
    if (peerConnection) {
      peerConnection.close();
      this.peerConnections.delete(userId);
      console.log("   Peer connection closed");
    }
    
    if (this.remoteStreams.has(userId)) {
      const stream = this.remoteStreams.get(userId);
      stream.getTracks().forEach(track => track.stop());
      this.remoteStreams.delete(userId);
      console.log("   Remote stream stopped");
    }
    
    if (this.pendingIceCandidates.has(userId)) {
      this.pendingIceCandidates.delete(userId);
      console.log("   Pending ICE candidates cleared");
    }
  }

  /**
   * Close all peer connections
   */
  closeAllConnections() {
    console.log("🔌 [closeAllConnections] Closing all connections");
    
    this.peerConnections.forEach((pc, userId) => {
      console.log(`   Closing connection for ${userId}`);
      pc.close();
    });
    this.peerConnections.clear();
    
    this.remoteStreams.forEach((stream, userId) => {
      console.log(`   Stopping remote stream for ${userId}`);
      stream.getTracks().forEach(track => track.stop());
    });
    this.remoteStreams.clear();
    
    this.pendingIceCandidates.clear();
  }

  /**
   * Stop local stream and release media devices
   */
  stopLocalStream() {
    if (this.localStream) {
      console.log("🛑 [stopLocalStream] Stopping local stream");
      this.localStream.getTracks().forEach((track) => {
        console.log(`   Stopping ${track.kind} track: ${track.label}`);
        track.stop();
      });
      this.localStream = null;
    }
  }

  /**
   * Toggle audio track enabled state
   * @param {boolean} enabled - Enable or disable audio
   */
  toggleAudio(enabled) {
    if (!this.localStream) return false;

    const tracks = this.localStream.getAudioTracks();
    // With no argument, flip the current state
    const next =
      typeof enabled === "boolean" ? enabled : !(tracks[0]?.enabled ?? false);

    tracks.forEach((track) => {
      track.enabled = next;
    });
    console.log(`🎤 [toggleAudio] Audio ${next ? "enabled" : "disabled"}`);
    return next;
  }

  /**
   * Toggle video track enabled state
   * @param {boolean} enabled - Enable or disable video
   */
  toggleVideo(enabled) {
    if (!this.localStream) return false;

    const tracks = this.localStream.getVideoTracks();
    const next =
      typeof enabled === "boolean" ? enabled : !(tracks[0]?.enabled ?? false);

    tracks.forEach((track) => {
      track.enabled = next;
    });
    console.log(`📹 [toggleVideo] Video ${next ? "enabled" : "disabled"}`);
    return next;
  }

  /**
   * Get connection statistics for debugging
   * @param {string} userId - Remote user ID
   * @returns {Promise<Object>} Connection statistics
   */
  async getConnectionStats(userId) {
    const peerConnection = this.peerConnections.get(userId);
    if (!peerConnection) return null;

    const stats = await peerConnection.getStats();
    const result = {
      ice: peerConnection.iceConnectionState,
      connection: peerConnection.connectionState,
      signaling: peerConnection.signalingState,
      candidates: [],
      tracks: []
    };

    stats.forEach(report => {
      if (report.type === 'candidate-pair' && report.state === 'succeeded') {
        result.candidates.push({
          local: report.localCandidateId,
          remote: report.remoteCandidateId,
          bytesReceived: report.bytesReceived,
          bytesSent: report.bytesSent
        });
      } else if (report.type === 'inbound-rtp') {
        result.tracks.push({
          kind: report.kind,
          packetsReceived: report.packetsReceived,
          packetsLost: report.packetsLost,
          bytesReceived: report.bytesReceived
        });
      }
    });

    return result;
  }
}

/**
 * Setup WebRTC signaling with Socket.IO
 * Enhanced with call ID tracking and better error handling
 * @param {WebRTCManager} webrtcManager - WebRTC manager instance
 * @param {string} currentUserId - Current user ID
 * @param {Function} onRemoteStream - Callback when remote stream is received
 */
export const setupWebRTCSignaling = (
  webrtcManager,
  currentUserId,
  onRemoteStream
) => {
  const socket = getSocket();
  if (!socket) {
    console.error("❌ [setupWebRTCSignaling] No socket connection");
    return;
  }

  console.log("📡 [setupWebRTCSignaling] Setting up signaling for user:", currentUserId);

  // Drop handlers from a previous setup so listeners do not stack up
  socket.off("webrtc-offer");
  socket.off("webrtc-answer");
  socket.off("webrtc-ice-candidate");

  // Listen for WebRTC offer
  socket.on("webrtc-offer", async ({ offer, fromUserId, callId, roomId }) => {
    console.log("📥 [webrtc-offer] From:", fromUserId, "CallID:", callId);
    
    try {
      webrtcManager.callId = callId;
      
      const answer = await webrtcManager.handleOffer(
        fromUserId,
        offer,
        onRemoteStream,
        (candidate, userId) => {
          console.log("❄️ Sending ICE candidate to:", userId);
          socket.emit("webrtc-ice-candidate", {
            candidate,
            targetUserId: userId,
            callId
          });
        }
      );

      console.log("📤 [webrtc-answer] Sending to:", fromUserId);
      socket.emit("webrtc-answer", { 
        answer, 
        targetUserId: fromUserId,
        callId 
      });
      
    } catch (error) {
      console.error("❌ [webrtc-offer] Error handling offer:", error);
      socket.emit("call-error", { 
        targetUserId: fromUserId, 
        callId,
        error: error.message 
      });
    }
  });

  // Listen for WebRTC answer
  socket.on("webrtc-answer", async ({ answer, fromUserId, callId }) => {
    console.log("📥 [webrtc-answer] From:", fromUserId, "CallID:", callId);
    
    try {
      await webrtcManager.handleAnswer(fromUserId, answer);
      console.log("✅ [webrtc-answer] Answer processed successfully");
      
    } catch (error) {
      console.error("❌ [webrtc-answer] Error handling answer:", error);
    }
  });

  // Listen for ICE candidates
  socket.on("webrtc-ice-candidate", async ({ candidate, fromUserId, callId }) => {
    console.log("❄️ [webrtc-ice-candidate] From:", fromUserId);
    
    try {
      await webrtcManager.handleIceCandidate(fromUserId, candidate);
    } catch (error) {
      console.error("❌ [webrtc-ice-candidate] Error:", error);
    }
  });

  console.log("✅ [setupWebRTCSignaling] Signaling setup complete");
};

/**
 * Helper function to diagnose WebRTC connection issues
 * @param {WebRTCManager} webrtcManager - WebRTC manager instance
 * @param {string} userId - User ID to diagnose
 */
export const diagnoseConnection = async (webrtcManager, userId) => {
  console.log("🔍 [diagnoseConnection] Diagnosing connection for:", userId);
  
  const stats = await webrtcManager.getConnectionStats(userId);
  if (stats) {
    console.log("   ICE State:", stats.ice);
    console.log("   Connection State:", stats.connection);
    console.log("   Signaling State:", stats.signaling);
    console.log("   Active Candidates:", stats.candidates.length);
    console.log("   Tracks:", stats.tracks);
  }
  
  const pc = webrtcManager.peerConnections.get(userId);
  if (pc) {
    console.log("   Local Description:", pc.localDescription?.type);
    console.log("   Remote Description:", pc.remoteDescription?.type);
  }
  
  if (webrtcManager.localStream) {
    console.log("   Local Stream Tracks:");
    webrtcManager.localStream.getTracks().forEach(track => {
      console.log(`      ${track.kind}: enabled=${track.enabled}, muted=${track.muted}, readyState=${track.readyState}`);
    });
  }
  
  const remoteStream = webrtcManager.remoteStreams.get(userId);
  if (remoteStream) {
    console.log("   Remote Stream Tracks:");
    remoteStream.getTracks().forEach(track => {
      console.log(`      ${track.kind}: enabled=${track.enabled}, muted=${track.muted}, readyState=${track.readyState}`);
    });
  }
};

export default WebRTCManager;
