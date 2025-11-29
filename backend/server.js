require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const connectDB = require("./config/db");
const authRoutes = require("./routes/auth");
const roomRoutes = require("./routes/rooms");
const initializeSocket = require("./socket");

const app = express();
const server = http.createServer(app);

// CORS origins
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "https://blue-sea-chat-application.vercel.app",
  "https://blue-sea-chat-application-git-main-awais68.vercel.app",
  process.env.FRONTEND_URL,
].filter(Boolean);

// Initialize Socket.IO with CORS
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Connect to MongoDB
connectDB();

// Middleware
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
      health: "GET /health",
    },
    frontend: "http://localhost:3000",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/rooms", roomRoutes);

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Server is running" });
});

// Initialize Socket.IO handlers
initializeSocket(io);

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Socket.IO server ready`);
});
