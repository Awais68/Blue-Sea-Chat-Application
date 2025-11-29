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
  FiMoreVertical,
  FiPaperclip,
  FiSmile,
  FiCheck,
  FiCheckCircle,
  FiTrash2,
  FiCornerUpRight,
  FiX,
  FiClock,
} from "react-icons/fi";
import { format, isToday, isYesterday } from "date-fns";

// Theme color
const THEME_COLOR = "#00b3fd";
const THEME_DARK = "#0090cc";

// Fixed background image - hi.jpg
const BACKGROUND_IMAGE = "/images/hi.jpg";

// Message colors - Sender (right side) light green, Receiver (left side) white
const SENDER_MSG_COLOR = "#DCF8C6"; // Light green - YOUR messages (right side)
const RECEIVER_MSG_COLOR = "#FFFFFF"; // White - OTHER person's messages (left side)

export default function ChatRoom() {
  const router = useRouter();
  const { id: roomId } = router.query;
  const { user, isAuthenticated } = useAuth();

  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");
  const [participants, setParticipants] = useState([]);
  const [inCall, setInCall] = useState(false);
  const [callType, setCallType] = useState(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [callDuration, setCallDuration] = useState(0);
  const [incomingCall, setIncomingCall] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState(new Map());
  const [roomInfo, setRoomInfo] = useState(null);
  const [showMenu, setShowMenu] = useState(false);
  const [selectedMessages, setSelectedMessages] = useState([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [showCallLogs, setShowCallLogs] = useState(false);
  const [callLogs, setCallLogs] = useState([]);
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [rooms, setRooms] = useState([]);
  const [contextMenu, setContextMenu] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [showDeleteChatModal, setShowDeleteChatModal] = useState(false);

  const messagesEndRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const remoteVideosRef = useRef(new Map());
  const webrtcManagerRef = useRef(null);
  const callTimerRef = useRef(null);
  const inCallRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || !user) {
      router.push("/login");
      return;
    }

    if (!roomId) return;

    webrtcManagerRef.current = new WebRTCManager();
    fetchMessages();
    fetchRoomInfo();
    fetchCallLogs();
    fetchRooms();

    const socket = getSocket();
    if (socket) {
      joinRoom(roomId, user.username);

      onNewMessage((message) => {
        setMessages((prev) => [...prev, message]);
      });

      onUserJoined(({ username }) => {
        console.log(`${username} joined the room`);
      });

      onUserLeft(({ username }) => {
        console.log(`${username} left the room`);
      });

      socket.on("room-participants", ({ participants }) => {
        setParticipants(participants);
        setOnlineUsers(participants);
      });

      socket.on("message-deleted", ({ messageId, deleteForEveryone }) => {
        if (deleteForEveryone) {
          setMessages((prev) =>
            prev.map((msg) =>
              msg._id === messageId
                ? {
                    ...msg,
                    isDeleted: true,
                    content: "This message was deleted",
                  }
                : msg
            )
          );
        } else {
          setMessages((prev) => prev.filter((msg) => msg._id !== messageId));
        }
      });

      setupWebRTCSignaling(
        webrtcManagerRef.current,
        user.id,
        handleRemoteStream
      );

      socket.on("incoming-call", ({ fromUserId, username, callType }) => {
        console.log("📞 Incoming call from:", username, "Type:", callType);
        if (!inCallRef.current) {
          setIncomingCall({ fromUserId, username, callType });
        } else {
          socket.emit("reject-call", { targetUserId: fromUserId });
        }
      });

      socket.on("call-accepted", ({ fromUserId }) => {
        console.log("✅ Call accepted by:", fromUserId);
      });

      socket.on("call-rejected", () => {
        console.log("❌ Call rejected");
        endCall();
      });

      socket.on("call-ended", () => {
        console.log("📴 Call ended");
        endCall();
      });
    }

    return () => {
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

  // Play remote audio when stream changes - CRITICAL FOR VOICE CALLS
  useEffect(() => {
    if (remoteStreams.size > 0 && remoteAudioRef.current) {
      const [firstStream] = Array.from(remoteStreams.values());
      if (firstStream) {
        console.log("🔊 Setting audio stream:", firstStream.getAudioTracks());
        remoteAudioRef.current.srcObject = firstStream;

        const playAudio = async () => {
          try {
            await remoteAudioRef.current.play();
            console.log("✅ Audio playing successfully");
          } catch (e) {
            console.log("⚠️ Audio autoplay blocked:", e);
          }
        };
        playAudio();
      }
    }
  }, [remoteStreams]);

  const fetchMessages = async () => {
    try {
      const response = await roomsAPI.getMessages(roomId);
      setMessages(response.data);
    } catch (error) {
      console.error("Error fetching messages:", error);
    }
  };

  const fetchRoomInfo = async () => {
    try {
      const response = await roomsAPI.getAll();
      const room = response.data.find((r) => r._id === roomId);
      setRoomInfo(room);
    } catch (error) {
      console.error("Error fetching room info:", error);
    }
  };

  const fetchCallLogs = async () => {
    try {
      const response = await roomsAPI.getCallLogs(roomId);
      setCallLogs(response.data || []);
    } catch (error) {
      console.error("Error fetching call logs:", error);
    }
  };

  const fetchRooms = async () => {
    try {
      const response = await roomsAPI.getAll();
      setRooms(response.data.filter((r) => r._id !== roomId));
    } catch (error) {
      console.error("Error fetching rooms:", error);
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

  const handleRemoteStream = (stream, odlocalVideoRefuserId) => {
    console.log(
      "📹 Remote stream received:",
      stream.getTracks().map((t) => `${t.kind}: ${t.enabled}`)
    );

    const audioTracks = stream.getAudioTracks();
    console.log(
      "🎤 Audio tracks:",
      audioTracks.length,
      audioTracks.map((t) => ({ enabled: t.enabled, muted: t.muted }))
    );

    setRemoteStreams((prev) => {
      const newMap = new Map(prev);
      newMap.set(odlocalVideoRefuserId, stream);
      return newMap;
    });

    // Play audio immediately - IMPORTANT FOR VOICE CALLS
    if (remoteAudioRef.current && audioTracks.length > 0) {
      console.log("🔊 Setting remote audio stream...");
      remoteAudioRef.current.srcObject = stream;
      remoteAudioRef.current.volume = 1.0;

      remoteAudioRef.current
        .play()
        .then(() => console.log("✅ Remote audio playing!"))
        .catch((e) => console.log("⚠️ Audio autoplay blocked:", e));
    }

    setTimeout(() => {
      const videoElement = remoteVideosRef.current.get(odlocalVideoRefuserId);
      if (videoElement) {
        videoElement.srcObject = stream;
        videoElement.play().catch((e) => console.log("Video play error:", e));
      }
    }, 100);
  };

  const startCall = async (type) => {
    try {
      console.log("📞 Starting", type, "call...");

      if (!webrtcManagerRef.current) {
        webrtcManagerRef.current = new WebRTCManager();
      }

      setCallType(type);

      const constraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: type === "video",
      };

      console.log("🎤 Requesting media with constraints:", constraints);
      const stream = await webrtcManagerRef.current.getUserMedia(constraints);
      console.log(
        "✅ Got local stream:",
        stream.getTracks().map((t) => t.kind)
      );

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      setInCall(true);
      inCallRef.current = true;

      const socket = getSocket();
      socket.emit("initiate-call", {
        roomId,
        callType: type,
        username: user.username,
      });

      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
      }

      callTimerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);

      for (const participantId of participants) {
        if (participantId !== user.id) {
          try {
            console.log("📤 Creating offer for:", participantId);
            const offer = await webrtcManagerRef.current.createOffer(
              participantId,
              handleRemoteStream,
              (candidate, odlocalVideoRefuserId) => {
                socket.emit("webrtc-ice-candidate", {
                  candidate,
                  targetUserId: odlocalVideoRefuserId,
                });
              }
            );

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
    } catch (error) {
      console.error("❌ Error starting call:", error);
      alert("Failed to access camera/microphone. Please check permissions.");
    }
  };

  const acceptCall = async () => {
    if (!incomingCall) return;

    try {
      console.log("✅ Accepting call from:", incomingCall.username);

      const constraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: incomingCall.callType === "video",
      };

      const stream = await webrtcManagerRef.current.getUserMedia(constraints);
      console.log(
        "✅ Got local stream for answer:",
        stream.getTracks().map((t) => t.kind)
      );

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      setCallType(incomingCall.callType);
      setInCall(true);
      inCallRef.current = true;

      const fromUserId = incomingCall.fromUserId;
      setIncomingCall(null);

      const socket = getSocket();
      socket.emit("accept-call", { targetUserId: fromUserId });

      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
      }

      callTimerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);

      const offer = await webrtcManagerRef.current.createOffer(
        fromUserId,
        handleRemoteStream,
        (candidate, odlocalVideoRefuserId) => {
          socket.emit("webrtc-ice-candidate", {
            candidate,
            targetUserId: odlocalVideoRefuserId,
          });
        }
      );

      socket.emit("webrtc-offer", {
        roomId,
        offer,
        targetUserId: fromUserId,
      });
    } catch (error) {
      console.error("❌ Error accepting call:", error);
      alert("Failed to access camera/microphone. Please check permissions.");
    }
  };

  const rejectCall = () => {
    if (!incomingCall) return;
    const socket = getSocket();
    socket.emit("reject-call", { targetUserId: incomingCall.fromUserId });
    setIncomingCall(null);
  };

  const endCall = async () => {
    console.log("📴 Ending call...");
    const duration = callDuration;

    const socket = getSocket();
    if (socket) {
      socket.emit("end-call", { roomId });
    }

    try {
      await roomsAPI.createCallLog(roomId, {
        callType: callType,
        status: duration > 0 ? "ended" : "missed",
        duration: duration,
        participants: participants,
      });
      fetchCallLogs();
    } catch (error) {
      console.error("Error saving call log:", error);
    }

    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }

    if (webrtcManagerRef.current) {
      webrtcManagerRef.current.closeAllConnections();
      webrtcManagerRef.current.stopLocalStream();
    }

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }

    remoteVideosRef.current.forEach((videoEl) => {
      if (videoEl) videoEl.srcObject = null;
    });
    remoteVideosRef.current.clear();

    setInCall(false);
    inCallRef.current = false;
    setCallType(null);
    setCallDuration(0);
    setAudioEnabled(true);
    setVideoEnabled(true);
    setRemoteStreams(new Map());

    webrtcManagerRef.current = new WebRTCManager();
    setupWebRTCSignaling(webrtcManagerRef.current, user.id, handleRemoteStream);
  };

  const toggleAudio = () => {
    if (webrtcManagerRef.current) {
      const enabled = webrtcManagerRef.current.toggleAudio();
      setAudioEnabled(enabled);
    }
  };

  const toggleVideo = () => {
    if (webrtcManagerRef.current) {
      const enabled = webrtcManagerRef.current.toggleVideo();
      setVideoEnabled(enabled);
    }
  };

  const formatDuration = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, "0")}:${secs
        .toString()
        .padStart(2, "0")}`;
    }
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleDeleteMessage = async (messageId, deleteForEveryone = false) => {
    try {
      await roomsAPI.deleteMessage(roomId, messageId, deleteForEveryone);
      if (!deleteForEveryone) {
        setMessages((prev) => prev.filter((msg) => msg._id !== messageId));
      }
      setContextMenu(null);
      setIsSelectionMode(false);
      setSelectedMessages([]);
    } catch (error) {
      console.error("Error deleting message:", error);
    }
  };

  const handleDeleteChat = async () => {
    try {
      for (const msg of messages) {
        if (msg.sender === user.id || msg.sender?._id === user.id) {
          await roomsAPI.deleteMessage(roomId, msg._id, false);
        }
      }
      setMessages([]);
      setShowDeleteChatModal(false);
      setShowMenu(false);
    } catch (error) {
      console.error("Error deleting chat:", error);
    }
  };

  const handleForwardMessages = async (targetRoomId) => {
    try {
      for (const messageId of selectedMessages) {
        await roomsAPI.forwardMessage(roomId, messageId, targetRoomId);
      }
      setShowForwardModal(false);
      setIsSelectionMode(false);
      setSelectedMessages([]);
      alert("Messages forwarded successfully!");
    } catch (error) {
      console.error("Error forwarding messages:", error);
    }
  };

  const handleContextMenu = (e, message) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, message });
  };

  const toggleMessageSelection = (messageId) => {
    setSelectedMessages((prev) =>
      prev.includes(messageId)
        ? prev.filter((id) => id !== messageId)
        : [...prev, messageId]
    );
  };

  const formatMessageDate = (date) => {
    const msgDate = new Date(date);
    if (isToday(msgDate)) return "Today";
    if (isYesterday(msgDate)) return "Yesterday";
    return format(msgDate, "dd/MM/yyyy");
  };

  const groupMessagesByDate = (messages) => {
    const groups = {};
    messages.forEach((msg) => {
      const dateKey = formatMessageDate(msg.timestamp);
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(msg);
    });
    return groups;
  };

  const messageGroups = groupMessagesByDate(messages);

  return (
    <div className="h-screen flex flex-col">
      {/* Hidden audio element for remote audio - CRITICAL FOR VOICE CALLS */}
      <audio
        ref={remoteAudioRef}
        autoPlay
        playsInline
        style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}
      />

      {/* Main Chat Container with hi.jpg Background */}
      <div
        className="flex-1 flex flex-col relative"
        style={{
          backgroundImage: `url('${BACKGROUND_IMAGE}')`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      >
        <div className="absolute inset-0 bg-black/30" />

        {/* Header */}
        <div
          className="relative z-10 px-4 py-2 flex items-center justify-between shadow-md"
          style={{ backgroundColor: THEME_COLOR }}
        >
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/rooms")}
              className="text-white hover:bg-white/10 p-2 rounded-full transition-colors"
            >
              <FiArrowLeft size={22} />
            </button>
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg"
              style={{ backgroundColor: THEME_DARK }}
            >
              {roomInfo?.name?.charAt(0).toUpperCase() || "R"}
            </div>
            <div>
              <h2 className="text-white font-semibold text-base">
                {roomInfo?.name || "Chat Room"}
              </h2>
              <p className="text-blue-100 text-xs">
                {onlineUsers.length > 0
                  ? `${onlineUsers.length} online`
                  : "tap here for info"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => startCall("video")}
              className="text-white hover:bg-white/10 p-2 rounded-full transition-colors"
              title="Video Call"
            >
              <FiVideo size={20} />
            </button>
            <button
              onClick={() => startCall("audio")}
              className="text-white hover:bg-white/10 p-2 rounded-full transition-colors"
              title="Voice Call"
            >
              <FiPhone size={20} />
            </button>
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="text-white hover:bg-white/10 p-2 rounded-full transition-colors"
              >
                <FiMoreVertical size={20} />
              </button>
              {showMenu && (
                <div className="absolute right-0 top-12 bg-white rounded-lg shadow-xl py-2 w-48 z-50">
                  <button
                    onClick={() => {
                      setShowCallLogs(true);
                      setShowMenu(false);
                    }}
                    className="w-full px-4 py-2 text-left text-gray-700 hover:bg-gray-100 flex items-center gap-3"
                  >
                    <FiClock size={18} /> Call History
                  </button>
                  <button
                    onClick={() => {
                      setIsSelectionMode(true);
                      setShowMenu(false);
                    }}
                    className="w-full px-4 py-2 text-left text-gray-700 hover:bg-gray-100 flex items-center gap-3"
                  >
                    <FiCheckCircle size={18} /> Select Messages
                  </button>
                  <button
                    onClick={() => {
                      setShowDeleteChatModal(true);
                      setShowMenu(false);
                    }}
                    className="w-full px-4 py-2 text-left text-red-600 hover:bg-gray-100 flex items-center gap-3"
                  >
                    <FiTrash2 size={18} /> Delete Chat
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Selection mode header */}
        {isSelectionMode && (
          <div
            className="relative z-10 px-4 py-2 flex items-center justify-between"
            style={{ backgroundColor: THEME_DARK }}
          >
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setIsSelectionMode(false);
                  setSelectedMessages([]);
                }}
                className="text-white"
              >
                <FiX size={24} />
              </button>
              <span className="text-white font-medium">
                {selectedMessages.length} selected
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowForwardModal(true)}
                disabled={selectedMessages.length === 0}
                className="p-2 text-white hover:bg-white/10 rounded-full disabled:opacity-50"
                title="Forward"
              >
                <FiCornerUpRight size={20} />
              </button>
              <button
                onClick={() => {
                  selectedMessages.forEach((id) =>
                    handleDeleteMessage(id, false)
                  );
                }}
                className="p-2 text-white hover:bg-white/10 rounded-full"
                title="Delete"
              >
                <FiTrash2 size={20} />
              </button>
            </div>
          </div>
        )}

        {/* Call Duration Bar */}
        {inCall && (
          <div
            className="relative z-10 px-4 py-2 flex items-center justify-center"
            style={{ backgroundColor: THEME_DARK }}
          >
            <span className="text-white text-sm">
              {callType === "video" ? "📹" : "📞"}{" "}
              {formatDuration(callDuration)}
            </span>
          </div>
        )}

        {/* Video Call Section */}
        {inCall && (
          <div className="relative z-10 flex-1 bg-gray-900 flex flex-col">
            <div className="flex-1 relative">
              <div
                className="w-full h-full grid gap-2 p-2"
                style={{
                  gridTemplateColumns:
                    remoteStreams.size <= 1 ? "1fr" : "repeat(2, 1fr)",
                }}
              >
                {Array.from(remoteStreams.entries()).map(
                  ([odlocalVideoRefuserId, stream]) => (
                    <video
                      key={odlocalVideoRefuserId}
                      ref={(el) => {
                        if (el) {
                          remoteVideosRef.current.set(
                            odlocalVideoRefuserId,
                            el
                          );
                          el.srcObject = stream;
                          el.play().catch(console.log);
                        }
                      }}
                      autoPlay
                      playsInline
                      className="w-full h-full object-cover rounded-lg"
                    />
                  )
                )}
                {remoteStreams.size === 0 && (
                  <div className="flex items-center justify-center h-full text-white">
                    <div className="text-center">
                      <div className="animate-pulse text-6xl mb-4">
                        {callType === "video" ? "📹" : "📞"}
                      </div>
                      <p className="text-lg">Connecting...</p>
                      <p className="text-sm text-gray-400 mt-2">
                        Waiting for other participant...
                      </p>
                    </div>
                  </div>
                )}
              </div>
              {callType === "video" && (
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="absolute bottom-20 right-4 w-32 h-44 object-cover rounded-2xl border-2 border-white shadow-lg"
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
              <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4">
                <button
                  onClick={toggleAudio}
                  className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
                    audioEnabled ? "bg-white/20" : "bg-red-500"
                  }`}
                >
                  {audioEnabled ? (
                    <FiMic size={24} className="text-white" />
                  ) : (
                    <FiMicOff size={24} className="text-white" />
                  )}
                </button>
                <button
                  onClick={endCall}
                  className="w-14 h-14 rounded-full bg-red-500 flex items-center justify-center"
                >
                  <FiPhoneOff size={24} className="text-white" />
                </button>
                {callType === "video" && (
                  <button
                    onClick={toggleVideo}
                    className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
                      videoEnabled ? "bg-white/20" : "bg-red-500"
                    }`}
                  >
                    {videoEnabled ? (
                      <FiVideo size={24} className="text-white" />
                    ) : (
                      <FiVideoOff size={24} className="text-white" />
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Incoming Call Modal */}
        {incomingCall && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
            <div className="bg-white rounded-2xl p-8 text-center shadow-2xl">
              <div className="text-6xl mb-4 animate-pulse">
                {incomingCall.callType === "video" ? "📹" : "📞"}
              </div>
              <h3 className="text-xl font-semibold text-gray-800 mb-2">
                Incoming {incomingCall.callType} call
              </h3>
              <p className="text-gray-600 mb-6">{incomingCall.username}</p>
              <div className="flex gap-4 justify-center">
                <button
                  onClick={rejectCall}
                  className="w-14 h-14 rounded-full bg-red-500 flex items-center justify-center"
                >
                  <FiPhoneOff size={24} className="text-white" />
                </button>
                <button
                  onClick={acceptCall}
                  className="w-14 h-14 rounded-full bg-green-500 flex items-center justify-center animate-pulse"
                >
                  <FiPhone size={24} className="text-white" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Messages Area */}
        {!inCall && (
          <div className="relative z-10 flex-1 overflow-y-auto px-4 py-2">
            {Object.entries(messageGroups).map(([date, msgs]) => (
              <div key={date}>
                <div className="flex justify-center my-4">
                  <span className="px-3 py-1 bg-white/90 text-gray-600 text-xs rounded-full shadow-sm">
                    {date}
                  </span>
                </div>
                {msgs.map((msg, idx) => {
                  const isSender =
                    msg.sender === user.id || msg.sender?._id === user.id;
                  const isSelected = selectedMessages.includes(msg._id);
                  return (
                    <div
                      key={msg._id || idx}
                      className={`flex mb-2 ${
                        isSender ? "justify-end" : "justify-start"
                      }`}
                      onClick={() =>
                        isSelectionMode && toggleMessageSelection(msg._id)
                      }
                      onContextMenu={(e) => handleContextMenu(e, msg)}
                    >
                      <div
                        className={`relative max-w-[75%] px-3 py-2 rounded-lg shadow ${
                          isSelected ? "ring-2 ring-blue-400" : ""
                        }`}
                        style={{
                          backgroundColor: isSender
                            ? SENDER_MSG_COLOR
                            : RECEIVER_MSG_COLOR,
                          borderTopRightRadius: isSender ? 0 : 8,
                          borderTopLeftRadius: !isSender ? 0 : 8,
                        }}
                      >
                        <div
                          className="absolute top-0 w-0 h-0"
                          style={
                            isSender
                              ? {
                                  right: -8,
                                  borderLeft: `8px solid ${SENDER_MSG_COLOR}`,
                                  borderTop: "8px solid transparent",
                                }
                              : {
                                  left: -8,
                                  borderRight: `8px solid ${RECEIVER_MSG_COLOR}`,
                                  borderTop: "8px solid transparent",
                                }
                          }
                        />
                        {msg.messageType === "forwarded" && (
                          <div className="flex items-center gap-1 text-gray-500 text-xs mb-1 italic">
                            <FiCornerUpRight size={12} />
                            Forwarded
                          </div>
                        )}
                        {!isSender && (
                          <p
                            className="text-xs font-semibold mb-1"
                            style={{ color: THEME_COLOR }}
                          >
                            {msg.senderName || msg.sender?.username}
                          </p>
                        )}
                        <p
                          className={`text-sm ${
                            msg.isDeleted
                              ? "italic text-gray-500"
                              : "text-gray-800"
                          }`}
                        >
                          {msg.content}
                        </p>
                        <div className="flex items-center justify-end gap-1 mt-1">
                          <span className="text-[10px] text-gray-500">
                            {format(new Date(msg.timestamp), "HH:mm")}
                          </span>
                          {isSender && !msg.isDeleted && (
                            <span style={{ color: THEME_COLOR }}>
                              <FiCheck size={12} />
                            </span>
                          )}
                        </div>
                        {isSelectionMode && (
                          <div
                            className="absolute -left-6 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-2 flex items-center justify-center"
                            style={{
                              backgroundColor: isSelected
                                ? THEME_COLOR
                                : "white",
                              borderColor: isSelected ? THEME_COLOR : "#9ca3af",
                            }}
                          >
                            {isSelected && (
                              <FiCheck size={12} className="text-white" />
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}

        {/* Message Input */}
        {!inCall && (
          <div className="relative z-10 bg-[#F0F0F0] px-2 py-2">
            <form
              onSubmit={handleSendMessage}
              className="flex items-center gap-2"
            >
              <button
                type="button"
                className="p-2 text-gray-600 hover:bg-gray-200 rounded-full transition-colors"
              >
                <FiSmile size={24} />
              </button>
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder="Type a message"
                  className="w-full px-4 py-2.5 bg-white text-gray-800 rounded-full focus:outline-none shadow-sm"
                />
              </div>
              <button
                type="button"
                className="p-2 text-gray-600 hover:bg-gray-200 rounded-full transition-colors"
              >
                <FiPaperclip size={22} />
              </button>
              <button
                type="submit"
                className="w-11 h-11 text-white rounded-full flex items-center justify-center transition-colors shadow-md"
                style={{ backgroundColor: THEME_COLOR }}
              >
                <FiSend size={20} />
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setContextMenu(null)}
          />
          <div
            className="fixed bg-white rounded-lg shadow-xl py-2 z-50"
            style={{
              left: Math.min(contextMenu.x, window.innerWidth - 150),
              top: Math.min(contextMenu.y, window.innerHeight - 120),
            }}
          >
            <button
              onClick={() => {
                toggleMessageSelection(contextMenu.message._id);
                setIsSelectionMode(true);
                setContextMenu(null);
              }}
              className="w-full px-4 py-2 text-left text-gray-700 hover:bg-gray-100 flex items-center gap-3"
            >
              <FiCheckCircle size={16} />
              Select
            </button>
            <button
              onClick={() => {
                setSelectedMessages([contextMenu.message._id]);
                setShowForwardModal(true);
                setContextMenu(null);
              }}
              className="w-full px-4 py-2 text-left text-gray-700 hover:bg-gray-100 flex items-center gap-3"
            >
              <FiCornerUpRight size={16} />
              Forward
            </button>
            <button
              onClick={() =>
                handleDeleteMessage(contextMenu.message._id, false)
              }
              className="w-full px-4 py-2 text-left text-red-600 hover:bg-gray-100 flex items-center gap-3"
            >
              <FiTrash2 size={16} />
              Delete for me
            </button>
            {(contextMenu.message.sender === user.id ||
              contextMenu.message.sender?._id === user.id) && (
              <button
                onClick={() =>
                  handleDeleteMessage(contextMenu.message._id, true)
                }
                className="w-full px-4 py-2 text-left text-red-600 hover:bg-gray-100 flex items-center gap-3"
              >
                <FiTrash2 size={16} />
                Delete for everyone
              </button>
            )}
          </div>
        </>
      )}

      {/* Forward Modal */}
      {showForwardModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg w-80 max-h-96 overflow-hidden shadow-2xl">
            <div
              className="p-4 border-b flex items-center justify-between"
              style={{ backgroundColor: THEME_COLOR }}
            >
              <h3 className="text-white font-semibold">Forward to</h3>
              <button
                onClick={() => setShowForwardModal(false)}
                className="text-white"
              >
                <FiX size={20} />
              </button>
            </div>
            <div className="overflow-y-auto max-h-72">
              {rooms.map((room) => (
                <button
                  key={room._id}
                  onClick={() => handleForwardMessages(room._id)}
                  className="w-full p-3 text-left hover:bg-gray-100 flex items-center gap-3 border-b"
                >
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
                    style={{ backgroundColor: THEME_COLOR }}
                  >
                    {room.name?.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-gray-800">{room.name}</span>
                </button>
              ))}
              {rooms.length === 0 && (
                <p className="p-4 text-center text-gray-500">
                  No other chats available
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Chat Modal */}
      {showDeleteChatModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg w-80 overflow-hidden shadow-2xl">
            <div className="p-4">
              <h3 className="text-lg font-semibold text-gray-800 mb-2">
                Delete Chat?
              </h3>
              <p className="text-gray-600 text-sm mb-4">
                This will delete all your messages in this chat.
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowDeleteChatModal(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteChat}
                  className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Call Logs Modal */}
      {showCallLogs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg w-80 max-h-96 overflow-hidden shadow-2xl">
            <div
              className="p-4 border-b flex items-center justify-between"
              style={{ backgroundColor: THEME_COLOR }}
            >
              <h3 className="text-white font-semibold">Call History</h3>
              <button
                onClick={() => setShowCallLogs(false)}
                className="text-white"
              >
                <FiX size={20} />
              </button>
            </div>
            <div className="overflow-y-auto max-h-72">
              {callLogs.map((log) => (
                <div
                  key={log._id}
                  className="p-3 border-b flex items-center gap-3"
                >
                  <div
                    className={`p-2 rounded-full ${
                      log.status === "missed" ? "bg-red-100" : "bg-green-100"
                    }`}
                  >
                    {log.callType === "video" ? (
                      <FiVideo
                        size={18}
                        className={
                          log.status === "missed"
                            ? "text-red-500"
                            : "text-green-500"
                        }
                      />
                    ) : (
                      <FiPhone
                        size={18}
                        className={
                          log.status === "missed"
                            ? "text-red-500"
                            : "text-green-500"
                        }
                      />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-gray-800">
                      {log.callType === "video" ? "Video Call" : "Voice Call"}
                    </p>
                    <p className="text-xs text-gray-500">
                      {log.status === "missed"
                        ? "Missed"
                        : formatDuration(log.duration || 0)}
                    </p>
                  </div>
                  <span className="text-xs text-gray-400">
                    {format(new Date(log.createdAt), "dd/MM HH:mm")}
                  </span>
                </div>
              ))}
              {callLogs.length === 0 && (
                <p className="p-4 text-center text-gray-500">No call history</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
