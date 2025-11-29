import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../../contexts/AuthContext";
import { roomsAPI } from "../../utils/api";
import {
  getSocket,
  joinRoom,
  leaveRoom,
  sendMessage,
  onNewMessage,
  onUserJoined,
  onUserLeft,
  removeAllListeners,
} from "../../utils/socket";
import WebRTCManager, { setupWebRTCSignaling } from "../../utils/webrtc";
import {
  FiSend,
  FiPhone,
  FiVideo,
  FiMic,
  FiMicOff,
  FiVideoOff,
  FiPhoneOff,
  FiArrowLeft,
} from "react-icons/fi";
import { format } from "date-fns";

export default function ChatRoom() {
  const router = useRouter();
  const { id: roomId } = router.query;
  const { user, isAuthenticated } = useAuth();

  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");
  const [participants, setParticipants] = useState([]);
  const [inCall, setInCall] = useState(false);
  const [callType, setCallType] = useState(null); // 'audio' or 'video'
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [callDuration, setCallDuration] = useState(0);
  const [incomingCall, setIncomingCall] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState(new Map());

  const messagesEndRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideosRef = useRef(new Map());
  const webrtcManagerRef = useRef(null);
  const callTimerRef = useRef(null);
  const inCallRef = useRef(false); // Track call state for event handlers

  useEffect(() => {
    if (!isAuthenticated || !user) {
      router.push("/login");
      return;
    }

    if (!roomId) return;

    // Initialize WebRTC manager
    webrtcManagerRef.current = new WebRTCManager();

    // Fetch initial messages
    fetchMessages();

    // Join room
    const socket = getSocket();
    if (socket) {
      joinRoom(roomId, user.username);

      // Setup message listeners
      onNewMessage((message) => {
        setMessages((prev) => [...prev, message]);
      });

      onUserJoined(({ username }) => {
        console.log(`${username} joined the room`);
      });

      onUserLeft(({ username }) => {
        console.log(`${username} left the room`);
      });

      // Listen for room participants updates
      socket.on("room-participants", ({ participants }) => {
        console.log("👥 Room participants updated:", participants);
        setParticipants(participants);
      });

      // Setup WebRTC signaling
      setupWebRTCSignaling(
        webrtcManagerRef.current,
        user.id,
        handleRemoteStream
      );

      // Listen for incoming calls
      socket.on("incoming-call", ({ fromUserId, username, callType }) => {
        console.log("📞 Incoming call from:", username, "Type:", callType);
        // Only accept incoming call if not already in a call
        if (!inCallRef.current) {
          setIncomingCall({ fromUserId, username, callType });
        } else {
          console.log("⚠️ Already in a call, rejecting new incoming call");
          socket.emit("reject-call", { targetUserId: fromUserId });
        }
      });

      socket.on("call-accepted", ({ fromUserId }) => {
        console.log("Call accepted by:", fromUserId);
        // No need to create offer here - it will be handled by incoming webrtc-offer
      });

      socket.on("call-rejected", () => {
        console.log("Call rejected");
        endCall();
      });

      socket.on("call-ended", () => {
        endCall();
      });
    }

    return () => {
      // Cleanup
      if (socket) {
        leaveRoom(roomId, user.username);
        removeAllListeners();
      }
      if (webrtcManagerRef.current) {
        webrtcManagerRef.current.closeAllConnections();
        webrtcManagerRef.current.stopLocalStream();
      }
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
      }
    };
  }, [roomId, isAuthenticated, user, router]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchMessages = async () => {
    try {
      const response = await roomsAPI.getMessages(roomId);
      setMessages(response.data);
    } catch (error) {
      console.error("Error fetching messages:", error);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;

    sendMessage(roomId, inputMessage, user.username);
    setInputMessage("");
  };

  const handleRemoteStream = (stream, userId) => {
    console.log("📹 Remote stream received from user:", userId);
    console.log(
      "Stream tracks:",
      stream.getTracks().map((t) => ({ kind: t.kind, enabled: t.enabled }))
    );

    setRemoteStreams((prev) => {
      const newMap = new Map(prev);
      newMap.set(userId, stream);
      return newMap;
    });

    // Set video element if ref exists
    setTimeout(() => {
      const videoElement = remoteVideosRef.current.get(userId);
      if (videoElement) {
        videoElement.srcObject = stream;
        console.log("✅ Video element updated for user:", userId);
      }
    }, 100);
  };

  const startCall = async (type) => {
    try {
      console.log("📞 Starting", type, "call...");

      // Check if WebRTC manager exists
      if (!webrtcManagerRef.current) {
        console.log("⚠️ WebRTC manager not initialized, creating new one");
        webrtcManagerRef.current = new WebRTCManager();
      }

      setCallType(type);

      const constraints = {
        audio: true,
        video: type === "video",
      };

      console.log("🎤 Requesting media with constraints:", constraints);
      const stream = await webrtcManagerRef.current.getUserMedia(constraints);
      console.log(
        "✅ Local stream obtained:",
        stream.getTracks().map((t) => t.kind)
      );

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        console.log("✅ Local video element updated");
      }

      console.log("🔔 Setting inCall to TRUE");
      setInCall(true);
      inCallRef.current = true;
      console.log(
        "🔔 inCall state should be true now, inCallRef:",
        inCallRef.current
      );

      // Notify other participants
      const socket = getSocket();
      socket.emit("initiate-call", {
        roomId,
        callType: type,
        username: user.username,
      });

      // Clear existing timer if any
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
      }

      // Start call timer
      callTimerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
      console.log("⏱️ Call timer started");

      // Create offer for each participant
      console.log(
        "👥 Creating offers for participants:",
        participants.filter((p) => p !== user.id)
      );
      for (const participantId of participants) {
        if (participantId !== user.id) {
          try {
            const offer = await webrtcManagerRef.current.createOffer(
              participantId,
              handleRemoteStream,
              (candidate, userId) => {
                socket.emit("webrtc-ice-candidate", {
                  candidate,
                  targetUserId: userId,
                });
              }
            );

            console.log("📤 Sending offer to:", participantId);
            socket.emit("webrtc-offer", {
              roomId,
              offer,
              targetUserId: participantId,
            });
          } catch (error) {
            console.error("Error creating offer for", participantId, error);
          }
        }
      }

      console.log("✅ startCall completed successfully");
    } catch (error) {
      console.error("❌ Error starting call:", error);
      alert(
        "Failed to access camera/microphone. Please check permissions. Error: " +
          error.message
      );
    }
  };

  const acceptCall = async () => {
    if (!incomingCall) return;

    try {
      const constraints = {
        audio: true,
        video: incomingCall.callType === "video",
      };

      const stream = await webrtcManagerRef.current.getUserMedia(constraints);
      console.log(
        "✅ Local stream obtained for incoming call:",
        stream.getTracks().map((t) => t.kind)
      );

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        console.log("✅ Local video element updated");
      }

      setCallType(incomingCall.callType);
      setInCall(true);
      inCallRef.current = true;

      const fromUserId = incomingCall.fromUserId;
      setIncomingCall(null);

      const socket = getSocket();
      socket.emit("accept-call", { targetUserId: fromUserId });

      // Clear existing timer if any
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
      }

      // Start call timer
      callTimerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
      console.log("⏱️ Call timer started");

      // Create offer for the caller (reverse connection)
      console.log("📤 Creating offer for caller:", fromUserId);
      const offer = await webrtcManagerRef.current.createOffer(
        fromUserId,
        handleRemoteStream,
        (candidate, userId) => {
          socket.emit("webrtc-ice-candidate", {
            candidate,
            targetUserId: userId,
          });
        }
      );

      socket.emit("webrtc-offer", {
        roomId,
        offer,
        targetUserId: fromUserId,
      });
    } catch (error) {
      console.error("Error accepting call:", error);
      alert("Failed to access camera/microphone.");
    }
  };

  const rejectCall = () => {
    if (!incomingCall) return;

    const socket = getSocket();
    socket.emit("reject-call", { targetUserId: incomingCall.fromUserId });
    setIncomingCall(null);
  };

  const endCall = () => {
    console.log("📴 Ending call...");
    const socket = getSocket();
    if (socket) {
      socket.emit("end-call", { roomId });
    }

    // Stop and clear timer first
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }

    // Close WebRTC connections
    if (webrtcManagerRef.current) {
      webrtcManagerRef.current.closeAllConnections();
      webrtcManagerRef.current.stopLocalStream();
    }

    // Clear video elements
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    // Clear all remote video elements
    remoteVideosRef.current.forEach((videoEl) => {
      if (videoEl) videoEl.srcObject = null;
    });
    remoteVideosRef.current.clear();

    // Reset all states
    setInCall(false);
    inCallRef.current = false;
    setCallType(null);
    setCallDuration(0);
    setAudioEnabled(true);
    setVideoEnabled(true);
    setRemoteStreams(new Map());

    // Reinitialize WebRTC manager for next call
    webrtcManagerRef.current = new WebRTCManager();

    // Re-setup WebRTC signaling with new manager
    setupWebRTCSignaling(webrtcManagerRef.current, user.id, handleRemoteStream);

    console.log("✅ Call ended, all states reset, WebRTC ready for new call");
  };

  const toggleAudio = () => {
    if (webrtcManagerRef.current) {
      webrtcManagerRef.current.toggleAudio(!audioEnabled);
      setAudioEnabled(!audioEnabled);
    }
  };

  const toggleVideo = () => {
    if (webrtcManagerRef.current) {
      webrtcManagerRef.current.toggleVideo(!videoEnabled);
      setVideoEnabled(!videoEnabled);
    }
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  };

  return (
    <div className="h-screen flex flex-col bg-dark-bg">
      {/* Debug info - remove later */}
      <div className="bg-red-500 text-white text-xs p-1 text-center">
        inCall: {inCall ? "TRUE" : "FALSE"} | callType: {callType || "null"} |
        remoteStreams: {remoteStreams.size}
      </div>

      {/* Header */}
      <div className="bg-dark-card shadow-lg px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/rooms")}
            className="text-primary-silver hover:text-white transition-colors"
          >
            <FiArrowLeft size={24} />
          </button>
          <div>
            <h2 className="text-white font-bold text-lg">Chat Room</h2>
            {inCall && (
              <p className="text-primary-silver text-sm">
                Call duration: {formatDuration(callDuration)}
              </p>
            )}
          </div>
        </div>

        {!inCall && (
          <div className="flex gap-2">
            <button
              onClick={() => startCall("audio")}
              className="p-3 bg-primary-blue hover:bg-opacity-80 text-white rounded-full transition-all"
              title="Start Audio Call"
            >
              <FiPhone size={20} />
            </button>
            <button
              onClick={() => startCall("video")}
              className="p-3 bg-primary-purple hover:bg-opacity-80 text-white rounded-full transition-all"
              title="Start Video Call"
            >
              <FiVideo size={20} />
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Video Call Section */}
        {inCall && (
          <div className="w-full lg:w-2/3 bg-dark-hover p-4 flex flex-col">
            <div className="relative w-full h-full bg-black">
              {/* Remote Videos */}
              <div
                className="w-full h-full grid gap-2"
                style={{
                  gridTemplateColumns:
                    remoteStreams.size <= 1
                      ? "1fr"
                      : remoteStreams.size <= 4
                      ? "repeat(2, 1fr)"
                      : "repeat(3, 1fr)",
                }}
              >
                {Array.from(remoteStreams.entries()).map(([userId, stream]) => (
                  <video
                    key={userId}
                    ref={(el) => {
                      if (el) {
                        remoteVideosRef.current.set(userId, el);
                        el.srcObject = stream;
                        // Ensure video plays (some browsers require this)
                        el.play().catch((e) =>
                          console.log("Auto-play prevented:", e)
                        );
                      }
                    }}
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
                  />
                ))}
                {remoteStreams.size === 0 && (
                  <div className="flex items-center justify-center h-full text-white">
                    <div className="text-center">
                      <div className="animate-pulse text-6xl mb-4">📞</div>
                      <p>Connecting...</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Hidden audio elements for remote streams in audio call */}
              {callType === "audio" &&
                Array.from(remoteStreams.entries()).map(([userId, stream]) => (
                  <audio
                    key={`audio-${userId}`}
                    ref={(el) => {
                      if (el && stream) {
                        el.srcObject = stream;
                        el.play().catch((e) =>
                          console.log("Audio play prevented:", e)
                        );
                      }
                    }}
                    autoPlay
                  />
                ))}

              {/* Local Video (Picture-in-Picture) */}
              {callType === "video" && (
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="absolute bottom-4 right-4 w-48 h-36 object-cover rounded-lg border-2 border-primary-blue shadow-lg"
                />
              )}
              {callType === "audio" && (
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="hidden"
                />
              )}

              {/* Call Controls */}
              <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-3">
                <button
                  onClick={toggleAudio}
                  className={`p-4 rounded-full transition-all ${
                    audioEnabled
                      ? "bg-dark-card hover:bg-dark-hover"
                      : "bg-red-500 hover:bg-red-600"
                  }`}
                >
                  {audioEnabled ? <FiMic size={24} /> : <FiMicOff size={24} />}
                </button>

                {callType === "video" && (
                  <button
                    onClick={toggleVideo}
                    className={`p-4 rounded-full transition-all ${
                      videoEnabled
                        ? "bg-dark-card hover:bg-dark-hover"
                        : "bg-red-500 hover:bg-red-600"
                    }`}
                  >
                    {videoEnabled ? (
                      <FiVideo size={24} />
                    ) : (
                      <FiVideoOff size={24} />
                    )}
                  </button>
                )}

                <button
                  onClick={endCall}
                  className="p-4 bg-red-500 hover:bg-red-600 rounded-full transition-all"
                >
                  <FiPhoneOff size={24} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Chat Section */}
        <div
          className={`flex flex-col ${
            inCall ? "w-full lg:w-1/3" : "w-full"
          } border-l border-gray-700`}
        >
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((msg, idx) => (
              <div
                key={msg.id || idx}
                className={`flex ${
                  msg.sender === user.id ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                    msg.sender === user.id
                      ? "bg-gradient-to-r from-primary-blue to-primary-purple text-white"
                      : "bg-dark-card text-white"
                  }`}
                >
                  {msg.sender !== user.id && (
                    <p className="text-xs text-primary-silver mb-1">
                      {msg.senderName}
                    </p>
                  )}
                  <p className="break-words">{msg.content}</p>
                  <p className="text-xs opacity-70 mt-1">
                    {format(new Date(msg.timestamp), "HH:mm")}
                  </p>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Message Input */}
          <form
            onSubmit={handleSendMessage}
            className="p-4 bg-dark-card border-t border-gray-700"
          >
            <div className="flex gap-2">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 px-4 py-3 bg-dark-hover text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-blue"
              />
              <button
                type="submit"
                className="px-6 py-3 bg-gradient-to-r from-primary-blue to-primary-purple hover:from-primary-purple hover:to-primary-blue text-white rounded-lg transition-all duration-300"
              >
                <FiSend size={20} />
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Incoming Call Modal */}
      {incomingCall && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-dark-card p-8 rounded-lg shadow-xl text-center">
            <h3 className="text-2xl font-bold text-white mb-4">
              Incoming Call
            </h3>
            <p className="text-primary-silver mb-2">
              {incomingCall.username} is calling...
            </p>
            <p className="text-sm text-gray-400 mb-6">
              {incomingCall.callType === "video" ? "Video Call" : "Audio Call"}
            </p>
            <div className="flex gap-4">
              <button
                onClick={rejectCall}
                className="flex-1 px-6 py-3 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
              >
                Decline
              </button>
              <button
                onClick={acceptCall}
                className="flex-1 px-6 py-3 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors"
              >
                Accept
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
