const mongoose = require("mongoose");
require("dotenv").config();
const Room = require("../models/Room");
const Message = require("../models/Message");
const User = require("../models/User");

/**
 * Create all necessary database indexes
 * Run once during deployment
 */
const createIndexes = async () => {
  try {
    console.log("🔄 Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI);

    console.log("📝 Creating User indexes...");
    await User.collection.createIndex({ email: 1 }, { unique: true });
    await User.collection.createIndex({ username: 1 }, { unique: true });
    console.log("✅ User indexes created");

    console.log("📝 Creating Room indexes...");
    // Unique index for direct chats
    await Room.collection.createIndex(
      { participants: 1, isDirectChat: 1 },
      { unique: false }
    );
    // Composite index for efficient queries
    await Room.collection.createIndex({
      participants: 1,
      createdAt: -1,
    });
    console.log("✅ Room indexes created");

    console.log("📝 Creating Message indexes...");
    await Message.collection.createIndex({ room: 1, timestamp: 1 });
    await Message.collection.createIndex({ room: 1, isDeleted: 1 });
    await Message.collection.createIndex({ sender: 1, timestamp: -1 });
    await Message.collection.createIndex({ timestamp: -1 });
    console.log("✅ Message indexes created");

    console.log("✅ All indexes created successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
};

createIndexes();
