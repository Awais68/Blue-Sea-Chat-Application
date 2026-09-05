const mongoose = require("mongoose");
const mongoosePaginate = require("mongoose-paginate-v2");

/**
 * Message Schema for storing chat messages
 */
const messageSchema = new mongoose.Schema({
  room: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Room",
    required: true,
    index: true,
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  senderName: {
    type: String,
    required: true,
  },
  content: {
    type: String,
    default: "",
  },
  messageType: {
    type: String,
    enum: ["text", "image", "video", "audio", "voice-note", "file", "forwarded"],
    default: "text",
  },
  mediaUrl: {
    type: String,
    default: null,
  },
  thumbnailUrl: {
    type: String,
    default: null,
  },
  duration: {
    // For audio/video files in seconds
    type: Number,
    default: null,
  },
  fileName: {
    // Original file name for file/media attachments
    type: String,
    default: null,
  },
  fileSize: {
    // File size in bytes
    type: Number,
    default: null,
  },
  mimeType: {
    type: String,
    default: null,
  },
  forwardedFrom: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Message",
  },
  repliedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Message",
  },
  reactions: [
    {
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      emoji: String, // "👍", "❤️", "😂", etc
      addedAt: {
        type: Date,
        default: Date.now,
      },
    },
  ],
  /**
   * View-once media: the attachment can be opened one time by each
   * recipient, after which the media is no longer served to them.
   */
  viewOnce: {
    type: Boolean,
    default: false,
  },
  viewedBy: [
    {
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      viewedAt: {
        type: Date,
        default: Date.now,
      },
    },
  ],
  isDeleted: {
    type: Boolean,
    default: false,
  },
  deletedAt: {
    type: Date,
    default: null,
  },
  deletedFor: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  status: {
    // sent → delivered → read
    type: String,
    enum: ["sent", "delivered", "read"],
    default: "sent",
  },
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
  isEdited: {
    type: Boolean,
    default: false,
  },
  editHistory: [
    {
      content: String,
      editedAt: {
        type: Date,
        default: Date.now,
      },
    },
  ],
  mentions: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

/**
 * The shape a given viewer is allowed to see.
 * Strips the media URL of a view-once message that this viewer already
 * opened (or that the sender's own client should no longer replay),
 * so "seen once" is enforced by the server, not by the UI.
 */
messageSchema.methods.forViewer = function (viewerId) {
  const obj = this.toObject ? this.toObject() : { ...this };
  const viewer = String(viewerId);
  const senderId = String(obj.sender?._id || obj.sender);

  obj.viewOnceOpened = (obj.viewedBy || []).some(
    (v) => String(v.user?._id || v.user) === viewer
  );

  if (obj.viewOnce && obj.viewOnceOpened) {
    obj.mediaUrl = null;
    obj.thumbnailUrl = null;
  }

  // The sender never gets to re-watch their own view-once media either
  if (obj.viewOnce && senderId === viewer && (obj.viewedBy || []).length > 0) {
    obj.mediaUrl = null;
    obj.thumbnailUrl = null;
    obj.viewOnceOpened = true;
  }

  if (obj.isDeleted) {
    obj.mediaUrl = null;
    obj.thumbnailUrl = null;
  }

  delete obj.viewedBy;
  return obj;
};

// Compound index for efficient querying
messageSchema.index({ room: 1, timestamp: 1 });
messageSchema.index({ room: 1, isDeleted: 1 });

// Add pagination plugin
messageSchema.plugin(mongoosePaginate);

module.exports = mongoose.model("Message", messageSchema);
