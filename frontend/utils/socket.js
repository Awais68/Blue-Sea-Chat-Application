import { io } from "socket.io-client";

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

let socket = null;

/**
 * Initialize Socket.IO connection
 */
export const initSocket = (token) => {
  if (!socket) {
    socket = io(SOCKET_URL, {
      auth: { token },
      transports: ["websocket", "polling"],
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
 * Send a message
 */
export const sendMessage = (roomId, content, username) => {
  if (socket) {
    socket.emit("send-message", { roomId, content, username });
  }
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
 * Remove all listeners
 */
export const removeAllListeners = () => {
  if (socket) {
    socket.removeAllListeners();
  }
};
