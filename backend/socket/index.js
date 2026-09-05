const Message = require("../models/Message");
const Room = require("../models/Room");
const User = require("../models/User");
const CallLog = require("../models/CallLog");
const jwt = require("jsonwebtoken");
const { sanitizeMessage, validateMessage } = require("../utils/sanitize");

/**
 * An attachment URL is only trusted if it came out of POST /api/upload:
 * a local "/uploads/..." path, or a Cloudinary URL when that backend is on.
 * Anything else would let a client point a message at an arbitrary host.
 */
const CLOUDINARY_URL_RE = /^https:\/\/res\.cloudinary\.com\/[\w-]+\//;

const isOwnMediaUrl = (url) => {
  const value = String(url || "");
  return value.startsWith("/uploads/") || CLOUDINARY_URL_RE.test(value);
};

/**
 * Sockets held by each user. A user can be connected from several tabs or
 * devices, so this is a Set, not a single socket id.
 * Structure: userId -> Set(socketId)
 */
const userSockets = new Map();

/**
 * Map to store room participants that are currently in the room view
 * Structure: roomId -> Set(userId)
 */
const roomParticipants = new Map();

/**
 * Map to store active calls
 * Structure: callId -> { callLogId, caller, callee, callType, roomId, startTime, timeout }
 */
const activeCalls = new Map();

/**
 * Pending call offers for users that were offline when the call started
 * Structure: userId -> [{ callId, fromUserId, fromUsername, callType, roomId, timestamp }]
 */
const pendingCalls = new Map();

/** Unanswered calls are marked missed after this long. */
const CALL_TIMEOUT_MS = 60 * 1000;

/** Simple per-socket message throttle: max messages per window. */
const MESSAGE_WINDOW_MS = 60 * 1000;
const MESSAGE_MAX_PER_WINDOW = 60;

const addUserSocket = (userId, socketId) => {
  if (!userSockets.has(userId)) {
    userSockets.set(userId, new Set());
  }
  userSockets.get(userId).add(socketId);
};

const removeUserSocket = (userId, socketId) => {
  const sockets = userSockets.get(userId);
  if (!sockets) return true;
  sockets.delete(socketId);
  if (sockets.size === 0) {
    userSockets.delete(userId);
    return true; // user fully offline
  }
  return false;
};

const isOnline = (userId) => userSockets.has(String(userId));

/** Emit an event to every socket a user has open. */
const emitToUser = (io, userId, event, payload) => {
  const sockets = userSockets.get(String(userId));
  if (!sockets || sockets.size === 0) return false;
  sockets.forEach((socketId) => io.to(socketId).emit(event, payload));
  return true;
};

/**
 * Everyone whose chat list should react to this user coming and going:
 * their contacts plus anybody sharing a room with them.
 */
const presenceAudience = async (userId) => {
  const audience = new Set();

  const [user, rooms] = await Promise.all([
    User.findById(userId).select("contacts").lean(),
    Room.find({ participants: userId }).select("participants").lean(),
  ]);

  (user?.contacts || []).forEach((c) => audience.add(String(c)));
  rooms.forEach((room) =>
    room.participants.forEach((p) => audience.add(String(p)))
  );
  audience.delete(String(userId));

  return audience;
};

/** Membership check used by every room-scoped event. */
const assertMember = async (room, userId) =>
  !!room &&
  room.participants.some((p) => p.toString() === String(userId));

/**
 * Pull @handles out of a message and match them against the room's members.
 * Mentioning somebody who is not in the room resolves to nothing.
 */
const resolveMentions = async (content, room) => {
  if (!content || !room) return [];

  const handles = Array.from(
    new Set(
      (content.match(/@([A-Za-z0-9_.-]{3,32})/g) || []).map((m) =>
        m.slice(1).toLowerCase()
      )
    )
  ).slice(0, 20);

  if (handles.length === 0) return [];

  const members = await User.find({
    _id: { $in: room.participants },
  })
    .select("username")
    .lean();

  return members
    .filter((m) => handles.includes(m.username.toLowerCase()))
    .map((m) => ({ _id: m._id, username: m.username }));
};

/** In a direct chat, the "other" participant. */
const otherParticipant = (room, userId) => {
  const other = room.participants.find(
    (p) => p.toString() !== String(userId)
  );
  return other ? other.toString() : null;
};

const removePendingCall = (userId, callId) => {
  const key = String(userId);
  if (!pendingCalls.has(key)) return;
  const remaining = pendingCalls.get(key).filter((c) => c.callId !== callId);
  if (remaining.length === 0) {
    pendingCalls.delete(key);
  } else {
    pendingCalls.set(key, remaining);
  }
};

/** Clear an active call's timeout and drop it from the registry. */
const clearCall = (callId) => {
  const call = activeCalls.get(callId);
  if (call?.timeout) clearTimeout(call.timeout);
  activeCalls.delete(callId);
};

/**
 * Initialize Socket.IO server
 */
const initializeSocket = (io) => {
  io.use((socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace("Bearer ", "");

      if (!token) {
        return next(new Error("Authentication error: no token"));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = String(decoded.userId);
      next();
    } catch (error) {
      next(new Error("Authentication error: invalid token"));
    }
  });

  io.on("connection", async (socket) => {
    console.log(`✅ User connected: ${socket.userId} (Socket: ${socket.id})`);

    const wasOffline = !userSockets.has(socket.userId);
    addUserSocket(socket.userId, socket.id);
    socket.messageTimestamps = [];

    // Mark user online in the DB and tell their chat partners.
    // NOTE: this must NOT be awaited here. Clients emit "join-room" (and often
    // "send-message") immediately after "connect"; if the connection handler
    // awaits a DB round trip before registering socket.on(...) listeners, those
    // first events arrive with no listener attached and are silently dropped.
    const announcePresence = async () => {
      if (!wasOffline) return;
      try {
        await User.findByIdAndUpdate(socket.userId, {
          status: "online",
          lastSeen: new Date(),
        });
        const audience = await presenceAudience(socket.userId);
        audience.forEach((id) =>
          emitToUser(io, id, "user-status", {
            userId: socket.userId,
            status: "online",
          })
        );
      } catch (error) {
        console.error("Presence (online) error:", error);
      }
    };

    /**
     * Tell the newly connected client who of their contacts is online.
     */
    socket.on("get-online-users", async () => {
      try {
        const audience = await presenceAudience(socket.userId);
        const online = Array.from(audience).filter((id) => isOnline(id));
        socket.emit("online-users", { users: online });
      } catch (error) {
        console.error("get-online-users error:", error);
      }
    });

    /**
     * Presence for a specific set of users. The chat header asks for this
     * so it never has to infer "online" from who happens to have the room
     * open, which is what used to make everybody look offline.
     */
    socket.on("get-user-status", async ({ userIds }) => {
      try {
        const ids = (Array.isArray(userIds) ? userIds : [userIds])
          .filter(Boolean)
          .map(String)
          .slice(0, 200);

        const users = await User.find({ _id: { $in: ids } })
          .select("lastSeen")
          .lean();
        const lastSeenById = new Map(
          users.map((u) => [u._id.toString(), u.lastSeen])
        );

        socket.emit("user-status-bulk", {
          statuses: ids.map((id) => ({
            userId: id,
            status: isOnline(id) ? "online" : "offline",
            lastSeen: lastSeenById.get(id) || null,
          })),
        });
      } catch (error) {
        console.error("get-user-status error:", error);
      }
    });

    // Deliver calls that arrived while this user was offline
    if (pendingCalls.has(socket.userId)) {
      pendingCalls.get(socket.userId).forEach((call) => {
        console.log(
          `📞 Sending pending call to ${socket.userId} from ${call.fromUsername}`
        );
        socket.emit("incoming-call", {
          callId: call.callId,
          fromUserId: call.fromUserId,
          username: call.fromUsername,
          callType: call.callType,
          roomId: call.roomId,
          timestamp: call.timestamp,
        });
      });
    }

    /**
     * Join a chat room. Only actual participants may join.
     */
    socket.on("join-room", async ({ roomId, username }) => {
      try {
        const room = await Room.findById(roomId);
        if (!(await assertMember(room, socket.userId))) {
          return socket.emit("error", {
            message: "Not authorized to join this room",
          });
        }

        socket.join(roomId);

        if (!roomParticipants.has(roomId)) {
          roomParticipants.set(roomId, new Set());
        }
        roomParticipants.get(roomId).add(socket.userId);

        socket.to(roomId).emit("user-joined", {
          userId: socket.userId,
          username,
        });

        // "online" means holding a socket anywhere, not merely having this
        // room on screen - otherwise every contact reads as offline.
        io.to(roomId).emit("room-participants", {
          participants: room.participants.map((p) => p.toString()),
          online: room.participants
            .map((p) => p.toString())
            .filter((id) => isOnline(id)),
          viewing: Array.from(roomParticipants.get(roomId)),
        });

        // Deliver-receipt: everything addressed to this user is now delivered
        const delivered = await Message.updateMany(
          {
            room: roomId,
            sender: { $ne: socket.userId },
            status: "sent",
          },
          { $set: { status: "delivered" } }
        );
        if (delivered.modifiedCount > 0) {
          socket.to(roomId).emit("messages-delivered", { roomId });
        }

        console.log(`User ${username} joined room ${roomId}`);
      } catch (error) {
        console.error("Join room error:", error);
        socket.emit("error", { message: "Failed to join room" });
      }
    });

    /**
     * Leave a chat room
     */
    socket.on("leave-room", ({ roomId, username }) => {
      try {
        socket.leave(roomId);

        if (roomParticipants.has(roomId)) {
          roomParticipants.get(roomId).delete(socket.userId);
        }

        socket.to(roomId).emit("user-left", {
          userId: socket.userId,
          username,
        });

        io.to(roomId).emit("room-participants", {
          viewing: Array.from(roomParticipants.get(roomId) || []),
        });

        console.log(`User ${username} left room ${roomId}`);
      } catch (error) {
        console.error("Leave room error:", error);
      }
    });

    /**
     * Send a chat message. Handles plain text as well as attachments
     * (image / video / audio / voice-note / file) uploaded via POST /api/upload.
     */
    socket.on(
      "send-message",
      async ({
        roomId,
        content,
        username,
        messageType = "text",
        mediaUrl = null,
        fileName = null,
        fileSize = null,
        mimeType = null,
        duration = null,
        viewOnce = false,
        tempId = null,
      }) => {
        try {
          // Throttle
          const now = Date.now();
          socket.messageTimestamps = socket.messageTimestamps.filter(
            (t) => now - t < MESSAGE_WINDOW_MS
          );
          if (socket.messageTimestamps.length >= MESSAGE_MAX_PER_WINDOW) {
            return socket.emit("message-error", {
              tempId,
              message: "Sending messages too quickly, please slow down.",
            });
          }
          socket.messageTimestamps.push(now);

          const room = await Room.findById(roomId);
          if (!(await assertMember(room, socket.userId))) {
            return socket.emit("message-error", {
              tempId,
              message: "Not authorized to send in this room",
            });
          }

          const isAttachment = messageType !== "text";

          // Attachments must carry a media URL that our own upload route
          // produced: either a local /uploads path or a Cloudinary URL.
          if (isAttachment) {
            if (!isOwnMediaUrl(mediaUrl)) {
              return socket.emit("message-error", {
                tempId,
                message: "Invalid attachment URL",
              });
            }
          }

          // Only text content goes through the XSS sanitizer; an attachment
          // may legitimately have an empty caption.
          let sanitizedContent = "";
          if (messageType === "text") {
            sanitizedContent = sanitizeMessage(content);
          } else if (content && content.trim().length > 0) {
            sanitizedContent = sanitizeMessage(content);
          }

          validateMessage({
            content: sanitizedContent,
            messageType,
            mediaUrl,
          });

          // View-once only makes sense for media
          const isViewOnce =
            !!viewOnce && ["image", "video"].includes(messageType);

          // @mentions - resolved against the room's own members only
          const mentionedUsers = await resolveMentions(sanitizedContent, room);

          const message = new Message({
            room: roomId,
            sender: socket.userId,
            senderName: username,
            content: sanitizedContent,
            messageType,
            mediaUrl,
            fileName,
            fileSize,
            mimeType,
            duration,
            viewOnce: isViewOnce,
            mentions: mentionedUsers.map((u) => u._id),
            status: "sent",
          });
          await message.save();

          // Preview text for the chat list
          const preview = isViewOnce
            ? messageType === "video"
              ? "📹 View once video"
              : "📷 View once photo"
            : messageType === "text"
              ? sanitizedContent
              : messageType === "image"
              ? "📷 Photo"
              : messageType === "video"
              ? "🎥 Video"
              : messageType === "voice-note"
              ? "🎤 Voice message"
              : messageType === "audio"
              ? "🎵 Audio"
              : `📎 ${fileName || "File"}`;

          await Room.findByIdAndUpdate(roomId, {
            lastMessage: {
              content: preview,
              timestamp: message.timestamp,
              sender: socket.userId,
            },
          });

          const payload = {
            _id: message._id,
            room: roomId,
            sender: socket.userId,
            senderName: username,
            content: sanitizedContent,
            messageType,
            // View-once media is never pushed down the wire; the recipient
            // has to explicitly open it through POST .../view
            mediaUrl: isViewOnce ? null : mediaUrl,
            fileName,
            fileSize,
            mimeType,
            duration,
            viewOnce: isViewOnce,
            viewOnceOpened: false,
            mentions: mentionedUsers.map((u) => u._id.toString()),
            timestamp: message.timestamp,
            status: "sent",
            // Echoed back so the sender can reconcile its optimistic bubble
            tempId,
          };

          // Broadcast to the room (open chat windows)
          io.to(roomId).emit("new-message", payload);

          // Everything the recipient's chat list and notification toast needs
          // without having the room open.
          const notification = {
            roomId,
            messageId: String(message._id),
            senderId: socket.userId,
            senderName: username,
            preview,
            isGroup: !!room.isGroup,
            roomName: room.isGroup ? room.name : username,
            timestamp: message.timestamp,
          };

          room.participants.forEach((p) => {
            const id = p.toString();
            if (id === socket.userId) return;

            // Chat list update for anybody who is connected but not in the room
            if (!roomParticipants.get(roomId)?.has(id)) {
              emitToUser(io, id, "new-message", payload);
            }

            // The notification fires regardless of which screen they are on -
            // the client decides whether to show a toast or just a badge.
            emitToUser(io, id, "message-notification", {
              ...notification,
              mentioned: mentionedUsers.some(
                (u) => u._id.toString() === id
              ),
            });
          });

          // If the recipient is connected anywhere, mark as delivered
          const recipientOnline = room.participants.some(
            (p) => p.toString() !== socket.userId && isOnline(p)
          );
          if (recipientOnline) {
            message.status = "delivered";
            await message.save();
          }

          socket.emit("message-sent", {
            tempId,
            _id: message._id,
            timestamp: message.timestamp,
            status: recipientOnline ? "delivered" : "sent",
          });
        } catch (error) {
          console.error("Send message error:", error);
          socket.emit("message-error", {
            tempId,
            message: error.message || "Failed to send message",
          });
        }
      }
    );

    /**
     * Read receipts (blue ticks)
     */
    socket.on("mark-read", async ({ roomId }) => {
      try {
        const room = await Room.findById(roomId);
        if (!(await assertMember(room, socket.userId))) return;

        const result = await Message.updateMany(
          {
            room: roomId,
            sender: { $ne: socket.userId },
            status: { $ne: "read" },
          },
          {
            $set: { status: "read" },
            $addToSet: { readBy: { user: socket.userId, readAt: new Date() } },
          }
        );

        if (result.modifiedCount > 0) {
          socket.to(roomId).emit("messages-read", {
            roomId,
            readBy: socket.userId,
          });
        }

        // Always tell the reader's own tabs, even when nothing changed here,
        // so an unread badge opened on one device clears on the others.
        emitToUser(io, socket.userId, "room-read", { roomId });
      } catch (error) {
        console.error("mark-read error:", error);
      }
    });

    /**
     * Typing indicator
     */
    socket.on("typing", ({ roomId, username }) => {
      socket.to(roomId).emit("user-typing", {
        userId: socket.userId,
        username,
      });
    });

    socket.on("stop-typing", ({ roomId }) => {
      socket.to(roomId).emit("user-stop-typing", { userId: socket.userId });
    });

    /**
     * WebRTC Signaling: Offer
     */
    socket.on("webrtc-offer", ({ roomId, offer, targetUserId, callId }) => {
      console.log(
        `📤 [OFFER] From: ${socket.userId} -> To: ${targetUserId} | CallID: ${callId}`
      );

      const delivered = emitToUser(io, targetUserId, "webrtc-offer", {
        offer,
        fromUserId: socket.userId,
        callId,
        roomId,
      });

      if (!delivered) {
        console.log(`❌ [OFFER] Target user ${targetUserId} offline`);
        socket.emit("call-user-offline", { targetUserId, callId });
      }
    });

    /**
     * WebRTC Signaling: Answer
     */
    socket.on("webrtc-answer", ({ answer, targetUserId, callId }) => {
      console.log(
        `📤 [ANSWER] From: ${socket.userId} -> To: ${targetUserId} | CallID: ${callId}`
      );

      const delivered = emitToUser(io, targetUserId, "webrtc-answer", {
        answer,
        fromUserId: socket.userId,
        callId,
      });

      if (!delivered) {
        console.log(`❌ [ANSWER] Target user ${targetUserId} offline`);
      }
    });

    /**
     * WebRTC Signaling: ICE Candidate
     */
    socket.on("webrtc-ice-candidate", ({ candidate, targetUserId, callId }) => {
      emitToUser(io, targetUserId, "webrtc-ice-candidate", {
        candidate,
        fromUserId: socket.userId,
        callId,
      });
    });

    /**
     * Start a call.
     * targetUserId is optional for direct chats - it is derived from the room.
     */
    socket.on(
      "initiate-call",
      async ({ roomId, targetUserId, callType, username }) => {
        try {
          const room = await Room.findById(roomId);
          if (!(await assertMember(room, socket.userId))) {
            return socket.emit("call-error", {
              message: "Not authorized to call in this room",
            });
          }

          // Derive the callee for direct chats when the client did not send one
          const callee = targetUserId
            ? String(targetUserId)
            : otherParticipant(room, socket.userId);

          if (!callee) {
            return socket.emit("call-error", {
              message: "No one to call in this chat",
            });
          }

          if (!(await assertMember(room, callee))) {
            return socket.emit("call-error", {
              message: "Target user is not in this chat",
            });
          }

          if (!["audio", "video"].includes(callType)) {
            return socket.emit("call-error", { message: "Invalid call type" });
          }

          console.log(
            `📞 [INITIATE-CALL] ${username} (${socket.userId}) -> ${callee} | ${callType}`
          );

          const callId = `call_${Date.now()}_${socket.userId}`;

          const callLog = new CallLog({
            room: roomId,
            caller: socket.userId,
            callerName: username,
            callType,
            status: "calling",
            participants: [socket.userId, callee],
            startTime: new Date(),
          });
          await callLog.save();

          // Mark as missed if nobody answers in time (online or offline)
          const timeout = setTimeout(async () => {
            const call = activeCalls.get(callId);
            if (!call || call.answered) return;
            try {
              await CallLog.findByIdAndUpdate(call.callLogId, {
                status: "missed",
                endTime: new Date(),
              });
            } catch (e) {
              console.error("Missed-call log error:", e);
            }
            clearCall(callId);
            removePendingCall(callee, callId);
            emitToUser(io, socket.userId, "call-missed", {
              callId,
              targetUserId: callee,
            });
            emitToUser(io, callee, "call-cancelled", { callId });
          }, CALL_TIMEOUT_MS);

          activeCalls.set(callId, {
            callLogId: callLog._id,
            caller: socket.userId,
            callee,
            callType,
            roomId,
            startTime: Date.now(),
            answered: false,
            timeout,
          });

          const delivered = emitToUser(io, callee, "incoming-call", {
            callId,
            fromUserId: socket.userId,
            username,
            callType,
            roomId,
            timestamp: Date.now(),
          });

          if (!delivered) {
            console.log(`⚠️ ${callee} is OFFLINE - queueing call`);
            if (!pendingCalls.has(callee)) pendingCalls.set(callee, []);
            pendingCalls.get(callee).push({
              callId,
              fromUserId: socket.userId,
              fromUsername: username,
              callType,
              roomId,
              timestamp: Date.now(),
            });
            socket.emit("call-user-offline", { targetUserId: callee, callId });
          }

          // Caller needs the callId and the resolved callee id
          socket.emit("call-initiated", {
            callId,
            targetUserId: callee,
            callType,
            online: delivered,
          });
        } catch (error) {
          console.error("❌ [INITIATE-CALL] Error:", error);
          socket.emit("call-error", { message: "Failed to initiate call" });
        }
      }
    );

    /**
     * Callee accepted. The caller creates the WebRTC offer only after this.
     */
    socket.on("accept-call", async ({ callId, targetUserId }) => {
      try {
        console.log(`✅ [ACCEPT-CALL] ${socket.userId} accepted ${callId}`);

        const call = activeCalls.get(callId);
        const caller = call ? call.caller : targetUserId;

        if (call) {
          call.answered = true;
          call.answeredAt = Date.now();
          if (call.timeout) clearTimeout(call.timeout);
          await CallLog.findByIdAndUpdate(call.callLogId, {
            status: "answered",
          });
        }

        emitToUser(io, caller, "call-accepted", {
          callId,
          fromUserId: socket.userId,
        });

        removePendingCall(socket.userId, callId);
      } catch (error) {
        console.error("❌ [ACCEPT-CALL] Error:", error);
      }
    });

    /**
     * Callee rejected
     */
    socket.on("reject-call", async ({ callId, targetUserId }) => {
      try {
        console.log(`❌ [REJECT-CALL] ${socket.userId} rejected ${callId}`);

        const call = activeCalls.get(callId);
        const caller = call ? call.caller : targetUserId;

        if (call) {
          await CallLog.findByIdAndUpdate(call.callLogId, {
            status: "rejected",
            endTime: new Date(),
          });
          clearCall(callId);
        }

        emitToUser(io, caller, "call-rejected", {
          callId,
          fromUserId: socket.userId,
        });

        removePendingCall(socket.userId, callId);
      } catch (error) {
        console.error("❌ [REJECT-CALL] Error:", error);
      }
    });

    /**
     * Either side hung up
     */
    socket.on("end-call", async ({ callId, roomId, targetUserId, duration }) => {
      try {
        console.log(
          `📴 [END-CALL] ${socket.userId} ended ${callId} | ${duration}s`
        );

        const call = activeCalls.get(callId);
        const other =
          targetUserId ||
          (call
            ? call.caller === socket.userId
              ? call.callee
              : call.caller
            : null);

        if (other) {
          emitToUser(io, other, "call-ended", {
            callId,
            fromUserId: socket.userId,
          });
        } else if (roomId) {
          socket.to(roomId).emit("call-ended", {
            callId,
            fromUserId: socket.userId,
          });
        }

        if (call) {
          // Duration counts from when the callee answered, not from ringing
          const base = call.answeredAt || call.startTime;
          const computed = Math.max(0, Math.floor((Date.now() - base) / 1000));
          await CallLog.findByIdAndUpdate(call.callLogId, {
            status: call.answered ? "ended" : "missed",
            duration: call.answered ? duration ?? computed : 0,
            endTime: new Date(),
          });
          clearCall(callId);
          removePendingCall(call.callee, callId);
        }
      } catch (error) {
        console.error("❌ [END-CALL] Error:", error);
      }
    });

    /**
     * Message deletion broadcast
     */
    socket.on("delete-message", async ({ roomId, messageId, deleteForEveryone }) => {
      if (!deleteForEveryone) return;

      try {
        const room = await Room.findById(roomId);
        if (!(await assertMember(room, socket.userId))) return;

        const message = await Message.findOne({ _id: messageId, room: roomId });
        if (!message) return;

        // Only the author can retract a message for everybody
        if (message.sender.toString() !== socket.userId) {
          return socket.emit("error", {
            message: "Only the sender can delete for everyone",
          });
        }

        if (!message.isDeleted) {
          message.isDeleted = true;
          message.content = "This message was deleted";
          message.mediaUrl = null;
          message.thumbnailUrl = null;
          message.deletedAt = new Date();
          await message.save();

          await Room.updateOne(
            { _id: roomId, "lastMessage.timestamp": message.timestamp },
            { $set: { "lastMessage.content": "🚫 This message was deleted" } }
          );
        }

        broadcastDeletion(io, {
          roomId,
          messageId: String(messageId),
          participants: room.participants.map(String),
          actorId: socket.userId,
        });
      } catch (error) {
        console.error("delete-message error:", error);
      }
    });

    /**
     * A view-once attachment was opened. Announced so the sender's bubble
     * flips to "Opened" without a refresh.
     */
    socket.on("view-once-opened", async ({ roomId, messageId }) => {
      try {
        const room = await Room.findById(roomId);
        if (!(await assertMember(room, socket.userId))) return;

        room.participants.forEach((p) =>
          emitToUser(io, p, "message-viewed", {
            roomId,
            messageId: String(messageId),
            viewerId: socket.userId,
          })
        );
      } catch (error) {
        console.error("view-once-opened error:", error);
      }
    });

    /**
     * Handle disconnect
     */
    socket.on("disconnect", async () => {
      console.log(`User disconnected: ${socket.userId} (${socket.id})`);
      const fullyOffline = removeUserSocket(socket.userId, socket.id);

      roomParticipants.forEach((participants, roomId) => {
        if (participants.has(socket.userId) && fullyOffline) {
          participants.delete(socket.userId);
          socket.to(roomId).emit("user-left", { userId: socket.userId });
        }
      });

      if (!fullyOffline) return;

      // Drop any call this user was part of
      for (const [callId, call] of activeCalls.entries()) {
        if (call.caller === socket.userId || call.callee === socket.userId) {
          const other =
            call.caller === socket.userId ? call.callee : call.caller;
          emitToUser(io, other, "call-ended", {
            callId,
            fromUserId: socket.userId,
            reason: "disconnected",
          });
          try {
            const base = call.answeredAt || call.startTime;
            await CallLog.findByIdAndUpdate(call.callLogId, {
              status: call.answered ? "ended" : "missed",
              duration: call.answered
                ? Math.floor((Date.now() - base) / 1000)
                : 0,
              endTime: new Date(),
            });
          } catch (e) {
            console.error("Disconnect call-log error:", e);
          }
          clearCall(callId);
        }
      }

      try {
        await User.findByIdAndUpdate(socket.userId, {
          status: "offline",
          lastSeen: new Date(),
        });
        const audience = await presenceAudience(socket.userId);
        audience.forEach((id) =>
          emitToUser(io, id, "user-status", {
            userId: socket.userId,
            status: "offline",
            lastSeen: new Date(),
          })
        );
      } catch (error) {
        console.error("Presence (offline) error:", error);
      }
    });

    // All listeners are registered - now it is safe to do async work.
    announcePresence();
  });
};

/**
 * Deletion reaches every participant - room members with the chat open get it
 * through the room, everybody else through their own sockets - so the bubble
 * disappears whether or not the chat is on screen.
 */
const broadcastDeletion = (io, { roomId, messageId, participants, actorId }) => {
  const payload = { roomId, messageId, deleteForEveryone: true, actorId };
  io.to(roomId).emit("message-deleted", payload);
  (participants || []).forEach((id) => {
    if (!roomParticipants.get(roomId)?.has(String(id))) {
      emitToUser(io, id, "message-deleted", payload);
    }
  });
};

module.exports = initializeSocket;

/**
 * Called from the REST layer, which has no socket of its own.
 */
module.exports.notifyMessageDeleted = broadcastDeletion;

module.exports.notifyViewOnceOpened = (io, { roomId, messageId, viewerId, senderId }) => {
  const payload = { roomId, messageId, viewerId };
  io.to(roomId).emit("message-viewed", payload);
  emitToUser(io, senderId, "message-viewed", payload);
};

module.exports.notifyGroupCreated = (io, room, creatorId) => {
  (room.participants || []).forEach((p) => {
    const id = String(p._id || p);
    if (id === String(creatorId)) return;
    emitToUser(io, id, "group-created", {
      roomId: String(room._id),
      name: room.name,
      createdBy: String(creatorId),
      memberCount: room.participants.length,
    });
  });
};
