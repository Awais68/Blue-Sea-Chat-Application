import { getSocket } from "./socket";

/**
 * WebRTC configuration
 */
const rtcConfig = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

/**
 * WebRTC Manager class to handle peer connections
 */
class WebRTCManager {
  constructor() {
    this.peerConnections = new Map();
    this.localStream = null;
    this.remoteStreams = new Map();
  }

  /**
   * Get user media (audio/video)
   */
  async getUserMedia(constraints) {
    try {
      console.log("🎥 Requesting user media with constraints:", constraints);
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log(
        "✅ User media obtained:",
        this.localStream
          .getTracks()
          .map((t) => ({ kind: t.kind, enabled: t.enabled }))
      );
      return this.localStream;
    } catch (error) {
      console.error("❌ Error accessing media devices:", error);
      throw error;
    }
  }

  /**
   * Create peer connection
   */
  createPeerConnection(userId, onRemoteStream, onIceCandidate) {
    console.log("🔧 Creating peer connection for user:", userId);
    const peerConnection = new RTCPeerConnection(rtcConfig);

    // Add local stream tracks to peer connection
    if (this.localStream) {
      console.log(
        "➕ Adding local tracks to peer connection:",
        this.localStream.getTracks().map((t) => t.kind)
      );
      this.localStream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, this.localStream);
      });
    } else {
      console.warn(
        "⚠️ No local stream available when creating peer connection"
      );
    }

    // Handle remote stream
    peerConnection.ontrack = (event) => {
      console.log("📥 ontrack event received from user:", userId);
      console.log(
        "Track details:",
        event.track.kind,
        "enabled:",
        event.track.enabled
      );
      const [remoteStream] = event.streams;
      console.log(
        "Remote stream tracks:",
        remoteStream
          .getTracks()
          .map((t) => ({ kind: t.kind, enabled: t.enabled }))
      );
      this.remoteStreams.set(userId, remoteStream);
      if (onRemoteStream) {
        onRemoteStream(remoteStream, userId);
      }
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate && onIceCandidate) {
        onIceCandidate(event.candidate, userId);
      }
    };

    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
      console.log(
        `🔗 Connection state (${userId}):`,
        peerConnection.connectionState
      );
      if (peerConnection.connectionState === "connected") {
        console.log("✅ Peer connection established successfully!");
      }
    };

    this.peerConnections.set(userId, peerConnection);
    return peerConnection;
  }

  /**
   * Create and send offer
   */
  async createOffer(userId, onRemoteStream, onIceCandidate) {
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
      await peerConnection.setLocalDescription(offer);
      return offer;
    } catch (error) {
      console.error("Error creating offer:", error);
      throw error;
    }
  }

  /**
   * Handle incoming offer and create answer
   */
  async handleOffer(userId, offer, onRemoteStream, onIceCandidate) {
    const peerConnection = this.createPeerConnection(
      userId,
      onRemoteStream,
      onIceCandidate
    );

    try {
      await peerConnection.setRemoteDescription(
        new RTCSessionDescription(offer)
      );
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      return answer;
    } catch (error) {
      console.error("Error handling offer:", error);
      throw error;
    }
  }

  /**
   * Handle incoming answer
   */
  async handleAnswer(userId, answer) {
    const peerConnection = this.peerConnections.get(userId);
    if (peerConnection) {
      try {
        await peerConnection.setRemoteDescription(
          new RTCSessionDescription(answer)
        );
      } catch (error) {
        console.error("Error handling answer:", error);
        throw error;
      }
    }
  }

  /**
   * Handle incoming ICE candidate
   */
  async handleIceCandidate(userId, candidate) {
    const peerConnection = this.peerConnections.get(userId);
    if (peerConnection) {
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error("Error adding ICE candidate:", error);
      }
    }
  }

  /**
   * Close peer connection
   */
  closePeerConnection(userId) {
    const peerConnection = this.peerConnections.get(userId);
    if (peerConnection) {
      peerConnection.close();
      this.peerConnections.delete(userId);
      this.remoteStreams.delete(userId);
    }
  }

  /**
   * Close all peer connections
   */
  closeAllConnections() {
    this.peerConnections.forEach((pc) => pc.close());
    this.peerConnections.clear();
    this.remoteStreams.clear();
  }

  /**
   * Stop local stream
   */
  stopLocalStream() {
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }
  }

  /**
   * Toggle audio
   */
  toggleAudio(enabled) {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = enabled;
      });
    }
  }

  /**
   * Toggle video
   */
  toggleVideo(enabled) {
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach((track) => {
        track.enabled = enabled;
      });
    }
  }
}

/**
 * Setup WebRTC signaling with Socket.IO
 */
export const setupWebRTCSignaling = (
  webrtcManager,
  currentUserId,
  onRemoteStream
) => {
  const socket = getSocket();
  if (!socket) return;

  // Listen for WebRTC offer
  socket.on("webrtc-offer", async ({ offer, fromUserId }) => {
    console.log("📥 Received WebRTC offer from:", fromUserId);
    try {
      const answer = await webrtcManager.handleOffer(
        fromUserId,
        offer,
        onRemoteStream,
        (candidate, userId) => {
          socket.emit("webrtc-ice-candidate", {
            candidate,
            targetUserId: userId,
          });
        }
      );

      console.log("📤 Sending WebRTC answer to:", fromUserId);
      socket.emit("webrtc-answer", { answer, targetUserId: fromUserId });
    } catch (error) {
      console.error("Error handling offer:", error);
    }
  });

  // Listen for WebRTC answer
  socket.on("webrtc-answer", async ({ answer, fromUserId }) => {
    console.log("📥 Received WebRTC answer from:", fromUserId);
    try {
      await webrtcManager.handleAnswer(fromUserId, answer);
      console.log("✅ Answer processed successfully");
    } catch (error) {
      console.error("Error handling answer:", error);
    }
  });

  // Listen for ICE candidates
  socket.on("webrtc-ice-candidate", async ({ candidate, fromUserId }) => {
    console.log("❄️ Received ICE candidate from:", fromUserId);
    try {
      await webrtcManager.handleIceCandidate(fromUserId, candidate);
    } catch (error) {
      console.error("Error handling ICE candidate:", error);
    }
  });
};

export default WebRTCManager;
