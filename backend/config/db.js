const mongoose = require("mongoose");

/**
 * Connect to MongoDB database
 */
const connectDB = async () => {
  try {
    // Check if MONGODB_URI is defined
    if (!process.env.MONGODB_URI) {
      throw new Error(
        "MONGODB_URI is not defined in environment variables. Please check your .env file."
      );
    }

    console.log("Connecting to MongoDB...");

    const conn = await mongoose.connect(process.env.MONGODB_URI);

    console.log(`✓ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`✗ Error connecting to MongoDB: ${error.message}`);
    console.error(`Please check:`);
    console.error(`  1. MongoDB connection string in .env file`);
    console.error(`  2. MongoDB Atlas network access (whitelist your IP)`);
    console.error(`  3. MongoDB Atlas user credentials`);
    process.exit(1);
  }
};

module.exports = connectDB;
