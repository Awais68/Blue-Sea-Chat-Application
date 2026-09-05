const jwt = require("jsonwebtoken");

/**
 * Middleware to verify JWT token
 */
const authMiddleware = (req, res, next) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
      return res
        .status(401)
        .json({ message: "No token, authorization denied" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    console.error("JWT verification error:", error.message);
    res.status(401).json({
      message: "Token is not valid",
      error: error.message,
      hint: "Please login again",
    });
  }
};

module.exports = authMiddleware;
