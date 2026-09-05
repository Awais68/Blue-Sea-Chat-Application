import { useState, useEffect, useRef } from "react";
import { getSocket, initiateCall, acceptCall, rejectCall, endCall,
         onIncomingCall, onCallInitiated, onCallAccepted, onCallRejected, 
         onCallEnded, onCallUserOffline, onCallError } from "../utils/socket";
import WebRTCManager, { setupWebRTCSignaling, diagnoseConnection } from "../utils/webrtc";
import { FiPhone, FiVideo, FiMic, FiMicOff, FiVideoOff, FiPhoneOff, FiAlertCircle } from "react-icons/fi";

/**
 * =====================================================
 * COMPREHENSIVE VIDEO/AUDIO CALL COMPONENT
 * =====================================================
 * 
 * Features:
 * - Audio and video calls
 * - Offline user support (calls show when user comes online)
 * - Proper audio routing and volume control
 * - Video track management
 * - Connection monitoring and debugging
 * - Error handling and recovery
 * 
 * Usage:
 * <VideoCall 
 *   currentUser={{ id: userId, username: username }}
 *   targetUser={{ id: targetUserId, username: targetUsername }}
 *   roomId={roomId}
 * />
 */

const VideoCall = ({ currentUser, targetUser, roomId }) => {
  // Call state
  const [inCall, setInCall] = useState(false);
  const [callType, setCallType] = useState(null); // 'audio' or 'video'
  const [callId, setCallId] = useState(null);
  const [callDuration, setCallDuration] = useState(0);
  const [incomingCall, setIncomingCall] = useState(null);
  
  // Media state
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [remoteStreamReady, setRemoteStreamReady] = useState(false);
  
  // Connection state
  const [connectionState, setConnectionState] = useState("new");
  const [error, setError] = useState(null);
  
  // Refs
  const webrtcManagerRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null); // CRITICAL for audio calls
  const callTimerRef = useRef(null);
  const inCallRef = useRef(false);

  // Initialize WebRTC manager
  useEffect(() => {
    webrtcManagerRef.current = new WebRTCManager();
    
    // Setup signaling
    setupWebRTCSignaling(
      webrtcManagerRef.current,
      currentUser.id,
      handleRemoteStream
    );

    console.log("📡 VideoCall component initialized for user:", currentUser.username);

    return () => {
      cleanup();
    };
  }, [currentUser.id]);

  // Setup call event listeners
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    // Incoming call notification
    const handleIncomingCall = (data) => {
      console.log("📞 [VideoCall] Incoming call:", data);
      
      if (!inCallRef.current) {
        setIncomingCall(data);
      } else {
        // Already in a call, reject automatically
        rejectCall(data.callId, data.fromUserId);
      }
    };

    // Call initiated confirmation
    const handleCallInitiated = (data) => {
      console.log("✅ [VideoCall] Call initiated:", data);
      setCallId(data.callId);
      if (webrtcManagerRef.current) webrtcManagerRef.current.callId = data.callId;
    };

    // Call accepted. Only now does the caller create the offer - creating it
    // earlier (on a timer) races the callee's getUserMedia and produces an
    // offer the callee cannot answer yet.
    const handleCallAccepted = async (data) => {
      console.log("✅ [VideoCall] Call accepted:", data);
      const manager = webrtcManagerRef.current;
      if (!manager) return;

      const peerId = data.fromUserId || targetUser?.id;
      if (data.callId) manager.callId = data.callId;

      try {
        const offer = await manager.createOffer(
          peerId,
          handleRemoteStream,
          (candidate, userId) => {
            getSocket()?.emit("webrtc-ice-candidate", {
              candidate,
              targetUserId: userId,
              callId: manager.callId,
            });
          }
        );

        getSocket()?.emit("webrtc-offer", {
          roomId,
          offer,
          targetUserId: peerId,
          callId: manager.callId,
        });
      } catch (error) {
        console.error("❌ [VideoCall] Error creating offer:", error);
        setError("Failed to establish connection");
        cleanup();
      }
    };

    // Call rejected
    const handleCallRejected = (data) => {
      console.log("❌ [VideoCall] Call rejected:", data);
      setError("Call was rejected");
      cleanup();
    };

    // Call ended
    const handleCallEnded = (data) => {
      console.log("📴 [VideoCall] Call ended:", data);
      cleanup();
    };

    // User offline
    const handleUserOffline = (data) => {
      console.log("⚠️ [VideoCall] User offline:", data);
      setError("User is currently offline. Call will be delivered when they come online.");
    };

    // Call error
    const handleCallError = (data) => {
      console.error("❌ [VideoCall] Call error:", data);
      setError(data.message || "An error occurred during the call");
      cleanup();
    };

    onIncomingCall(handleIncomingCall);
    onCallInitiated(handleCallInitiated);
    onCallAccepted(handleCallAccepted);
    onCallRejected(handleCallRejected);
    onCallEnded(handleCallEnded);
    onCallUserOffline(handleUserOffline);
    onCallError(handleCallError);

    return () => {
      // Cleanup listeners handled by removeAllListeners in main component
    };
  }, []);

  // Call duration timer
  useEffect(() => {
    if (inCall) {
      callTimerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
        callTimerRef.current = null;
      }
    }

    return () => {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
      }
    };
  }, [inCall]);

  /**
   * Handle remote stream (CRITICAL for audio/video)
   */
  const handleRemoteStream = (stream, userId) => {
    console.log("📹 [VideoCall] Remote stream received from:", userId);
    console.log("   Tracks:", stream.getTracks().map(t => 
      `${t.kind}: enabled=${t.enabled}, muted=${t.muted}, readyState=${t.readyState}`
    ));

    // Set remote video
    if (remoteVideoRef.current && stream.getVideoTracks().length > 0) {
      remoteVideoRef.current.srcObject = stream;
      remoteVideoRef.current.volume = 0; // Video element doesn't need audio
      remoteVideoRef.current.play()
        .then(() => console.log("✅ Remote video playing"))
        .catch(e => console.log("⚠️ Remote video autoplay blocked:", e));
    }

    // Set remote audio (CRITICAL - separate audio element for reliability)
    if (remoteAudioRef.current) {
      console.log("🔊 [VideoCall] Setting up remote audio element");
      remoteAudioRef.current.srcObject = stream;
      remoteAudioRef.current.volume = 1.0; // Max volume
      remoteAudioRef.current.autoplay = true;
      
      // Explicitly play audio
      remoteAudioRef.current.play()
        .then(() => {
          console.log("✅ Remote audio playing successfully!");
          setRemoteStreamReady(true);
        })
        .catch(e => {
          console.error("⚠️ Remote audio autoplay blocked:", e);
          // User interaction may be required to play audio
          setError("Click anywhere to enable audio");
        });
    }

    setConnectionState("connected");
  };

  /**
   * Start a call (audio or video)
   */
  const startCall = async (type) => {
    try {
      console.log(`📞 [VideoCall] Starting ${type} call to:`, targetUser.username);
      setError(null);
      setCallType(type);

      // Get user media
      const constraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
        },
        video: type === "video" ? {
          width: { ideal: 1280, min: 640 },
          height: { ideal: 720, min: 480 },
          frameRate: { ideal: 30 }
        } : false,
      };

      console.log("🎤 [VideoCall] Requesting media with constraints:", constraints);
      const stream = await webrtcManagerRef.current.getUserMedia(constraints);
      console.log("✅ [VideoCall] Got local stream");

      // Display local video
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.muted = true; // Mute own audio to prevent feedback
        localVideoRef.current.volume = 0;
      }

      setInCall(true);
      inCallRef.current = true;
      setConnectionState("connecting");

      // Initiate call via socket
      initiateCall(roomId, targetUser.id, type, currentUser.username);

      // The offer is created in handleCallAccepted, once the callee has picked
      // up and has its own media ready.

    } catch (error) {
      console.error("❌ [VideoCall] Error starting call:", error);
      setError(error.message || "Failed to access camera/microphone");
      cleanup();
    }
  };

  /**
   * Accept an incoming call
   */
  const handleAcceptCall = async () => {
    if (!incomingCall) return;

    try {
      console.log("✅ [VideoCall] Accepting call from:", incomingCall.username);
      setError(null);
      setCallType(incomingCall.callType);
      setCallId(incomingCall.callId);

      // Get user media
      const constraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
        },
        video: incomingCall.callType === "video" ? {
          width: { ideal: 1280, min: 640 },
          height: { ideal: 720, min: 480 },
          frameRate: { ideal: 30 }
        } : false,
      };

      console.log("🎤 [VideoCall] Requesting media for answer");
      const stream = await webrtcManagerRef.current.getUserMedia(constraints);
      console.log("✅ [VideoCall] Got local stream for answer");

      // Display local video
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.muted = true;
        localVideoRef.current.volume = 0;
      }

      setInCall(true);
      inCallRef.current = true;
      setIncomingCall(null);
      setConnectionState("connecting");

      // Accept call via socket
      webrtcManagerRef.current.callId = incomingCall.callId;
      acceptCall(incomingCall.callId, incomingCall.fromUserId);

      console.log("✅ [VideoCall] Call accepted, waiting for offer...");

    } catch (error) {
      console.error("❌ [VideoCall] Error accepting call:", error);
      setError(error.message || "Failed to accept call");
      handleRejectCall();
    }
  };

  /**
   * Reject an incoming call
   */
  const handleRejectCall = () => {
    if (!incomingCall) return;

    console.log("❌ [VideoCall] Rejecting call from:", incomingCall.username);
    rejectCall(incomingCall.callId, incomingCall.fromUserId);
    setIncomingCall(null);
  };

  /**
   * End the current call
   */
  const handleEndCall = () => {
    console.log("📴 [VideoCall] Ending call");
    
    if (callId) {
      endCall(callId, roomId, targetUser.id, callDuration);
    }
    
    cleanup();
  };

  /**
   * Toggle audio on/off
   */
  const toggleAudio = () => {
    const newState = !audioEnabled;
    webrtcManagerRef.current.toggleAudio(newState);
    setAudioEnabled(newState);
    console.log(`🎤 Audio ${newState ? 'enabled' : 'disabled'}`);
  };

  /**
   * Toggle video on/off
   */
  const toggleVideo = () => {
    const newState = !videoEnabled;
    webrtcManagerRef.current.toggleVideo(newState);
    setVideoEnabled(newState);
    console.log(`📹 Video ${newState ? 'enabled' : 'disabled'}`);
  };

  /**
   * Cleanup function
   */
  const cleanup = () => {
    console.log("🧹 [VideoCall] Cleaning up");
    
    setInCall(false);
    inCallRef.current = false;
    setCallType(null);
    setCallId(null);
    setCallDuration(0);
    setRemoteStreamReady(false);
    setConnectionState("new");
    setAudioEnabled(true);
    setVideoEnabled(true);

    if (webrtcManagerRef.current) {
      webrtcManagerRef.current.closeAllConnections();
      webrtcManagerRef.current.stopLocalStream();
    }

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }

    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }
  };

  /**
   * Format call duration
   */
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  /**
   * Diagnose connection (for debugging)
   */
  const handleDiagnose = async () => {
    if (webrtcManagerRef.current && targetUser.id) {
      await diagnoseConnection(webrtcManagerRef.current, targetUser.id);
    }
  };

  return (
    <div className="video-call-container">
      {/* Error display */}
      {error && (
        <div className="error-banner" onClick={() => setError(null)}>
          <FiAlertCircle /> {error}
        </div>
      )}

      {/* Incoming call modal */}
      {incomingCall && (
        <div className="incoming-call-modal">
          <div className="modal-content">
            <h3>📞 Incoming {incomingCall.callType} call</h3>
            <p>from <strong>{incomingCall.username}</strong></p>
            <div className="call-actions">
              <button className="accept-btn" onClick={handleAcceptCall}>
                <FiPhone /> Accept
              </button>
              <button className="reject-btn" onClick={handleRejectCall}>
                <FiPhoneOff /> Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Call controls - show when not in call */}
      {!inCall && !incomingCall && (
        <div className="call-buttons">
          <button 
            className="audio-call-btn" 
            onClick={() => startCall("audio")}
            title="Start audio call"
          >
            <FiPhone /> Audio Call
          </button>
          <button 
            className="video-call-btn" 
            onClick={() => startCall("video")}
            title="Start video call"
          >
            <FiVideo /> Video Call
          </button>
        </div>
      )}

      {/* Active call UI */}
      {inCall && (
        <div className="active-call">
          <div className="call-header">
            <span className="call-info">
              {callType === "video" ? "📹" : "🎤"} {targetUser.username}
            </span>
            <span className="call-duration">{formatDuration(callDuration)}</span>
            <span className="connection-state">{connectionState}</span>
          </div>

          {/* Video container */}
          <div className="video-container">
            {/* Remote video/audio */}
            <div className="remote-video-wrapper">
              {callType === "video" ? (
                <video
                  ref={remoteVideoRef}
                  className="remote-video"
                  autoPlay
                  playsInline
                />
              ) : (
                <div className="audio-placeholder">
                  🎤 Audio Call with {targetUser.username}
                </div>
              )}
              
              {/* Hidden audio element for remote audio - CRITICAL! */}
              <audio
                ref={remoteAudioRef}
                autoPlay
                playsInline
                style={{ display: 'none' }}
              />
            </div>

            {/* Local video (picture-in-picture) */}
            {callType === "video" && (
              <div className="local-video-wrapper">
                <video
                  ref={localVideoRef}
                  className="local-video"
                  autoPlay
                  muted
                  playsInline
                />
              </div>
            )}
          </div>

          {/* Call controls */}
          <div className="call-controls">
            <button 
              className={`control-btn ${!audioEnabled ? 'disabled' : ''}`}
              onClick={toggleAudio}
              title={audioEnabled ? 'Mute' : 'Unmute'}
            >
              {audioEnabled ? <FiMic /> : <FiMicOff />}
            </button>

            {callType === "video" && (
              <button 
                className={`control-btn ${!videoEnabled ? 'disabled' : ''}`}
                onClick={toggleVideo}
                title={videoEnabled ? 'Stop Video' : 'Start Video'}
              >
                {videoEnabled ? <FiVideo /> : <FiVideoOff />}
              </button>
            )}

            <button 
              className="control-btn end-call-btn"
              onClick={handleEndCall}
              title="End Call"
            >
              <FiPhoneOff />
            </button>

            {/* Debug button - remove in production */}
            <button 
              className="control-btn debug-btn"
              onClick={handleDiagnose}
              title="Diagnose Connection"
              style={{ fontSize: '12px' }}
            >
              🔍
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        .video-call-container {
          width: 100%;
        }

        .error-banner {
          background: #ff4444;
          color: white;
          padding: 12px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 12px;
          cursor: pointer;
        }

        .incoming-call-modal {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .modal-content {
          background: white;
          padding: 30px;
          border-radius: 16px;
          text-align: center;
          min-width: 300px;
        }

        .modal-content h3 {
          margin: 0 0 10px 0;
          font-size: 24px;
        }

        .call-actions {
          display: flex;
          gap: 12px;
          margin-top: 24px;
        }

        .accept-btn, .reject-btn {
          flex: 1;
          padding: 12px 24px;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .accept-btn {
          background: #00b300;
          color: white;
        }

        .reject-btn {
          background: #ff4444;
          color: white;
        }

        .call-buttons {
          display: flex;
          gap: 12px;
          margin: 12px 0;
        }

        .audio-call-btn, .video-call-btn {
          flex: 1;
          padding: 12px 20px;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: all 0.2s;
        }

        .audio-call-btn {
          background: #00b3fd;
          color: white;
        }

        .video-call-btn {
          background: #0090cc;
          color: white;
        }

        .audio-call-btn:hover, .video-call-btn:hover {
          opacity: 0.9;
          transform: translateY(-2px);
        }

        .active-call {
          background: #1a1a1a;
          border-radius: 12px;
          overflow: hidden;
        }

        .call-header {
          background: #2a2a2a;
          padding: 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          color: white;
        }

        .call-info {
          font-weight: 600;
          font-size: 18px;
        }

        .call-duration {
          font-family: monospace;
          font-size: 16px;
        }

        .connection-state {
          font-size: 12px;
          padding: 4px 8px;
          background: #00b300;
          border-radius: 4px;
        }

        .video-container {
          position: relative;
          background: #000;
          min-height: 400px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .remote-video-wrapper {
          width: 100%;
          height: 100%;
        }

        .remote-video {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .audio-placeholder {
          color: white;
          font-size: 24px;
          padding: 100px 20px;
          text-align: center;
        }

        .local-video-wrapper {
          position: absolute;
          bottom: 20px;
          right: 20px;
          width: 200px;
          height: 150px;
          border: 2px solid white;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        }

        .local-video {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .call-controls {
          padding: 20px;
          display: flex;
          gap: 16px;
          justify-content: center;
          background: #2a2a2a;
        }

        .control-btn {
          width: 56px;
          height: 56px;
          border: none;
          border-radius: 50%;
          background: #444;
          color: white;
          font-size: 24px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }

        .control-btn:hover {
          background: #555;
          transform: scale(1.1);
        }

        .control-btn.disabled {
          background: #666;
          color: #aaa;
        }

        .end-call-btn {
          background: #ff4444;
        }

        .end-call-btn:hover {
          background: #ff0000;
        }

        .debug-btn {
          background: #666;
        }
      `}</style>
    </div>
  );
};

export default VideoCall;
