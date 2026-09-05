const mongoose = require("mongoose");

/**
 * Room Schema for peer-to-peer direct chats and groups
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
    index: true,
  },
  isGroup: {
    type: Boolean,
    default: false,
    index: true,
  },
  groupAvatar: {
    type: String,
    default: null,
  },
  /** Group admins. The creator is always an admin. */
  admins: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  participants: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
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
    index: true,
  },
});

// Compound index for finding direct chats efficiently
roomSchema.index(
  { participants: 1, isDirectChat: 1 },
  {
    unique: false,
    partialFilterExpression: { isDirectChat: true },
  }
);

// Index for user's rooms
roomSchema.index({ participants: 1, createdAt: -1 });

/**
 * Static method to find or create a direct chat
 * Prevents race conditions when creating chats
 */
roomSchema.statics.findOrCreateDirectChat = async function (
  userId1,
  userId2
) {
  // Ensure consistent ordering to prevent duplicate rooms
  const [p1, p2] = [userId1, userId2].sort((a, b) =>
    a.toString().localeCompare(b.toString())
  );

  // Try to find existing chat
  let room = await this.findOne({
    isDirectChat: true,
    participants: { $all: [p1, p2], $size: 2 },
  });

  if (room) {
    return room;
  }

  // Create new chat with atomic operation
  try {
    room = new this({
      isDirectChat: true,
      createdBy: userId1,
      participants: [p1, p2],
    });
    await room.save();
    return room;
  } catch (error) {
    // Handle race condition: try to find again
    if (error.code === 11000) {
      const existing = await this.findOne({
        isDirectChat: true,
        participants: { $all: [p1, p2], $size: 2 },
      });
      if (existing) return existing;

      // A duplicate-key error that is NOT the concurrent-create race means a
      // stale unique index is blocking inserts (see scripts/fix-indexes.js).
      throw new Error(
        `Cannot create direct chat - duplicate key on ${JSON.stringify(
          error.keyPattern || {}
        )}. Run: node scripts/fix-indexes.js`
      );
    }
    throw error;
  }
};

/**
 * Create a group chat. The creator is a participant and the first admin.
 */
roomSchema.statics.createGroup = async function ({
  name,
  description = "",
  createdBy,
  participants = [],
}) {
  const trimmed = String(name || "").trim();
  if (trimmed.length < 1) {
    throw new Error("Group name is required");
  }
  if (trimmed.length > 60) {
    throw new Error("Group name is too long");
  }

  // De-duplicate and always include the creator
  const members = Array.from(
    new Set([String(createdBy), ...participants.map(String)])
  );

  if (members.length < 2) {
    throw new Error("A group needs at least one other member");
  }
  if (members.length > 256) {
    throw new Error("A group can hold at most 256 members");
  }

  const room = new this({
    name: trimmed,
    description: String(description || "").slice(0, 200),
    isDirectChat: false,
    isGroup: true,
    createdBy,
    admins: [createdBy],
    participants: members,
  });

  await room.save();
  return room;
};

/** True when `userId` may administer this group. */
roomSchema.methods.isAdmin = function (userId) {
  return (
    String(this.createdBy) === String(userId) ||
    this.admins.some((a) => String(a) === String(userId))
  );
};

module.exports = mongoose.model("Room", roomSchema);
