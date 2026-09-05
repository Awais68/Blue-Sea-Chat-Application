const xss = require("xss");

/**
 * Custom whitelist for message content
 * Allows basic HTML but blocks scripts
 */
const messageWhitelist = {
  // Allow basic formatting
  a: ["href", "title"],
  b: ["style"],
  i: ["style"],
  u: ["style"],
  br: [],
  p: [],
  // No script, iframe, or event handlers
};

/**
 * Sanitize message content
 */
const sanitizeMessage = (content) => {
  if (!content || typeof content !== "string") {
    throw new Error("Message content must be a non-empty string");
  }

  if (content.trim().length === 0) {
    throw new Error("Message cannot be empty");
  }

  if (content.length > 5000) {
    throw new Error("Message exceeds 5000 character limit");
  }

  return xss(content, { whitelist: messageWhitelist });
};

/**
 * Validate message metadata
 */
const validateMessage = (message) => {
  const { content, messageType = "text" } = message;

  const validTypes = ["text", "image", "video", "audio", "voice-note", "file", "forwarded"];

  if (!validTypes.includes(messageType)) {
    throw new Error(`Invalid message type: ${messageType}`);
  }

  // Text messages must have content
  if (messageType === "text" && !content) {
    throw new Error("Text messages must include content");
  }

  // Media messages must carry a media URL - a caption alone is not enough
  if (
    ["image", "video", "audio", "voice-note", "file"].includes(messageType) &&
    !message.mediaUrl
  ) {
    throw new Error(`Attachment of type "${messageType}" requires a mediaUrl`);
  }

  return true;
};

module.exports = { sanitizeMessage, validateMessage };
