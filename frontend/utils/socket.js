import { io } from "socket.io-client";

// Trailing slash stripped - socket.io treats it as a namespace path
const SOCKET_URL = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"
).replace(/\/$/, "");

let socket = null;

/**
 * Initialize Socket.IO connection
 */
export const initSocket = (token) => {
  // A new token means a new identity - drop the old connection
  if (socket && socket.auth?.token !== token) {
    socket.disconnect();
    socket = null;
  }

  if (!socket) {
    socket = io(SOCKET_URL, {
      auth: { token },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socket.on("connect", () => {
      console.log("Socket connected:", socket.id);
    });

    socket.on("disconnect", () => {
      console.log("Socket disconnected");
    });

    socket.on("connect_error", (error) => {
      console.error("Socket connection error:", error);
    });
  }

  return socket;
};

/**
 * Get current socket instance
 */
export const getSocket = () => socket;

/**
 * Disconnect socket
 */
export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

/**
 * Join a room
 */
export const joinRoom = (roomId, username) => {
  if (socket) {
    socket.emit("join-room", { roomId, username });
  }
};

/**
 * Leave a room
 */
export const leaveRoom = (roomId, username) => {
  if (socket) {
    socket.emit("leave-room", { roomId, username });
  }
};

/**
 * Send a message.
 * `attachment` carries { messageType, mediaUrl, fileName, fileSize, mimeType,
 * duration } for image / video / audio / voice-note / file messages.
 */
export const sendMessage = (roomId, content, username, attachment = {}) => {
  if (!socket) return;

  socket.emit("send-message", {
    roomId,
    content,
    username,
    messageType: attachment.messageType || "text",
    mediaUrl: attachment.mediaUrl || null,
    fileName: attachment.fileName || null,
    fileSize: attachment.fileSize || null,
    mimeType: attachment.mimeType || null,
    duration: attachment.duration ?? null,
    viewOnce: !!attachment.viewOnce,
    tempId: attachment.tempId || null,
  });
};

/**
 * Acknowledgement that our own message reached the server
 */
export const onMessageSent = (callback) => {
  if (socket) socket.on("message-sent", callback);
};

/**
 * A message we tried to send was rejected
 */
export const onMessageError = (callback) => {
  if (socket) socket.on("message-error", callback);
};

/**
 * Typing indicators
 */
export const sendTyping = (roomId, username) => {
  if (socket) socket.emit("typing", { roomId, username });
};

export const sendStopTyping = (roomId) => {
  if (socket) socket.emit("stop-typing", { roomId });
};

export const onUserTyping = (callback) => {
  if (socket) socket.on("user-typing", callback);
};

export const onUserStopTyping = (callback) => {
  if (socket) socket.on("user-stop-typing", callback);
};

/**
 * Read receipts
 */
export const markRoomRead = (roomId) => {
  if (socket) socket.emit("mark-read", { roomId });
};

export const onMessagesRead = (callback) => {
  if (socket) socket.on("messages-read", callback);
};

export const onMessagesDelivered = (callback) => {
  if (socket) socket.on("messages-delivered", callback);
};

/**
 * Notifications - fires for every incoming message regardless of which
 * screen the recipient is on.
 */
export const onMessageNotification = (callback) => {
  if (socket) socket.on("message-notification", callback);
};

/** This user read a room somewhere - clear the badge on every tab. */
export const onRoomRead = (callback) => {
  if (socket) socket.on("room-read", callback);
};

export const onGroupCreated = (callback) => {
  if (socket) socket.on("group-created", callback);
};

/**
 * View-once media
 */
export const announceViewOnceOpened = (roomId, messageId) => {
  if (socket) socket.emit("view-once-opened", { roomId, messageId });
};

export const onMessageViewed = (callback) => {
  if (socket) socket.on("message-viewed", callback);
};

/**
 * Delete for everyone - the server verifies authorship before broadcasting.
 */
export const deleteMessageForEveryone = (roomId, messageId) => {
  if (socket) {
    socket.emit("delete-message", { roomId, messageId, deleteForEveryone: true });
  }
};

/**
 * Presence
 */
export const requestOnlineUsers = () => {
  if (socket) socket.emit("get-online-users");
};

/** Ask for the live status of specific users (chat header, contact list). */
export const requestUserStatus = (userIds) => {
  if (socket) socket.emit("get-user-status", { userIds });
};

export const onUserStatusBulk = (callback) => {
  if (socket) socket.on("user-status-bulk", callback);
};

export const onOnlineUsers = (callback) => {
  if (socket) socket.on("online-users", callback);
};

export const onUserStatus = (callback) => {
  if (socket) socket.on("user-status", callback);
};

/**
 * Listen for new messages
 */
export const onNewMessage = (callback) => {
  if (socket) {
    socket.on("new-message", callback);
  }
};

/**
 * Listen for user joined
 */
export const onUserJoined = (callback) => {
  if (socket) {
    socket.on("user-joined", callback);
  }
};

/**
 * Listen for user left
 */
export const onUserLeft = (callback) => {
  if (socket) {
    socket.on("user-left", callback);
  }
};

/**
 * Listen for room participants
 */
export const onRoomParticipants = (callback) => {
  if (socket) {
    socket.on("room-participants", callback);
  }
};

/**
 * ===============================================
 * WEBRTC CALL FUNCTIONS - Enhanced for reliability
 * ===============================================
 */

/**
 * Initiate a call to a specific user
 * @param {string} roomId - Room ID
 * @param {string} targetUserId - Target user ID
 * @param {string} callType - 'audio' or 'video'
 * @param {string} username - Caller's username
 */
export const initiateCall = (roomId, targetUserId, callType, username) => {
  if (socket) {
    console.log(`📞 [initiateCall] Calling ${targetUserId} (${callType})`);
    socket.emit("initiate-call", { roomId, targetUserId, callType, username });
  }
};

/**
 * Accept an incoming call
 * @param {string} callId - Call ID
 * @param {string} targetUserId - User who initiated the call
 */
export const acceptCall = (callId, targetUserId) => {
  if (socket) {
    console.log(`✅ [acceptCall] Accepting call ${callId}`);
    socket.emit("accept-call", { callId, targetUserId });
  }
};

/**
 * Reject an incoming call
 * @param {string} callId - Call ID
 * @param {string} targetUserId - User who initiated the call
 */
export const rejectCall = (callId, targetUserId) => {
  if (socket) {
    console.log(`❌ [rejectCall] Rejecting call ${callId}`);
    socket.emit("reject-call", { callId, targetUserId });
  }
};

/**
 * End an active call
 * @param {string} callId - Call ID
 * @param {string} roomId - Room ID (optional)
 * @param {string} targetUserId - Target user ID (optional)
 * @param {number} duration - Call duration in seconds
 */
export const endCall = (callId, roomId, targetUserId, duration) => {
  if (socket) {
    console.log(`📴 [endCall] Ending call ${callId}, duration: ${duration}s`);
    socket.emit("end-call", { callId, roomId, targetUserId, duration });
  }
};

/**
 * Listen for incoming calls
 * @param {Function} callback - Callback with call details
 */
export const onIncomingCall = (callback) => {
  if (socket) {
    socket.on("incoming-call", callback);
  }
};

/**
 * Listen for call initiated confirmation
 * @param {Function} callback - Callback with call ID
 */
export const onCallInitiated = (callback) => {
  if (socket) {
    socket.on("call-initiated", callback);
  }
};

/**
 * Listen for call acceptance
 * @param {Function} callback - Callback when call is accepted
 */
export const onCallAccepted = (callback) => {
  if (socket) {
    socket.on("call-accepted", callback);
  }
};

/**
 * Listen for call rejection
 * @param {Function} callback - Callback when call is rejected
 */
export const onCallRejected = (callback) => {
  if (socket) {
    socket.on("call-rejected", callback);
  }
};

/**
 * Listen for call ended
 * @param {Function} callback - Callback when call ends
 */
export const onCallEnded = (callback) => {
  if (socket) {
    socket.on("call-ended", callback);
  }
};

/**
 * Listen for user offline notification
 * @param {Function} callback - Callback when target user is offline
 */
export const onCallUserOffline = (callback) => {
  if (socket) {
    socket.on("call-user-offline", callback);
  }
};

/**
 * Listen for missed call notification
 * @param {Function} callback - Callback for missed calls
 */
export const onCallMissed = (callback) => {
  if (socket) {
    socket.on("call-missed", callback);
  }
};

/**
 * Listen for call errors
 * @param {Function} callback - Callback for call errors
 */
export const onCallError = (callback) => {
  if (socket) {
    socket.on("call-error", callback);
  }
};

/**
 * Listen for a call that was cancelled while still ringing
 */
export const onCallCancelled = (callback) => {
  if (socket) socket.on("call-cancelled", callback);
};

/**
 * Remove all listeners
 */
/**
 * Events owned by a page and torn down when it unmounts.
 *
 * Presence and notification events are deliberately NOT in this list: they
 * belong to the app-wide NotificationProvider, and unmounting a chat page
 * must not silence notifications for the rest of the app.
 */
const APP_EVENTS = [
  "new-message",
  "message-sent",
  "message-error",
  "message-deleted",
  "message-viewed",
  "messages-read",
  "messages-delivered",
  "user-typing",
  "user-stop-typing",
  "user-joined",
  "user-left",
  "room-participants",
  "incoming-call",
  "call-initiated",
  "call-accepted",
  "call-rejected",
  "call-ended",
  "call-cancelled",
  "call-missed",
  "call-user-offline",
  "call-error",
  "webrtc-offer",
  "webrtc-answer",
  "webrtc-ice-candidate",
  "error",
];

export const removeAllListeners = () => {
  if (!socket) return;
  APP_EVENTS.forEach((event) => socket.off(event));
};
