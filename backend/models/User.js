const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

/**
 * User Schema for authentication
 */
const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    index: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  },
  password: {
    type: String,
    required: true,
    minlength: 6,
  },
  avatar: {
    type: String,
    default: null,
  },
  status: {
    type: String,
    enum: ["online", "offline", "away"],
    default: "offline",
  },
  lastSeen: {
    type: Date,
    default: Date.now,
  },
  about: {
    type: String,
    default: "Hey there! I am using Blue Sea Chat.",
    maxlength: 140,
  },
  /**
   * People this user has explicitly added or already chatted with.
   * The contact list - not the whole user table - is what the app shows.
   * Everyone else has to be found through search.
   */
  contacts: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  customUID: {
    type: String,
    unique: true,
    sparse: true,
  },
  refreshTokens: [
    {
      token: {
        type: String,
        required: true,
      },
      expiresAt: {
        type: Date,
        required: true,
      },
    },
  ],
  lastLogin: {
    type: Date,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

/**
 * Hash password before saving
 */
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    return next();
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

/**
 * Compare entered password with hashed password
 */
userSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

/**
 * Add refresh token
 */
userSchema.methods.addRefreshToken = function (token, expiresAt) {
  // Remove expired tokens
  this.refreshTokens = this.refreshTokens.filter((rt) => rt.expiresAt > new Date());
  // Add new token
  this.refreshTokens.push({ token, expiresAt });
};

/**
 * Revoke token
 */
userSchema.methods.revokeToken = function (token) {
  this.refreshTokens = this.refreshTokens.filter((rt) => rt.token !== token);
};

/**
 * Revoke all tokens (logout all devices)
 */
userSchema.methods.revokeAllTokens = function () {
  this.refreshTokens = [];
};

/**
 * Find by refresh token
 */
userSchema.statics.findByRefreshToken = async function (token) {
  return await this.findOne({
    "refreshTokens.token": token,
    "refreshTokens.expiresAt": { $gt: Date.now() },
  });
};

/**
 * Add `otherId` to this user's contacts (and vice versa) exactly once.
 * Chatting with somebody is what puts them in your list, the same way a
 * phone puts a number in your contacts once you dial it.
 */
userSchema.statics.linkContacts = async function (userId, otherId) {
  if (String(userId) === String(otherId)) return;
  await this.bulkWrite([
    {
      updateOne: {
        filter: { _id: userId },
        update: { $addToSet: { contacts: otherId } },
      },
    },
    {
      updateOne: {
        filter: { _id: otherId },
        update: { $addToSet: { contacts: userId } },
      },
    },
  ]);
};

/**
 * Directory search. Matches a username/email prefix, or an exact @handle.
 * Returns a small, safe projection - never the password or refresh tokens.
 */
userSchema.statics.searchDirectory = async function (query, excludeUserId, limit = 20) {
  const term = String(query || "").trim().replace(/^@/, "");
  if (term.length < 1) return [];

  // Escape regex metacharacters so a user cannot inject a pattern
  const safe = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  return this.find({
    _id: { $ne: excludeUserId },
    $or: [
      { username: { $regex: `^${safe}`, $options: "i" } },
      { username: { $regex: safe, $options: "i" } },
      { email: { $regex: `^${safe}`, $options: "i" } },
    ],
  })
    .select("username email avatar status lastSeen about")
    .limit(limit)
    .sort({ username: 1 });
};

module.exports = mongoose.model("User", userSchema);
