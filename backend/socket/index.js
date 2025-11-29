const Message = require("../models/Message");
const Room = require("../models/Room");
const jwt = require("jsonwebtoken");

/**
 * Map to store socket connections by userId
 */
const userSockets = new Map();

/**
 * Map to store room participants
 */
const roomParticipants = new Map();

/**
 * Initialize Socket.IO server
 */
const initializeSocket = (io) => {
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error("Authentication error"));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;
      next();
    } catch (error) {
      next(new Error("Authentication error"));
    }
  });

  io.on("connection", (socket) => {
    console.log(`User connected: ${socket.userId}`);
    userSockets.set(socket.userId, socket.id);

    /**
     * Join a chat room
     */
    socket.on("join-room", async ({ roomId, username }) => {
      try {
        socket.join(roomId);

        // Track room participants
        if (!roomParticipants.has(roomId)) {
          roomParticipants.set(roomId, new Set());
        }
        roomParticipants.get(roomId).add(socket.userId);

        // Update room participants in database
        await Room.findByIdAndUpdate(roomId, {
          $addToSet: { participants: socket.userId },
        });

        // Notify others in room
        socket.to(roomId).emit("user-joined", {
          userId: socket.userId,
          username,
        });

        // Send current participants list
        const participants = Array.from(roomParticipants.get(roomId) || []);
        io.to(roomId).emit("room-participants", { participants });

        console.log(`User ${username} joined room ${roomId}`);
      } catch (error) {
        console.error("Join room error:", error);
      }
    });

    /**
     * Leave a chat room
     */
    socket.on("leave-room", async ({ roomId, username }) => {
      try {
        socket.leave(roomId);

        // Remove from participants
        if (roomParticipants.has(roomId)) {
          roomParticipants.get(roomId).delete(socket.userId);
        }

        // Notify others in room
        socket.to(roomId).emit("user-left", {
          userId: socket.userId,
          username,
        });

        // Send updated participants list
        const participants = Array.from(roomParticipants.get(roomId) || []);
        io.to(roomId).emit("room-participants", { participants });

        console.log(`User ${username} left room ${roomId}`);
      } catch (error) {
        console.error("Leave room error:", error);
      }
    });

    /**
     * Send a chat message
     */
    socket.on("send-message", async ({ roomId, content, username }) => {
      try {
        // Save message to database
        const message = new Message({
          room: roomId,
          sender: socket.userId,
          senderName: username,
          content,
        });
        await message.save();

        // Broadcast message to room
        io.to(roomId).emit("new-message", {
          id: message._id,
          sender: socket.userId,
          senderName: username,
          content,
          timestamp: message.timestamp,
        });
      } catch (error) {
        console.error("Send message error:", error);
      }
    });

    /**
     * WebRTC Signaling: Offer
     */
    socket.on("webrtc-offer", ({ roomId, offer, targetUserId }) => {
      console.log(
        `📤 Relaying WebRTC offer from ${socket.userId} to ${targetUserId}`
      );
      const targetSocketId = userSockets.get(targetUserId);
      if (targetSocketId) {
        io.to(targetSocketId).emit("webrtc-offer", {
          offer,
          fromUserId: socket.userId,
        });
        console.log(`✅ Offer sent to socket ${targetSocketId}`);
      } else {
        console.log(`❌ Target user ${targetUserId} not found`);
      }
    });

    /**
     * WebRTC Signaling: Answer
     */
    socket.on("webrtc-answer", ({ answer, targetUserId }) => {
      console.log(
        `📤 Relaying WebRTC answer from ${socket.userId} to ${targetUserId}`
      );
      const targetSocketId = userSockets.get(targetUserId);
      if (targetSocketId) {
        io.to(targetSocketId).emit("webrtc-answer", {
          answer,
          fromUserId: socket.userId,
        });
        console.log(`✅ Answer sent to socket ${targetSocketId}`);
      } else {
        console.log(`❌ Target user ${targetUserId} not found`);
      }
    });

    /**
     * WebRTC Signaling: ICE Candidate
     */
    socket.on("webrtc-ice-candidate", ({ candidate, targetUserId }) => {
      const targetSocketId = userSockets.get(targetUserId);
      if (targetSocketId) {
        io.to(targetSocketId).emit("webrtc-ice-candidate", {
          candidate,
          fromUserId: socket.userId,
        });
      }
    });

    /**
     * Handle call initiation
     */
    socket.on("initiate-call", ({ roomId, callType, username }) => {
      socket.to(roomId).emit("incoming-call", {
        fromUserId: socket.userId,
        username,
        callType, // 'audio' or 'video'
      });
    });

    /**
     * Handle call acceptance
     */
    socket.on("accept-call", ({ targetUserId }) => {
      const targetSocketId = userSockets.get(targetUserId);
      if (targetSocketId) {
        io.to(targetSocketId).emit("call-accepted", {
          fromUserId: socket.userId,
        });
      }
    });

    /**
     * Handle call rejection
     */
    socket.on("reject-call", ({ targetUserId }) => {
      const targetSocketId = userSockets.get(targetUserId);
      if (targetSocketId) {
        io.to(targetSocketId).emit("call-rejected", {
          fromUserId: socket.userId,
        });
      }
    });

    /**
     * Handle call end
     */
    socket.on("end-call", ({ roomId, targetUserId }) => {
      if (targetUserId) {
        const targetSocketId = userSockets.get(targetUserId);
        if (targetSocketId) {
          io.to(targetSocketId).emit("call-ended", {
            fromUserId: socket.userId,
          });
        }
      } else {
        socket.to(roomId).emit("call-ended", {
          fromUserId: socket.userId,
        });
      }
    });

    /**
     * Handle message deletion
     */
    socket.on("delete-message", ({ roomId, messageId, deleteForEveryone }) => {
      if (deleteForEveryone) {
        // Broadcast to all users in room
        socket.to(roomId).emit("message-deleted", {
          messageId,
          deleteForEveryone: true,
        });
      }
    });

    /**
     * Handle disconnect
     */
    socket.on("disconnect", () => {
      console.log(`User disconnected: ${socket.userId}`);
      userSockets.delete(socket.userId);

      // Remove from all rooms
      roomParticipants.forEach((participants, roomId) => {
        if (participants.has(socket.userId)) {
          participants.delete(socket.userId);
          socket.to(roomId).emit("user-left", {
            userId: socket.userId,
          });
        }
      });
    });
  });
};

module.exports = initializeSocket;
