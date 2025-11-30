const express = require("express");
const Room = require("../models/Room");
const Message = require("../models/Message");
const CallLog = require("../models/CallLog");
const User = require("../models/User");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

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
      .populate("participants", "username email")
      .populate("createdBy", "username")
      .populate("lastMessage.sender", "username")
      .sort({ "lastMessage.timestamp": -1, createdAt: -1 });

    // For direct chats, show the other person's name
    const formattedRooms = rooms.map((room) => {
      const roomObj = room.toObject();
      if (room.isDirectChat && room.participants.length === 2) {
        const otherUser = room.participants.find(
          (p) => p._id.toString() !== req.userId
        );
        if (otherUser) {
          roomObj.name = otherUser.username;
          roomObj.otherUser = otherUser;
        }
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
 * @route   GET /api/rooms/users
 * @desc    Get all users for starting a new chat
 * @access  Private
 */
router.get("/users", authMiddleware, async (req, res) => {
  try {
    const users = await User.find({ _id: { $ne: req.userId } })
      .select("username email createdAt")
      .sort({ username: 1 });

    res.json(users);
  } catch (error) {
    console.error("Get users error:", error);
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

    // Check if target user exists
    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if direct chat already exists between these two users
    let room = await Room.findOne({
      isDirectChat: true,
      participants: { $all: [req.userId, targetUserId], $size: 2 },
    }).populate("participants", "username email");

    if (room) {
      // Return existing chat
      const roomObj = room.toObject();
      const otherUser = room.participants.find(
        (p) => p._id.toString() !== req.userId
      );
      roomObj.name = otherUser?.username;
      roomObj.otherUser = otherUser;
      return res.json(roomObj);
    }

    // Create new direct chat
    room = new Room({
      isDirectChat: true,
      createdBy: req.userId,
      participants: [req.userId, targetUserId],
    });

    await room.save();
    await room.populate("participants", "username email");

    const roomObj = room.toObject();
    roomObj.name = targetUser.username;
    roomObj.otherUser = { _id: targetUser._id, username: targetUser.username };

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

      // Check if direct chat already exists
      let room = await Room.findOne({
        isDirectChat: true,
        participants: { $all: [req.userId, targetUserId], $size: 2 },
      }).populate("participants", "username email");

      if (room) {
        const roomObj = room.toObject();
        const otherUser = room.participants.find(
          (p) => p._id.toString() !== req.userId
        );
        roomObj.name = otherUser?.username;
        return res.json(roomObj);
      }

      room = new Room({
        isDirectChat: true,
        createdBy: req.userId,
        participants: [req.userId, targetUserId],
      });

      await room.save();
      await room.populate("participants", "username email");

      const roomObj = room.toObject();
      roomObj.name = targetUser.username;
      return res.status(201).json(roomObj);
    }

    // Legacy: Create named room
    let room = await Room.findOne({ name });
    if (room) {
      return res.status(400).json({ message: "Room already exists" });
    }

    room = new Room({
      name,
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
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * @route   GET /api/rooms/:roomId/messages
 * @desc    Get messages for a room
 * @access  Private
 */
router.get("/:roomId/messages", authMiddleware, async (req, res) => {
  try {
    const messages = await Message.find({
      room: req.params.roomId,
      isDeleted: false,
      deletedFor: { $ne: req.userId },
    })
      .populate("sender", "username")
      .sort({ timestamp: 1 })
      .limit(100);

    res.json(messages);
  } catch (error) {
    console.error("Get messages error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

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
      const message = await Message.findById(req.params.messageId);

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
        await message.save();
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
      const originalMessage = await Message.findById(req.params.messageId);

      if (!originalMessage) {
        return res.status(404).json({ message: "Message not found" });
      }

      // Get user info
      const User = require("../models/User");
      const user = await User.findById(req.userId);

      const forwardedMessage = new Message({
        room: targetRoomId,
        sender: req.userId,
        senderName: user.username,
        content: originalMessage.content,
        messageType: "forwarded",
        forwardedFrom: originalMessage._id,
      });

      await forwardedMessage.save();

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

    const User = require("../models/User");
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
