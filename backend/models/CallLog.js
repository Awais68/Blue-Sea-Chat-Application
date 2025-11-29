const mongoose = require("mongoose");

/**
 * Call Log Schema for storing call history
 */
const callLogSchema = new mongoose.Schema({
  room: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Room",
    required: true,
  },
  caller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  callerName: {
    type: String,
    required: true,
  },
  callType: {
    type: String,
    enum: ["audio", "video"],
    required: true,
  },
  status: {
    type: String,
    enum: ["missed", "answered", "rejected", "ended"],
    default: "missed",
  },
  duration: {
    type: Number, // in seconds
    default: 0,
  },
  participants: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  startTime: {
    type: Date,
    default: Date.now,
  },
  endTime: {
    type: Date,
  },
});

module.exports = mongoose.model("CallLog", callLogSchema);
