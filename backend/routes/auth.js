const express = require("express");
const { body, validationResult } = require("express-validator");
const User = require("../models/User");
const { generateTokens, verifyRefreshToken, REFRESH_TOKEN_EXPIRY_MS } = require("../utils/token");
const { authLimiter } = require("../middleware/rateLimiter");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

/**
 * @route   POST /api/auth/signup
 * @desc    Register a new user
 * @access  Public
 */
router.post(
  "/signup",
  authLimiter,
  [
    body("username").isLength({ min: 3 }).trim(),
    body("email").isEmail().normalizeEmail(),
    body("password").isLength({ min: 6 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { username, email, password } = req.body;

      // Check if user already exists
      let user = await User.findOne({ $or: [{ email }, { username }] });
      if (user) {
        return res.status(400).json({ message: "User already exists" });
      }

      // Create new user
      user = new User({ username, email, password });
      await user.save();

      // Generate tokens
      const { accessToken, refreshToken } = generateTokens(user._id);

      // Store refresh token in DB
      const refreshTokenExpiry = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS);
      user.addRefreshToken(refreshToken, refreshTokenExpiry);
      user.lastLogin = new Date();
      await user.save();

      res.status(201).json({
        message: "User registered successfully",
        accessToken,
        refreshToken,
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
        },
      });
    } catch (error) {
      console.error("Signup error:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

/**
 * @route   POST /api/auth/login
 * @desc    Login user
 * @access  Public
 */
router.post(
  "/login",
  authLimiter,
  [body("email").isEmail().normalizeEmail(), body("password").exists()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password } = req.body;

      // Check if user exists
      const user = await User.findOne({ email });
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Validate password
      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Generate tokens
      const { accessToken, refreshToken } = generateTokens(user._id);

      // Store refresh token in DB
      const refreshTokenExpiry = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS);
      user.addRefreshToken(refreshToken, refreshTokenExpiry);
      user.lastLogin = new Date();
      await user.save();

      res.json({
        message: "Login successful",
        accessToken,
        refreshToken,
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
        },
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

/**
 * @route   POST /api/auth/refresh
 * @desc    Refresh access token using refresh token
 * @access  Public
 */
router.post("/refresh", async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({ message: "Refresh token required" });
    }

    // Verify refresh token
    const decoded = verifyRefreshToken(refreshToken);
    if (!decoded) {
      return res.status(401).json({ message: "Invalid or expired refresh token" });
    }

    // Find user with this refresh token
    const user = await User.findByRefreshToken(refreshToken);
    if (!user) {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    // Generate new tokens
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user._id);

    // Update refresh token in DB
    user.revokeToken(refreshToken);
    const refreshTokenExpiry = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS);
    user.addRefreshToken(newRefreshToken, refreshTokenExpiry);
    await user.save();

    res.json({
      accessToken,
      refreshToken: newRefreshToken,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Refresh token error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user (revoke refresh token)
 * @access  Private
 */
router.post("/logout", authMiddleware, async (req, res) => {
  try {
    const { refreshToken } = req.body;

    // Find and update user
    const user = await User.findById(req.userId);
    if (user && refreshToken) {
      user.revokeToken(refreshToken);
      await user.save();
    }

    res.json({ message: "Logout successful" });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * @route   POST /api/auth/logout-all
 * @desc    Logout from all devices
 * @access  Private
 */
router.post("/logout-all", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (user) {
      user.revokeAllTokens();
      await user.save();
    }

    res.json({ message: "Logged out from all devices" });
  } catch (error) {
    console.error("Logout all error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
