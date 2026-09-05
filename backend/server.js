require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const connectDB = require("./config/db");
const authRoutes = require("./routes/auth");
const roomRoutes = require("./routes/rooms");
const uploadRoutes = require("./routes/upload");
const initializeSocket = require("./socket");
const { generalLimiter } = require("./middleware/rateLimiter");

const app = express();
const server = http.createServer(app);

// Render / Vercel put the app behind a reverse proxy. Without this,
// express-rate-limit sees the proxy IP for every request and buckets all
// users together, and req.ip is useless.
app.set("trust proxy", 1);

// CORS origins.
// Exact hosts we always trust...
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "https://blue-sea-chat-application.vercel.app",
  process.env.FRONTEND_URL,
].filter(Boolean);

// ...plus every preview deployment of this project on Vercel, whose hostname
// changes with each branch/commit and cannot be listed up front.
const allowedOriginPatterns = [
  /^https:\/\/blue-sea-chat-application-[a-z0-9-]+\.vercel\.app$/,
];

/**
 * cors() origin callback. Requests with no Origin header (curl, health checks,
 * server-to-server) are allowed through.
 */
const corsOrigin = (origin, callback) => {
  if (!origin) return callback(null, true);
  if (allowedOrigins.includes(origin)) return callback(null, true);
  if (allowedOriginPatterns.some((re) => re.test(origin))) {
    return callback(null, true);
  }
  const error = new Error(`Origin not allowed by CORS: ${origin}`);
  error.status = 403;
  callback(error);
};

// Initialize Socket.IO with CORS
const io = new Server(server, {
  cors: {
    origin: corsOrigin,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// REST handlers need the socket server to push live updates (deleted
// messages, view-once opens, new groups) to users who are not in the room.
app.set("io", io);

// Connect to MongoDB
connectDB();

// Middleware
// Security headers.
// crossOriginResourcePolicy is relaxed so the Next.js frontend (different
// origin) can load uploaded images/video/audio from /uploads.
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
  })
);

// Rate limiting on API routes only (static uploads are excluded)
app.use("/api", generalLimiter);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded attachments
app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"), {
    maxAge: "7d",
    setHeaders: (res) => {
      // Force download semantics instead of inline execution for anything
      // the browser might try to run.
      res.setHeader("X-Content-Type-Options", "nosniff");
    },
  })
);

// Routes
app.get("/", (req, res) => {
  res.json({
    message: "WebRTC Chat API Server",
    status: "running",
    endpoints: {
      auth: {
        signup: "POST /api/auth/signup",
        login: "POST /api/auth/login",
      },
      rooms: {
        getAll: "GET /api/rooms",
        create: "POST /api/rooms",
        messages: "GET /api/rooms/:roomId/messages",
      },
      upload: "POST /api/upload",
      health: "GET /health",
    },
    frontend: "http://localhost:3000",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/rooms", roomRoutes);
app.use("/api/upload", uploadRoutes);

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Server is running" });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// Central error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(err.status || 500).json({ message: err.message || "Server error" });
});

// Initialize Socket.IO handlers
initializeSocket(io);

// Start server
const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Socket.IO server ready`);
});
