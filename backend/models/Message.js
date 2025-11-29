const mongoose = require("mongoose");

/**
 * Message Schema for storing chat messages
 */
const messageSchema = new mongoose.Schema({
  room: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Room",
    required: true,
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  senderName: {
    type: String,
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  messageType: {
    type: String,
    enum: ["text", "image", "file", "forwarded"],
    default: "text",
  },
  forwardedFrom: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Message",
  },
  isDeleted: {
    type: Boolean,
    default: false,
  },
  deletedFor: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  readBy: [
    {
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      readAt: {
        type: Date,
        default: Date.now,
      },
    },
  ],
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Message", messageSchema);
