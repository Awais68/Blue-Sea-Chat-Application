const express = require("express");
const mongoose = require("mongoose");
const Room = require("../models/Room");
const Message = require("../models/Message");
const CallLog = require("../models/CallLog");
const User = require("../models/User");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

/**
 * Load a room and assert the requesting user is a participant.
 * Returns the room, or sends the error response and returns null.
 */
const requireRoomMember = async (req, res, roomId) => {
  const room = await Room.findById(roomId);
  if (!room) {
    res.status(404).json({ message: "Room not found" });
    return null;
  }
  const isMember = room.participants.some(
    (p) => p.toString() === req.userId.toString()
  );
  if (!isMember) {
    res.status(403).json({ message: "Not authorized for this room" });
    return null;
  }
  return room;
};

/**
 * @route   GET /api/rooms
 * @desc    Get all direct chats for the current user
 * @access  Private
 */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const rooms = await Room.find({
      participants: req.userId,
    })
      .populate("participants", "username email status lastSeen avatar")
      .populate("createdBy", "username")
      .populate("lastMessage.sender", "username")
      .sort({ "lastMessage.timestamp": -1, createdAt: -1 });

    // Unread badges for every room in a single aggregation instead of one
    // countDocuments per room.
    const me = new mongoose.Types.ObjectId(req.userId);
    const unread = await Message.aggregate([
      {
        $match: {
          room: { $in: rooms.map((r) => r._id) },
          sender: { $ne: me },
          isDeleted: false,
          deletedFor: { $ne: me },
          "readBy.user": { $ne: me },
        },
      },
      { $group: { _id: "$room", count: { $sum: 1 } } },
    ]);
    const unreadByRoom = new Map(
      unread.map((u) => [u._id.toString(), u.count])
    );

    const formattedRooms = rooms.map((room) => {
      const roomObj = room.toObject();
      roomObj.unreadCount = unreadByRoom.get(room._id.toString()) || 0;

      if (room.isDirectChat && room.participants.length === 2) {
        const otherUser = room.participants.find(
          (p) => p._id.toString() !== req.userId
        );
        if (otherUser) {
          roomObj.name = otherUser.username;
          roomObj.otherUser = otherUser;
        }
      }

      if (room.isGroup) {
        roomObj.memberCount = room.participants.length;
        roomObj.isAdmin = room.isAdmin(req.userId);
      }

      return roomObj;
    });

    res.json(formattedRooms);
  } catch (error) {
    console.error("Get rooms error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * @route   GET /api/rooms/users/search?q=
 * @desc    Directory search. This - not a full user dump - is how you reach
 *          somebody who is not already in your contacts.
 * @access  Private
 */
router.get("/users/search", authMiddleware, async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (q.length < 1) return res.json([]);

    const users = await User.searchDirectory(q, req.userId, 20);
    const me = await User.findById(req.userId).select("contacts").lean();
    const contactIds = new Set((me?.contacts || []).map(String));

    res.json(
      users.map((u) => ({
        ...u.toObject(),
        isContact: contactIds.has(u._id.toString()),
      }))
    );
  } catch (error) {
    console.error("Search users error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * @route   GET /api/rooms/users
 * @desc    The current user's contacts only. The whole user table is no
 *          longer exposed - use /users/search to find anybody else.
 * @access  Private
 */
router.get("/users", authMiddleware, async (req, res) => {
  try {
    const me = await User.findById(req.userId)
      .populate({
        path: "contacts",
        select: "username email avatar status lastSeen about",
        options: { sort: { username: 1 } },
      })
      .lean();

    res.json(me?.contacts || []);
  } catch (error) {
    console.error("Get contacts error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * @route   POST /api/rooms/contacts/:userId
 * @desc    Add somebody found through search to your contacts
 * @access  Private
 */
router.post("/contacts/:userId", authMiddleware, async (req, res) => {
  try {
    if (req.params.userId === req.userId) {
      return res.status(400).json({ message: "Cannot add yourself" });
    }

    const target = await User.findById(req.params.userId).select(
      "username email avatar status lastSeen about"
    );
    if (!target) return res.status(404).json({ message: "User not found" });

    await User.findByIdAndUpdate(req.userId, {
      $addToSet: { contacts: target._id },
    });

    res.json({ message: "Contact added", user: target });
  } catch (error) {
    console.error("Add contact error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * @route   DELETE /api/rooms/contacts/:userId
 * @desc    Remove somebody from your contacts (the chat history stays)
 * @access  Private
 */
router.delete("/contacts/:userId", authMiddleware, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.userId, {
      $pull: { contacts: req.params.userId },
    });
    res.json({ message: "Contact removed" });
  } catch (error) {
    console.error("Remove contact error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * @route   POST /api/rooms/direct/:userId
 * @desc    Start or get a direct chat with a user
 * @access  Private
 */
router.post("/direct/:userId", authMiddleware, async (req, res) => {
  try {
    const targetUserId = req.params.userId;

    // Prevent self-chat
    if (targetUserId === req.userId) {
      return res.status(400).json({ message: "Cannot start chat with yourself" });
    }

    // Check if target user exists
    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ message: "User not found" });
    }

    // Find or create direct chat (prevents race conditions)
    const room = await Room.findOrCreateDirectChat(req.userId, targetUserId);

    // Talking to somebody is what puts them in both contact lists
    await User.linkContacts(req.userId, targetUserId);

    await room.populate("participants", "username email status lastSeen avatar");

    // Format response
    const roomObj = room.toObject();
    const otherUser = room.participants.find(
      (p) => p._id.toString() !== req.userId
    );
    roomObj.name = otherUser?.username;
    roomObj.otherUser = otherUser;

    res.status(201).json(roomObj);
  } catch (error) {
    console.error("Create direct chat error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * @route   POST /api/rooms
 * @desc    Create a new room (legacy support)
 * @access  Private
 */
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { name, description, targetUserId } = req.body;

    // If targetUserId is provided, create a direct chat
    if (targetUserId) {
      const targetUser = await User.findById(targetUserId);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Use the new method
      const room = await Room.findOrCreateDirectChat(req.userId, targetUserId);
      await room.populate("participants", "username email status lastSeen");

      const roomObj = room.toObject();
      const otherUser = room.participants.find(
        (p) => p._id.toString() !== req.userId
      );
      roomObj.name = otherUser?.username;
      return res.json(roomObj);
    }

    // Legacy: Create named room
    // Validate that name is provided
    if (!name || name.trim() === "") {
      return res.status(400).json({ message: "Room name is required" });
    }

    // Check if room with the same name already exists
    const existingRoom = await Room.findOne({ name: name.trim() });
    if (existingRoom) {
      return res.status(409).json({ message: "Room name already exists" });
    }

    // Create new room
    const room = new Room({
      name: name.trim(),
      description,
      isDirectChat: false,
      createdBy: req.userId,
      participants: [req.userId],
    });

    await room.save();
    await room.populate("createdBy", "username");

    res.status(201).json(room);
  } catch (error) {
    console.error("Create room error:", error);

    // Handle MongoDB duplicate key error (in case of race condition)
    if (error.code === 11000 || error.name === "MongoServerError") {
      return res.status(409).json({ message: "Room name already exists" });
    }

    // Handle validation errors
    if (error.name === "ValidationError") {
      return res.status(400).json({
        message: error.message || "Validation error"
      });
    }

    // Generic server error
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * @route   POST /api/rooms/group
 * @desc    Create a group chat
 * @access  Private
 */
router.post("/group", authMiddleware, async (req, res) => {
  try {
    const { name, description, participants } = req.body;

    if (!Array.isArray(participants) || participants.length === 0) {
      return res
        .status(400)
        .json({ message: "Select at least one member for the group" });
    }

    // Only real users can be added
    const members = await User.find({ _id: { $in: participants } }).select("_id");
    if (members.length !== participants.length) {
      return res.status(400).json({ message: "One or more users do not exist" });
    }

    const room = await Room.createGroup({
      name,
      description,
      createdBy: req.userId,
      participants: members.map((m) => m._id),
    });

    // Group members become contacts of the creator
    await User.findByIdAndUpdate(req.userId, {
      $addToSet: { contacts: { $each: members.map((m) => m._id) } },
    });

    await room.populate("participants", "username email status lastSeen avatar");

    const roomObj = room.toObject();
    roomObj.memberCount = room.participants.length;
    roomObj.isAdmin = true;
    roomObj.unreadCount = 0;

    // Tell every member their chat list changed
    const io = req.app.get("io");
    if (io) {
      const { notifyGroupCreated } = require("../socket");
      notifyGroupCreated(io, roomObj, req.userId);
    }

    res.status(201).json(roomObj);
  } catch (error) {
    console.error("Create group error:", error);
    res.status(400).json({ message: error.message || "Failed to create group" });
  }
});

/**
 * @route   PATCH /api/rooms/:roomId/group
 * @desc    Rename a group or change its description (admins only)
 * @access  Private
 */
router.patch("/:roomId/group", authMiddleware, async (req, res) => {
  try {
    const room = await requireRoomMember(req, res, req.params.roomId);
    if (!room) return;

    if (!room.isGroup) {
      return res.status(400).json({ message: "Not a group chat" });
    }
    if (!room.isAdmin(req.userId)) {
      return res.status(403).json({ message: "Only admins can edit the group" });
    }

    const { name, description } = req.body;
    if (typeof name === "string" && name.trim()) {
      room.name = name.trim().slice(0, 60);
    }
    if (typeof description === "string") {
      room.description = description.slice(0, 200);
    }
    await room.save();

    res.json({ _id: room._id, name: room.name, description: room.description });
  } catch (error) {
    console.error("Update group error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * @route   POST /api/rooms/:roomId/participants
 * @desc    Add members to a group (admins only)
 * @access  Private
 */
router.post("/:roomId/participants", authMiddleware, async (req, res) => {
  try {
    const room = await requireRoomMember(req, res, req.params.roomId);
    if (!room) return;

    if (!room.isGroup) {
      return res.status(400).json({ message: "Not a group chat" });
    }
    if (!room.isAdmin(req.userId)) {
      return res.status(403).json({ message: "Only admins can add members" });
    }

    const { userIds } = req.body;
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ message: "No members selected" });
    }

    const users = await User.find({ _id: { $in: userIds } }).select("_id");
    users.forEach((u) => {
      if (!room.participants.some((p) => p.toString() === u._id.toString())) {
        room.participants.push(u._id);
      }
    });

    if (room.participants.length > 256) {
      return res.status(400).json({ message: "Group is full (256 members)" });
    }

    await room.save();
    await room.populate("participants", "username email status lastSeen avatar");

    res.json({
      _id: room._id,
      participants: room.participants,
      memberCount: room.participants.length,
    });
  } catch (error) {
    console.error("Add participants error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * @route   DELETE /api/rooms/:roomId/participants/:userId
 * @desc    Leave a group, or remove somebody from it (admins only)
 * @access  Private
 */
router.delete(
  "/:roomId/participants/:userId",
  authMiddleware,
  async (req, res) => {
    try {
      const room = await requireRoomMember(req, res, req.params.roomId);
      if (!room) return;

      if (!room.isGroup) {
        return res.status(400).json({ message: "Not a group chat" });
      }

      const removingSelf = req.params.userId === req.userId;
      if (!removingSelf && !room.isAdmin(req.userId)) {
        return res
          .status(403)
          .json({ message: "Only admins can remove members" });
      }

      room.participants = room.participants.filter(
        (p) => p.toString() !== req.params.userId
      );
      room.admins = room.admins.filter(
        (a) => a.toString() !== req.params.userId
      );

      // An admin-less group promotes its oldest remaining member
      if (room.participants.length > 0 && room.admins.length === 0) {
        room.admins = [room.participants[0]];
      }

      await room.save();

      res.json({
        message: removingSelf ? "Left the group" : "Member removed",
        memberCount: room.participants.length,
      });
    } catch (error) {
      console.error("Remove participant error:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

/**
 * @route   GET /api/rooms/:roomId/messages
 * @desc    Get messages for a room with pagination
 * @access  Private
 */
router.get("/:roomId/messages", authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 50, sort = "asc" } = req.query;

    // Validate pagination params
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(parseInt(limit), 100); // Max 100 per page

    // Verify user is participant in this room
    const room = await requireRoomMember(req, res, req.params.roomId);
    if (!room) return;

    // Query with pagination
    const options = {
      page: pageNum,
      limit: limitNum,
      // Never return the full user document - it contains the password hash
      populate: { path: "sender", select: "username email avatar" },
      sort: sort === "desc" ? { timestamp: -1 } : { timestamp: 1 },
    };

    const messages = await Message.paginate(
      {
        room: req.params.roomId,
        isDeleted: false,
        deletedFor: { $ne: req.userId },
      },
      options
    );

    // Transform response. forViewer() strips view-once media this user has
    // already opened, so a page reload cannot replay it.
    const formattedMessages = messages.docs.map((msg) => ({
      ...msg.forViewer(req.userId),
      isOwn: msg.sender?._id?.toString() === req.userId,
    }));

    res.json({
      messages: formattedMessages,
      pagination: {
        currentPage: messages.page,
        totalPages: messages.totalPages,
        totalMessages: messages.totalDocs,
        limit: messages.limit,
        hasNextPage: messages.hasNextPage,
        hasPrevPage: messages.hasPrevPage,
      },
    });
  } catch (error) {
    console.error("Get messages error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * @route   POST /api/rooms/:roomId/messages/:messageId/view
 * @desc    Open a view-once attachment. Returns the media URL exactly once;
 *          every later call (and every reload) gets nothing.
 * @access  Private
 */
router.post(
  "/:roomId/messages/:messageId/view",
  authMiddleware,
  async (req, res) => {
    try {
      const room = await requireRoomMember(req, res, req.params.roomId);
      if (!room) return;

      const message = await Message.findOne({
        _id: req.params.messageId,
        room: req.params.roomId,
      });

      if (!message) {
        return res.status(404).json({ message: "Message not found" });
      }
      if (!message.viewOnce) {
        return res.status(400).json({ message: "Not a view-once message" });
      }
      if (message.isDeleted) {
        return res.status(410).json({ message: "This message was deleted" });
      }

      const alreadyViewed = message.viewedBy.some(
        (v) => v.user.toString() === req.userId
      );
      if (alreadyViewed) {
        return res.status(410).json({ message: "Already opened" });
      }

      const mediaUrl = message.mediaUrl;

      message.viewedBy.push({ user: req.userId, viewedAt: new Date() });
      await message.save();

      // Let the sender know it was opened
      const io = req.app.get("io");
      if (io) {
        const { notifyViewOnceOpened } = require("../socket");
        notifyViewOnceOpened(io, {
          roomId: String(room._id),
          messageId: String(message._id),
          viewerId: req.userId,
          senderId: message.sender.toString(),
        });
      }

      res.json({
        mediaUrl,
        messageType: message.messageType,
        mimeType: message.mimeType,
        duration: message.duration,
      });
    } catch (error) {
      console.error("View-once open error:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

/**
 * @route   DELETE /api/rooms/:roomId/messages/:messageId
 * @desc    Delete a message (for everyone or for me)
 * @access  Private
 */
router.delete(
  "/:roomId/messages/:messageId",
  authMiddleware,
  async (req, res) => {
    try {
      const { deleteForEveryone } = req.query;

      const room = await requireRoomMember(req, res, req.params.roomId);
      if (!room) return;

      const message = await Message.findOne({
        _id: req.params.messageId,
        room: req.params.roomId,
      });

      if (!message) {
        return res.status(404).json({ message: "Message not found" });
      }

      if (deleteForEveryone === "true") {
        // Only sender can delete for everyone
        if (message.sender.toString() !== req.userId) {
          return res
            .status(403)
            .json({ message: "Only sender can delete for everyone" });
        }
        message.isDeleted = true;
        message.content = "This message was deleted";
        message.mediaUrl = null;
        message.thumbnailUrl = null;
        message.deletedAt = new Date();
        await message.save();

        // Reach every participant, including the ones who do not have this
        // chat open, so the bubble disappears on their side too.
        const io = req.app.get("io");
        if (io) {
          const { notifyMessageDeleted } = require("../socket");
          notifyMessageDeleted(io, {
            roomId: String(room._id),
            messageId: String(message._id),
            participants: room.participants.map(String),
            actorId: req.userId,
          });
        }
      } else {
        // Delete for me only
        if (!message.deletedFor.includes(req.userId)) {
          message.deletedFor.push(req.userId);
          await message.save();
        }
      }

      res.json({ message: "Message deleted successfully" });
    } catch (error) {
      console.error("Delete message error:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

/**
 * @route   POST /api/rooms/:roomId/messages/:messageId/forward
 * @desc    Forward a message to another room
 * @access  Private
 */
router.post(
  "/:roomId/messages/:messageId/forward",
  authMiddleware,
  async (req, res) => {
    try {
      const { targetRoomId } = req.body;

      if (!targetRoomId) {
        return res.status(400).json({ message: "targetRoomId is required" });
      }

      // Must be a member of the source room...
      const sourceRoom = await requireRoomMember(req, res, req.params.roomId);
      if (!sourceRoom) return;

      // ...and of the destination room
      const targetRoom = await requireRoomMember(req, res, targetRoomId);
      if (!targetRoom) return;

      const originalMessage = await Message.findOne({
        _id: req.params.messageId,
        room: req.params.roomId,
      });

      if (!originalMessage) {
        return res.status(404).json({ message: "Message not found" });
      }

      // Get user info
      const user = await User.findById(req.userId);

      const forwardedMessage = new Message({
        room: targetRoomId,
        sender: req.userId,
        senderName: user.username,
        content: originalMessage.content,
        messageType: "forwarded",
        mediaUrl: originalMessage.mediaUrl,
        fileName: originalMessage.fileName,
        fileSize: originalMessage.fileSize,
        mimeType: originalMessage.mimeType,
        duration: originalMessage.duration,
        forwardedFrom: originalMessage._id,
      });

      await forwardedMessage.save();

      // Keep the destination chat list in sync
      await Room.findByIdAndUpdate(targetRoomId, {
        lastMessage: {
          content: originalMessage.content || originalMessage.fileName || "Attachment",
          timestamp: forwardedMessage.timestamp,
          sender: req.userId,
        },
      });

      res.status(201).json(forwardedMessage);
    } catch (error) {
      console.error("Forward message error:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

/**
 * @route   GET /api/rooms/:roomId/calls
 * @desc    Get call logs for a room
 * @access  Private
 */
router.get("/:roomId/calls", authMiddleware, async (req, res) => {
  try {
    const room = await requireRoomMember(req, res, req.params.roomId);
    if (!room) return;

    const calls = await CallLog.find({ room: req.params.roomId })
      .populate("caller", "username")
      .populate("participants", "username")
      .sort({ startTime: -1 })
      .limit(50);

    res.json(calls);
  } catch (error) {
    console.error("Get call logs error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * @route   POST /api/rooms/:roomId/calls
 * @desc    Create a call log entry
 * @access  Private
 */
router.post("/:roomId/calls", authMiddleware, async (req, res) => {
  try {
    const { callType, status, duration, participants, endTime } = req.body;

    const room = await requireRoomMember(req, res, req.params.roomId);
    if (!room) return;

    const user = await User.findById(req.userId);

    const callLog = new CallLog({
      room: req.params.roomId,
      caller: req.userId,
      callerName: user.username,
      callType,
      status,
      duration: duration || 0,
      participants: participants || [req.userId],
      endTime: endTime || new Date(),
    });

    await callLog.save();

    res.status(201).json(callLog);
  } catch (error) {
    console.error("Create call log error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
