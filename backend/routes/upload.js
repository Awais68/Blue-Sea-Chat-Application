const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const authMiddleware = require("../middleware/auth");
const { isCloudinaryConfigured, uploadBuffer } = require("../config/storage");

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/**
 * Allowed mime types mapped to the message type stored in the DB.
 * Anything not listed here is rejected.
 */
const MIME_TO_TYPE = {
  "image/jpeg": "image",
  "image/png": "image",
  "image/gif": "image",
  "image/webp": "image",
  "video/mp4": "video",
  "video/webm": "video",
  "video/quicktime": "video",
  "audio/mpeg": "audio",
  "audio/mp3": "audio",
  "audio/wav": "audio",
  "audio/ogg": "audio",
  "audio/webm": "voice-note",
  "application/pdf": "file",
  "application/msword": "file",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "file",
  "application/vnd.ms-excel": "file",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "file",
  "application/zip": "file",
  "text/plain": "file",
};

// With Cloudinary the file never touches this server's disk; without it we
// fall back to ./uploads, which only survives on a host with a real disk.
const storage = isCloudinaryConfigured
  ? multer.memoryStorage()
  : multer.diskStorage({
      destination: (req, file, cb) => cb(null, UPLOAD_DIR),
      filename: (req, file, cb) => {
        // Never trust the client filename on disk - keep only the extension
        const ext = path
          .extname(file.originalname)
          .slice(0, 10)
          .replace(/[^.\w]/g, "");
        cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`);
      },
    });

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
  fileFilter: (req, file, cb) => {
    if (MIME_TO_TYPE[file.mimetype]) {
      return cb(null, true);
    }
    cb(new Error(`Unsupported file type: ${file.mimetype}`));
  },
});

/**
 * @route   POST /api/upload
 * @desc    Upload a chat attachment (image/video/audio/voice-note/file)
 * @access  Private
 */
router.post("/", authMiddleware, (req, res) => {
  upload.single("file")(req, res, async (err) => {
    if (err) {
      const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
      return res.status(status).json({ message: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    // A voice note is an audio/webm blob explicitly flagged by the client
    let messageType = MIME_TO_TYPE[req.file.mimetype];
    if (req.body.messageType === "voice-note") {
      messageType = "voice-note";
    }

    let mediaUrl;
    if (isCloudinaryConfigured) {
      try {
        mediaUrl = await uploadBuffer(req.file.buffer, {
          messageType,
          originalName: req.file.originalname,
        });
      } catch (uploadError) {
        console.error("Cloudinary upload failed:", uploadError);
        return res.status(502).json({ message: "Upload failed, please retry" });
      }
    } else {
      mediaUrl = `/uploads/${req.file.filename}`;
    }

    res.status(201).json({
      mediaUrl,
      messageType,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      duration: req.body.duration ? Number(req.body.duration) : null,
    });
  });
});

module.exports = router;
