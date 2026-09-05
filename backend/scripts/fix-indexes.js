/**
 * One-off migration: drop stale indexes left over from an older schema.
 *
 * `rooms.name_1` was created as a NON-sparse unique index. Direct chats have no
 * `name`, so every direct chat indexes as `name: null` and only ONE of them can
 * exist in the whole database - every later `POST /api/rooms/direct/:userId`
 * failed with E11000, findOrCreateDirectChat returned null and the route 500'd.
 *
 * `users.customUID_1` is unique on a field the current User schema no longer
 * has; it is dropped for the same reason.
 *
 * Run with: node scripts/fix-indexes.js
 */
require("dotenv").config();
const mongoose = require("mongoose");

const STALE = [
  { collection: "rooms", index: "name_1" },
  { collection: "users", index: "customUID_1" },
];

(async () => {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  for (const { collection, index } of STALE) {
    try {
      const existing = await db.collection(collection).indexes();
      if (!existing.some((i) => i.name === index)) {
        console.log(`- ${collection}.${index} already gone`);
        continue;
      }
      await db.collection(collection).dropIndex(index);
      console.log(`✓ dropped ${collection}.${index}`);
    } catch (error) {
      console.error(`✗ ${collection}.${index}: ${error.message}`);
    }
  }

  await mongoose.disconnect();
  console.log("Done.");
})();
