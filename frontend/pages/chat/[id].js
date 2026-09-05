import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/router";
import dynamic from "next/dynamic";
import { useAuth } from "../../contexts/AuthContext";
import { useNotifications } from "../../contexts/NotificationContext";
import { roomsAPI, uploadAPI, getErrorMessage, mediaUrl } from "../../utils/api";
import {
  getSocket,
  joinRoom,
  leaveRoom,
  sendMessage,
  onNewMessage,
  onMessageSent,
  onMessageError,
  sendTyping,
  sendStopTyping,
  onUserTyping,
  onUserStopTyping,
  markRoomRead,
  onMessagesRead,
  onMessagesDelivered,
  onMessageViewed,
  announceViewOnceOpened,
  removeAllListeners,
} from "../../utils/socket";
import WebRTCManager, { setupWebRTCSignaling } from "../../utils/webrtc";
import MessageBubble from "../../components/MessageBubble";
import Composer from "../../components/Composer";
import {
  FiPhone,
  FiVideo,
  FiMic,
  FiMicOff,
  FiVideoOff,
  FiPhoneOff,
  FiArrowLeft,
  FiMoreVertical,
  FiCheckCircle,
  FiTrash2,
  FiCornerUpRight,
  FiX,
  FiClock,
  FiUsers,
} from "react-icons/fi";
import { format, isToday, isYesterday } from "date-fns";

const THEME_COLOR = "#00b3fd";
const THEME_DARK = "#0090cc";
const BACKGROUND_IMAGE = "/images/hi.jpg";

// WebGL cannot be server rendered, and the chat must never wait on it
const ThreeBackground = dynamic(
  () => import("../../components/ThreeBackground"),
  { ssr: false }
);

/** Call lifecycle: idle -> outgoing/incoming -> active */
const CALL_IDLE = "idle";
const CALL_OUTGOING = "outgoing";
const CALL_INCOMING = "incoming";
const CALL_ACTIVE = "active";

export default function ChatRoom() {
  const router = useRouter();
  const { id: roomId } = router.query;
  const {
    user,
    isAuthenticated,
    loading: authLoading,
    socketReady,
  } = useAuth();
  const { setActiveRoom, isUserOnline, watchUsers, lastSeenById } =
    useNotifications();

  const [messages, setMessages] = useState([]);
  const [roomInfo, setRoomInfo] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [callLogs, setCallLogs] = useState([]);
  const [typingUser, setTypingUser] = useState(null);
  const [otherOnline, setOtherOnline] = useState(false);

  // Call state
  const [callState, setCallState] = useState(CALL_IDLE);
  const [callType, setCallType] = useState(null);
  const [callId, setCallId] = useState(null);
  const [peerId, setPeerId] = useState(null);
  const [incomingCall, setIncomingCall] = useState(null);
  const [callDuration, setCallDuration] = useState(0);
  const [callStatusText, setCallStatusText] = useState("");
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [remoteStreams, setRemoteStreams] = useState(new Map());

  // UI state
  const [showMenu, setShowMenu] = useState(false);
  const [selectedMessages, setSelectedMessages] = useState([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [showCallLogs, setShowCallLogs] = useState(false);
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [showDeleteChatModal, setShowDeleteChatModal] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [lightboxIsVideo, setLightboxIsVideo] = useState(false);
  const [viewOnceLoading, setViewOnceLoading] = useState(null);

  const messagesEndRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const remoteVideosRef = useRef(new Map());
  const webrtcManagerRef = useRef(null);
  const callTimerRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const callStateRef = useRef(CALL_IDLE);
  const callIdRef = useRef(null);
  const peerIdRef = useRef(null);
  const callTypeRef = useRef(null);
  const roomIdRef = useRef(null);
  const otherUserIdRef = useRef(null);

  const otherUser = roomInfo?.otherUser || null;
  const isGroup = !!roomInfo?.isGroup;

  /** Everyone who can be @mentioned in this room. */
  const members = useMemo(() => {
    const list = roomInfo?.participants || [];
    return list
      .filter((p) => p && p.username && String(p._id) !== String(user?.id))
      .map((p) => ({ _id: p._id, username: p.username }));
  }, [roomInfo, user]);

  /* ------------------------------------------------------------------ *
   * Keep refs in sync so socket callbacks always see current values
   * ------------------------------------------------------------------ */
  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);
  useEffect(() => {
    callIdRef.current = callId;
  }, [callId]);
  useEffect(() => {
    peerIdRef.current = peerId;
  }, [peerId]);
  useEffect(() => {
    callTypeRef.current = callType;
  }, [callType]);
  useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);

  /* ------------------------------------------------------------------ *
   * Remote media
   * ------------------------------------------------------------------ */
  const handleRemoteStream = useCallback((stream, fromUserId) => {
    console.log(
      "📹 Remote stream received:",
      stream.getTracks().map((t) => `${t.kind}: ${t.enabled}`)
    );

    setRemoteStreams((prev) => {
      const next = new Map(prev);
      next.set(fromUserId, stream);
      return next;
    });

    setCallState(CALL_ACTIVE);
    setCallStatusText("Connected");

    // A dedicated audio element keeps voice working even in a video call
    // where the <video> element is muted or not yet mounted.
    if (remoteAudioRef.current && stream.getAudioTracks().length > 0) {
      remoteAudioRef.current.srcObject = stream;
      remoteAudioRef.current.volume = 1.0;
      remoteAudioRef.current
        .play()
        .then(() => console.log("✅ Remote audio playing"))
        .catch((e) => {
          console.log("⚠️ Audio autoplay blocked:", e);
          setCallStatusText("Tap anywhere to enable audio");
        });
    }
  }, []);

  /* ------------------------------------------------------------------ *
   * Call teardown
   * ------------------------------------------------------------------ */
  const teardownCall = useCallback((notifyServer, durationOverride) => {
    const socket = getSocket();
    const activeCallId = callIdRef.current;
    const activePeer = peerIdRef.current;

    if (notifyServer && socket && activeCallId) {
      socket.emit("end-call", {
        callId: activeCallId,
        roomId: roomIdRef.current,
        targetUserId: activePeer,
        duration: durationOverride,
      });
    }

    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }

    if (webrtcManagerRef.current) {
      webrtcManagerRef.current.closeAllConnections();
      webrtcManagerRef.current.stopLocalStream();
    }

    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    remoteVideosRef.current.forEach((el) => {
      if (el) el.srcObject = null;
    });
    remoteVideosRef.current.clear();

    setCallState(CALL_IDLE);
    setCallType(null);
    setCallId(null);
    setPeerId(null);
    setIncomingCall(null);
    setCallDuration(0);
    setCallStatusText("");
    setAudioEnabled(true);
    setVideoEnabled(true);
    setRemoteStreams(new Map());
  }, []);

  const startCallTimer = useCallback(() => {
    if (callTimerRef.current) clearInterval(callTimerRef.current);
    setCallDuration(0);
    callTimerRef.current = setInterval(
      () => setCallDuration((prev) => prev + 1),
      1000
    );
  }, []);

  /* ------------------------------------------------------------------ *
   * Socket wiring
   * ------------------------------------------------------------------ */
  useEffect(() => {
    if (authLoading) return;

    if (!isAuthenticated || !user) {
      router.push("/login");
      return;
    }

    if (!roomId) return;

    // Mounting before the socket exists used to register zero listeners and
    // leave the room silently dead until a manual refresh.
    const socket = getSocket();
    if (!socket || !socketReady) return;

    webrtcManagerRef.current = new WebRTCManager();
    setupWebRTCSignaling(webrtcManagerRef.current, user.id, handleRemoteStream);

    fetchMessages();
    fetchRoomInfo();
    fetchCallLogs();
    fetchRooms();

    joinRoom(roomId, user.username);
    markRoomRead(roomId);

    onNewMessage((message) => {
      if (message.room && message.room !== roomId) return;

      setMessages((prev) => {
        if (prev.some((m) => m._id === message._id)) return prev;

        // The server echoes our tempId back, so replace the optimistic bubble
        // in place instead of appending a duplicate.
        if (message.tempId && prev.some((m) => m.tempId === message.tempId)) {
          return prev.map((m) =>
            m.tempId === message.tempId
              ? { ...m, ...message, pending: false }
              : m
          );
        }
        return [...prev, message];
      });

      if (message.sender !== user.id) {
        markRoomRead(roomId);
      }
    });

    onMessageSent(({ tempId, _id, timestamp, status }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.tempId && m.tempId === tempId
            ? { ...m, _id, timestamp, status, pending: false }
            : m
        )
      );
    });

    onMessageError(({ tempId, message }) => {
      console.error("Message error:", message);
      setMessages((prev) =>
        prev.map((m) =>
          m.tempId && m.tempId === tempId
            ? { ...m, pending: false, failed: true }
            : m
        )
      );
      alert(message);
    });

    onUserTyping(({ userId, username }) => {
      if (userId === user.id) return;
      setTypingUser(username);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => setTypingUser(null), 3000);
    });

    onUserStopTyping(() => setTypingUser(null));

    onMessagesRead(() => {
      setMessages((prev) =>
        prev.map((m) =>
          (m.sender === user.id || m.sender?._id === user.id)
            ? { ...m, status: "read" }
            : m
        )
      );
    });

    onMessagesDelivered(() => {
      setMessages((prev) =>
        prev.map((m) =>
          (m.sender === user.id || m.sender?._id === user.id) &&
          m.status === "sent"
            ? { ...m, status: "delivered" }
            : m
        )
      );
    });

    // `online` is now who actually holds a connection, not merely who has
    // this room open - that conflation is why everyone read as offline.
    socket.on("room-participants", ({ online = [] }) => {
      const others = online.map(String).filter((id) => id !== String(user.id));
      setOtherOnline(others.length > 0);
    });

    onMessageViewed(({ messageId, viewerId }) => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg._id === messageId
            ? {
                ...msg,
                // The sender loses the media the moment anybody opens it
                viewOnceOpened:
                  msg.viewOnceOpened || String(viewerId) === String(user.id),
                viewOnceSeenBySomeone: true,
                mediaUrl: null,
              }
            : msg
        )
      );
    });

    socket.on("message-deleted", ({ messageId, deleteForEveryone }) => {
      setMessages((prev) =>
        deleteForEveryone
          ? prev.map((msg) =>
              msg._id === messageId
                ? { ...msg, isDeleted: true, content: "This message was deleted" }
                : msg
            )
          : prev.filter((msg) => msg._id !== messageId)
      );
    });

    /* --------------------------- call events --------------------------- */

    socket.on("incoming-call", (data) => {
      console.log("📞 Incoming call:", data);
      if (callStateRef.current !== CALL_IDLE) {
        // Already busy - decline automatically
        socket.emit("reject-call", {
          callId: data.callId,
          targetUserId: data.fromUserId,
        });
        return;
      }
      setIncomingCall(data);
      setCallState(CALL_INCOMING);
      setCallType(data.callType);
      setCallId(data.callId);
      setPeerId(data.fromUserId);
    });

    // Caller side: the server resolved who we are calling
    socket.on("call-initiated", ({ callId: id, targetUserId, online }) => {
      setCallId(id);
      setPeerId(targetUserId);
      if (webrtcManagerRef.current) webrtcManagerRef.current.callId = id;
      setCallStatusText(online ? "Ringing…" : "User is offline");
    });

    // Caller side: callee picked up -> only now do we create the offer
    socket.on("call-accepted", async ({ callId: id, fromUserId }) => {
      console.log("✅ Call accepted by:", fromUserId);
      setCallStatusText("Connecting…");
      startCallTimer();

      try {
        const manager = webrtcManagerRef.current;
        manager.callId = id || callIdRef.current;

        const offer = await manager.createOffer(
          fromUserId,
          handleRemoteStream,
          (candidate, targetUserId) => {
            socket.emit("webrtc-ice-candidate", {
              candidate,
              targetUserId,
              callId: manager.callId,
            });
          }
        );

        socket.emit("webrtc-offer", {
          roomId: roomIdRef.current,
          offer,
          targetUserId: fromUserId,
          callId: manager.callId,
        });
      } catch (error) {
        console.error("❌ Error creating offer:", error);
        alert("Failed to establish the connection.");
        teardownCall(true);
      }
    });

    socket.on("call-rejected", () => {
      setCallStatusText("Call declined");
      teardownCall(false);
    });

    socket.on("call-ended", () => {
      teardownCall(false);
      fetchCallLogs();
    });

    socket.on("call-cancelled", () => teardownCall(false));

    socket.on("call-missed", () => {
      setCallStatusText("No answer");
      teardownCall(false);
      fetchCallLogs();
    });

    socket.on("call-user-offline", () => {
      setCallStatusText("User is offline — they'll see the call when back");
    });

    socket.on("call-error", ({ message }) => {
      alert(message || "Call failed");
      teardownCall(false);
    });

    socket.on("error", ({ message }) => console.error("Socket error:", message));

    return () => {
      leaveRoom(roomId, user.username);
      removeAllListeners();
      if (webrtcManagerRef.current) {
        webrtcManagerRef.current.closeAllConnections();
        webrtcManagerRef.current.stopLocalStream();
      }
      if (callTimerRef.current) clearInterval(callTimerRef.current);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, isAuthenticated, authLoading, socketReady, user?.id]);

  /* ------------------------------------------------------------------ *
   * Notification bookkeeping: this room is on screen, so it is read.
   * ------------------------------------------------------------------ */
  useEffect(() => {
    if (!roomId) return undefined;
    setActiveRoom(roomId);
    return () => setActiveRoom(null);
  }, [roomId, setActiveRoom]);

  // Presence for the person on the other side, straight from the app-wide
  // presence map rather than inferred from who has the room open.
  //
  // Asking the server is deliberately kept separate from reading the answer:
  // folding them into one effect makes every presence update re-trigger the
  // request that caused it.
  const otherUserId = roomInfo?.otherUser?._id
    ? String(roomInfo.otherUser._id)
    : null;

  useEffect(() => {
    if (otherUserId) watchUsers([otherUserId]);
  }, [otherUserId, watchUsers]);

  useEffect(() => {
    if (otherUserId) setOtherOnline(isUserOnline(otherUserId));
  }, [otherUserId, isUserOnline]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* ------------------------------------------------------------------ *
   * Data fetching
   * ------------------------------------------------------------------ */
  const fetchMessages = async () => {
    try {
      const response = await roomsAPI.getMessages(roomId, { limit: 100 });
      // Backend responds with { messages, pagination }
      const list = Array.isArray(response.data)
        ? response.data
        : response.data.messages || [];
      setMessages(list);
    } catch (error) {
      console.error("Error fetching messages:", error);
      setMessages([]);
    }
  };

  const fetchRoomInfo = async () => {
    try {
      const response = await roomsAPI.getAll();
      const room = response.data.find((r) => r._id === roomId) || null;
      setRoomInfo(room);
      otherUserIdRef.current = room?.otherUser?._id || null;
      if (room?.otherUser?.status) {
        setOtherOnline(room.otherUser.status === "online");
      }
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

  /* ------------------------------------------------------------------ *
   * Sending
   * ------------------------------------------------------------------ */
  const pushOptimistic = (payload) => {
    const tempId = `tmp_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    setMessages((prev) => [
      ...prev,
      {
        ...payload,
        tempId,
        _id: tempId,
        sender: user.id,
        senderName: user.username,
        timestamp: new Date().toISOString(),
        status: "sent",
        pending: true,
      },
    ]);
    return tempId;
  };

  const handleSendText = (content) => {
    const tempId = pushOptimistic({ content, messageType: "text" });
    sendMessage(roomId, content, user.username, { tempId });
  };

  const handleSendAttachment = async (file, opts = {}) => {
    const response = await uploadAPI.upload(file, {
      messageType: opts.messageType,
      fileName: opts.fileName,
      duration: opts.duration,
      onProgress: opts.onProgress,
    });

    const meta = response.data;
    const caption = opts.caption || "";

    // Only photos and videos can be sent as view once; the server enforces
    // the same rule, this just keeps the optimistic bubble honest.
    const viewOnce =
      !!opts.viewOnce && ["image", "video"].includes(meta.messageType);

    const tempId = pushOptimistic({
      content: caption,
      messageType: meta.messageType,
      mediaUrl: viewOnce ? null : meta.mediaUrl,
      fileName: meta.fileName,
      fileSize: meta.fileSize,
      mimeType: meta.mimeType,
      duration: meta.duration ?? opts.duration ?? null,
      viewOnce,
    });

    sendMessage(roomId, caption, user.username, {
      messageType: meta.messageType,
      mediaUrl: meta.mediaUrl,
      fileName: meta.fileName,
      fileSize: meta.fileSize,
      mimeType: meta.mimeType,
      duration: meta.duration ?? opts.duration ?? null,
      viewOnce,
      tempId,
    });
  };

  const handleTyping = (isTyping) => {
    if (isTyping) sendTyping(roomId, user.username);
    else sendStopTyping(roomId);
  };

  /* ------------------------------------------------------------------ *
   * Calls
   * ------------------------------------------------------------------ */
  const startCall = async (type) => {
    if (callState !== CALL_IDLE) return;

    const socket = getSocket();
    if (!socket) return;

    try {
      if (!webrtcManagerRef.current) {
        webrtcManagerRef.current = new WebRTCManager();
        setupWebRTCSignaling(
          webrtcManagerRef.current,
          user.id,
          handleRemoteStream
        );
      }

      setCallType(type);
      setCallState(CALL_OUTGOING);
      setCallStatusText("Calling…");

      // Acquire media BEFORE signalling so our tracks exist when the peer
      // connection is created.
      const stream = await webrtcManagerRef.current.getUserMedia({
        audio: true,
        video: type === "video",
      });

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.muted = true;
      }

      socket.emit("initiate-call", {
        roomId,
        targetUserId: otherUser?._id,
        callType: type,
        username: user.username,
      });
    } catch (error) {
      console.error("❌ Error starting call:", error);
      alert(error.message || "Failed to access camera/microphone.");
      teardownCall(false);
    }
  };

  const acceptIncomingCall = async () => {
    if (!incomingCall) return;
    const socket = getSocket();

    try {
      const type = incomingCall.callType;

      // Media first - the offer arrives right after we accept, and the peer
      // connection must already have our tracks.
      const stream = await webrtcManagerRef.current.getUserMedia({
        audio: true,
        video: type === "video",
      });

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.muted = true;
      }

      webrtcManagerRef.current.callId = incomingCall.callId;

      setCallType(type);
      setCallState(CALL_ACTIVE);
      setCallStatusText("Connecting…");
      startCallTimer();

      socket.emit("accept-call", {
        callId: incomingCall.callId,
        targetUserId: incomingCall.fromUserId,
      });

      setIncomingCall(null);
    } catch (error) {
      console.error("❌ Error accepting call:", error);
      alert(error.message || "Failed to access camera/microphone.");
      rejectIncomingCall();
    }
  };

  const rejectIncomingCall = () => {
    const socket = getSocket();
    if (socket && incomingCall) {
      socket.emit("reject-call", {
        callId: incomingCall.callId,
        targetUserId: incomingCall.fromUserId,
      });
    }
    teardownCall(false);
  };

  const hangUp = () => {
    teardownCall(true, callDuration);
    fetchCallLogs();
  };

  const toggleAudio = () => {
    const enabled = webrtcManagerRef.current?.toggleAudio(!audioEnabled);
    setAudioEnabled(!!enabled);
  };

  const toggleVideo = () => {
    const enabled = webrtcManagerRef.current?.toggleVideo(!videoEnabled);
    setVideoEnabled(!!enabled);
  };

  /* ------------------------------------------------------------------ *
   * Message actions
   * ------------------------------------------------------------------ */
  /**
   * The media behind a view-once message is never part of the message
   * payload. It is handed over exactly once by the server, which is what
   * makes "view once" mean anything at all.
   */
  const handleOpenViewOnce = async (message) => {
    if (!message?._id || viewOnceLoading) return;
    setViewOnceLoading(message._id);
    try {
      const { data } = await roomsAPI.openViewOnce(roomId, message._id);
      if (data.mediaUrl) {
        setLightboxIsVideo(message.messageType === "video");
        setLightboxUrl(mediaUrl(data.mediaUrl));
      }

      setMessages((prev) =>
        prev.map((msg) =>
          msg._id === message._id
            ? { ...msg, viewOnceOpened: true, mediaUrl: null }
            : msg
        )
      );
      announceViewOnceOpened(roomId, message._id);
    } catch (error) {
      alert(getErrorMessage(error, "This media is no longer available"));
      setMessages((prev) =>
        prev.map((msg) =>
          msg._id === message._id ? { ...msg, viewOnceOpened: true } : msg
        )
      );
    } finally {
      setViewOnceLoading(null);
    }
  };

  const handleDeleteMessage = async (messageId, deleteForEveryone = false) => {
    try {
      // The server persists the deletion and broadcasts it to every
      // participant, including those who do not have the chat open.
      await roomsAPI.deleteMessage(roomId, messageId, deleteForEveryone);
      if (deleteForEveryone) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg._id === messageId
              ? {
                  ...msg,
                  isDeleted: true,
                  mediaUrl: null,
                  content: "This message was deleted",
                }
              : msg
          )
        );
      } else {
        setMessages((prev) => prev.filter((msg) => msg._id !== messageId));
      }
      setContextMenu(null);
      setIsSelectionMode(false);
      setSelectedMessages([]);
    } catch (error) {
      console.error("Error deleting message:", error);
      alert(error.response?.data?.message || "Failed to delete message");
    }
  };

  const handleDeleteChat = async () => {
    try {
      await Promise.all(
        messages
          .filter((msg) => !msg.pending && msg._id)
          .map((msg) =>
            roomsAPI.deleteMessage(roomId, msg._id, false).catch(() => null)
          )
      );
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
      alert(error.response?.data?.message || "Failed to forward");
    }
  };

  const handleContextMenu = (e, message) => {
    e.preventDefault();
    if (message.pending) return;
    setContextMenu({ x: e.clientX, y: e.clientY, message });
  };

  const toggleMessageSelection = (messageId) => {
    setSelectedMessages((prev) =>
      prev.includes(messageId)
        ? prev.filter((id) => id !== messageId)
        : [...prev, messageId]
    );
  };

  /* ------------------------------------------------------------------ *
   * Helpers
   * ------------------------------------------------------------------ */
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

  /** Short "last seen" stamp for the header. */
  const formatLastSeenAt = (date) => {
    if (!date) return "";
    const d = new Date(date);
    if (isToday(d)) return `today at ${format(d, "HH:mm")}`;
    if (isYesterday(d)) return `yesterday at ${format(d, "HH:mm")}`;
    return format(d, "dd/MM/yy");
  };

  const formatMessageDate = (date) => {
    const msgDate = new Date(date);
    if (Number.isNaN(msgDate.getTime())) return "";
    if (isToday(msgDate)) return "Today";
    if (isYesterday(msgDate)) return "Yesterday";
    return format(msgDate, "dd/MM/yyyy");
  };

  const safeDate = (value, pattern) => {
    if (!value) return "";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "" : format(d, pattern);
  };

  const groupMessagesByDate = (list) => {
    const groups = {};
    list.forEach((msg) => {
      const dateKey = formatMessageDate(msg.timestamp);
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(msg);
    });
    return groups;
  };

  const messageGroups = groupMessagesByDate(messages);
  const inCall = callState === CALL_OUTGOING || callState === CALL_ACTIVE;

  // "Delete for everyone" is only the sender's to offer
  const allSelectedAreMine =
    selectedMessages.length > 0 &&
    selectedMessages.every((id) => {
      const msg = messages.find((m) => m._id === id);
      if (!msg) return false;
      return (
        String(msg.sender?._id || msg.sender) === String(user?.id) &&
        !msg.isDeleted
      );
    });

  if (authLoading || !user) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#0a1929]">
        <div
          className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2"
          style={{ borderColor: THEME_COLOR }}
        />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Remote audio sink - required for voice calls to be audible */}
      <audio
        ref={remoteAudioRef}
        autoPlay
        playsInline
        style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}
      />

      <div
        className="flex-1 flex flex-col relative overflow-hidden"
        style={{
          backgroundImage: `url('${BACKGROUND_IMAGE}')`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      >
        <div className="absolute inset-0 bg-black/45" />

        {/* Ambient sea backdrop. Sits above the photo, below every control. */}
        {!inCall && <ThreeBackground opacity={0.6} />}

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
              {isGroup ? (
                <FiUsers size={20} />
              ) : (
                roomInfo?.name?.charAt(0).toUpperCase() || "R"
              )}
            </div>
            <div className="min-w-0">
              <h2 className="text-white font-semibold text-base truncate">
                {roomInfo?.name || "Chat"}
              </h2>
              <p className="text-blue-100 text-xs truncate">
                {typingUser
                  ? `${typingUser} is typing…`
                  : isGroup
                  ? `${
                      roomInfo?.memberCount || members.length + 1
                    } members`
                  : otherOnline
                  ? "online"
                  : lastSeenById[String(otherUser?._id)]
                  ? `last seen ${formatLastSeenAt(
                      lastSeenById[String(otherUser._id)]
                    )}`
                  : "offline"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => startCall("video")}
              disabled={inCall}
              className="text-white hover:bg-white/10 p-2 rounded-full transition-colors disabled:opacity-40"
              title="Video Call"
            >
              <FiVideo size={20} />
            </button>
            <button
              onClick={() => startCall("audio")}
              disabled={inCall}
              className="text-white hover:bg-white/10 p-2 rounded-full transition-colors disabled:opacity-40"
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
                onClick={() =>
                  selectedMessages.forEach((id) => handleDeleteMessage(id, false))
                }
                disabled={selectedMessages.length === 0}
                className="p-2 text-white hover:bg-white/10 rounded-full disabled:opacity-50"
                title="Delete for me"
              >
                <FiTrash2 size={20} />
              </button>
              {allSelectedAreMine && (
                <button
                  onClick={() =>
                    selectedMessages.forEach((id) =>
                      handleDeleteMessage(id, true)
                    )
                  }
                  className="px-3 py-1.5 text-white text-xs font-medium rounded-full bg-red-500/90 hover:bg-red-500"
                  title="Delete for everyone"
                >
                  Delete for everyone
                </button>
              )}
            </div>
          </div>
        )}

        {/* Call status bar */}
        {inCall && (
          <div
            className="relative z-10 px-4 py-2 flex items-center justify-center gap-3"
            style={{ backgroundColor: THEME_DARK }}
          >
            <span className="text-white text-sm">
              {callType === "video" ? "📹" : "📞"}{" "}
              {callState === CALL_ACTIVE
                ? formatDuration(callDuration)
                : callStatusText || "Calling…"}
            </span>
          </div>
        )}

        {/* Call view */}
        {inCall && (
          <div className="relative z-10 flex-1 bg-gray-900 flex flex-col min-h-0">
            <div className="flex-1 relative">
              <div
                className="w-full h-full grid gap-2 p-2"
                style={{
                  gridTemplateColumns:
                    remoteStreams.size <= 1 ? "1fr" : "repeat(2, 1fr)",
                }}
              >
                {callType === "video" &&
                  Array.from(remoteStreams.entries()).map(([id, stream]) => (
                    <video
                      key={id}
                      ref={(el) => {
                        if (el) {
                          remoteVideosRef.current.set(id, el);
                          if (el.srcObject !== stream) {
                            el.srcObject = stream;
                            el.play().catch(() => {});
                          }
                        }
                      }}
                      autoPlay
                      playsInline
                      className="w-full h-full object-cover rounded-lg"
                    />
                  ))}

                {(remoteStreams.size === 0 || callType === "audio") && (
                  <div className="flex items-center justify-center h-full text-white">
                    <div className="text-center">
                      <div className="animate-pulse text-6xl mb-4">
                        {callType === "video" ? "📹" : "📞"}
                      </div>
                      <p className="text-lg">
                        {callState === CALL_ACTIVE && remoteStreams.size > 0
                          ? `On call with ${otherUser?.username || "peer"}`
                          : callStatusText || "Connecting…"}
                      </p>
                      {callState === CALL_ACTIVE && (
                        <p className="text-sm text-gray-400 mt-2">
                          {formatDuration(callDuration)}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className={
                  callType === "video"
                    ? "absolute bottom-20 right-4 w-32 h-44 object-cover rounded-2xl border-2 border-white shadow-lg"
                    : "hidden"
                }
              />

              <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4">
                <button
                  onClick={toggleAudio}
                  className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
                    audioEnabled ? "bg-white/20" : "bg-red-500"
                  }`}
                  title={audioEnabled ? "Mute" : "Unmute"}
                >
                  {audioEnabled ? (
                    <FiMic size={24} className="text-white" />
                  ) : (
                    <FiMicOff size={24} className="text-white" />
                  )}
                </button>
                <button
                  onClick={hangUp}
                  className="w-14 h-14 rounded-full bg-red-500 flex items-center justify-center"
                  title="End call"
                >
                  <FiPhoneOff size={24} className="text-white" />
                </button>
                {callType === "video" && (
                  <button
                    onClick={toggleVideo}
                    className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
                      videoEnabled ? "bg-white/20" : "bg-red-500"
                    }`}
                    title={videoEnabled ? "Stop video" : "Start video"}
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

        {/* Incoming call modal */}
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
                  onClick={rejectIncomingCall}
                  className="w-14 h-14 rounded-full bg-red-500 flex items-center justify-center"
                >
                  <FiPhoneOff size={24} className="text-white" />
                </button>
                <button
                  onClick={acceptIncomingCall}
                  className="w-14 h-14 rounded-full bg-green-500 flex items-center justify-center animate-pulse"
                >
                  <FiPhone size={24} className="text-white" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Messages */}
        {!inCall && (
          <div className="relative z-10 flex-1 overflow-y-auto px-4 py-2">
            {messages.length === 0 && (
              <p className="text-center text-white/80 text-sm mt-8">
                No messages yet. Say hello 👋
              </p>
            )}
            {Object.entries(messageGroups).map(([date, msgs]) => (
              <div key={date}>
                <div className="flex justify-center my-4">
                  <span className="px-3 py-1 bg-white/90 text-gray-600 text-xs rounded-full shadow-sm">
                    {date}
                  </span>
                </div>
                {msgs.map((msg, idx) => (
                  <MessageBubble
                    key={msg._id || msg.tempId || idx}
                    message={msg}
                    isSender={
                      msg.sender === user.id || msg.sender?._id === user.id
                    }
                    isSelected={selectedMessages.includes(msg._id)}
                    isSelectionMode={isSelectionMode}
                    onSelect={toggleMessageSelection}
                    onContextMenu={handleContextMenu}
                    onOpenImage={setLightboxUrl}
                    onOpenViewOnce={handleOpenViewOnce}
                    viewOnceLoading={viewOnceLoading === msg._id}
                    isGroup={isGroup}
                  />
                ))}
              </div>
            ))}
            {typingUser && (
              <div className="flex justify-start mb-2">
                <div className="bg-white px-3 py-2 rounded-lg shadow text-sm text-gray-500 italic">
                  {typingUser} is typing…
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}

        {/* Composer */}
        {!inCall && (
          <Composer
            onSendText={handleSendText}
            onSendAttachment={handleSendAttachment}
            onTyping={handleTyping}
            members={members}
          />
        )}
      </div>

      {/* Media lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4"
          onClick={() => {
            setLightboxUrl(null);
            setLightboxIsVideo(false);
          }}
        >
          {lightboxIsVideo ? (
            <video
              src={lightboxUrl}
              controls
              autoPlay
              playsInline
              onClick={(e) => e.stopPropagation()}
              className="max-w-full max-h-full"
            />
          ) : (
            <img
              src={lightboxUrl}
              alt="attachment"
              className="max-w-full max-h-full object-contain"
            />
          )}
          <button
            className="absolute top-4 right-4 text-white"
            onClick={() => {
              setLightboxUrl(null);
              setLightboxIsVideo(false);
            }}
          >
            <FiX size={28} />
          </button>
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setContextMenu(null)}
          />
          <div
            className="fixed bg-white rounded-lg shadow-xl py-2 z-50"
            style={{
              left: Math.min(contextMenu.x, window.innerWidth - 170),
              top: Math.min(contextMenu.y, window.innerHeight - 180),
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
              <FiCheckCircle size={16} /> Select
            </button>
            <button
              onClick={() => {
                setSelectedMessages([contextMenu.message._id]);
                setShowForwardModal(true);
                setContextMenu(null);
              }}
              className="w-full px-4 py-2 text-left text-gray-700 hover:bg-gray-100 flex items-center gap-3"
            >
              <FiCornerUpRight size={16} /> Forward
            </button>
            <button
              onClick={() => handleDeleteMessage(contextMenu.message._id, false)}
              className="w-full px-4 py-2 text-left text-red-600 hover:bg-gray-100 flex items-center gap-3"
            >
              <FiTrash2 size={16} /> Delete for me
            </button>
            {(contextMenu.message.sender === user.id ||
              contextMenu.message.sender?._id === user.id) && (
              <button
                onClick={() => handleDeleteMessage(contextMenu.message._id, true)}
                className="w-full px-4 py-2 text-left text-red-600 hover:bg-gray-100 flex items-center gap-3"
              >
                <FiTrash2 size={16} /> Delete for everyone
              </button>
            )}
          </div>
        </>
      )}

      {/* Forward modal */}
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

      {/* Delete chat modal */}
      {showDeleteChatModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg w-80 overflow-hidden shadow-2xl">
            <div className="p-4">
              <h3 className="text-lg font-semibold text-gray-800 mb-2">
                Delete Chat?
              </h3>
              <p className="text-gray-600 text-sm mb-4">
                This will delete all messages in this chat for you.
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

      {/* Call history modal */}
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
                      log.status === "answered" || log.status === "ended"
                        ? "bg-green-100"
                        : "bg-red-100"
                    }`}
                  >
                    {log.callType === "video" ? (
                      <FiVideo
                        size={18}
                        className={
                          log.status === "answered" || log.status === "ended"
                            ? "text-green-500"
                            : "text-red-500"
                        }
                      />
                    ) : (
                      <FiPhone
                        size={18}
                        className={
                          log.status === "answered" || log.status === "ended"
                            ? "text-green-500"
                            : "text-red-500"
                        }
                      />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-gray-800">
                      {log.callType === "video" ? "Video Call" : "Voice Call"}
                    </p>
                    <p className="text-xs text-gray-500">
                      {log.status === "ended" || log.status === "answered"
                        ? formatDuration(log.duration || 0)
                        : log.status === "rejected"
                        ? "Declined"
                        : "Missed"}
                    </p>
                  </div>
                  <span className="text-xs text-gray-400">
                    {safeDate(log.startTime, "dd/MM HH:mm")}
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
