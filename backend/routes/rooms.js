const express = require("express");
const Room = require("../models/Room");
const Message = require("../models/Message");
const CallLog = require("../models/CallLog");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

/**
 * @route   GET /api/rooms
 * @desc    Get all rooms
 * @access  Private
 */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const rooms = await Room.find()
      .populate("createdBy", "username")
      .sort({ createdAt: -1 });

    res.json(rooms);
  } catch (error) {
    console.error("Get rooms error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * @route   POST /api/rooms
 * @desc    Create a new room
 * @access  Private
 */
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { name, description } = req.body;

    // Check if room already exists
    let room = await Room.findOne({ name });
    if (room) {
      return res.status(400).json({ message: "Room already exists" });
    }

    room = new Room({
      name,
      description,
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
