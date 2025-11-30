const mongoose = require("mongoose");

/**
 * Room Schema for peer-to-peer direct chats
 */
const roomSchema = new mongoose.Schema({
  name: {
    type: String,
    trim: true,
  },
  description: {
    type: String,
    default: "",
  },
  isDirectChat: {
    type: Boolean,
    default: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  participants: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  lastMessage: {
    content: String,
    timestamp: Date,
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Create unique index for direct chats between two users
roomSchema.index({ participants: 1, isDirectChat: 1 });

module.exports = mongoose.model("Room", roomSchema);
