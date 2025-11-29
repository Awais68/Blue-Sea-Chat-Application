const express = require("express");
const Room = require("../models/Room");
const Message = require("../models/Message");
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
    const messages = await Message.find({ room: req.params.roomId })
      .populate("sender", "username")
      .sort({ timestamp: 1 })
      .limit(100);

    res.json(messages);
  } catch (error) {
    console.error("Get messages error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
