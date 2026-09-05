const cloudinary = require("cloudinary").v2;

/**
 * Attachment storage backend.
 *
 * Render's filesystem is ephemeral: anything written to ./uploads disappears
 * on the next deploy or restart, so uploaded media silently 404s afterwards.
 * When Cloudinary credentials are present we upload there instead and store
 * the absolute secure_url on the message. Without credentials we keep writing
 * to local disk, which is what local development wants.
 */
const isCloudinaryConfigured = Boolean(
  process.env.CLOUDINARY_URL ||
    (process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET)
);

if (isCloudinaryConfigured) {
  // CLOUDINARY_URL is picked up automatically; the split vars are not.
  if (!process.env.CLOUDINARY_URL) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }
  cloudinary.config({ secure: true });
}

/**
 * Cloudinary splits uploads across three resource types. Documents and
 * archives have to go to "raw" or the upload is rejected.
 */
const resourceTypeFor = (messageType) => {
  if (messageType === "image") return "image";
  if (messageType === "video") return "video";
  // audio and voice-note are served by Cloudinary's video pipeline
  if (messageType === "audio" || messageType === "voice-note") return "video";
  return "raw";
};

/**
 * Upload a buffer and return the absolute URL to it.
 *
 * @param {Buffer} buffer
 * @param {Object} opts { messageType, originalName }
 * @returns {Promise<string>} absolute https URL
 */
const uploadBuffer = (buffer, { messageType, originalName }) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "blue-sea-chat",
        resource_type: resourceTypeFor(messageType),
        // Keep the extension so downloads land with a sane filename
        use_filename: true,
        unique_filename: true,
        filename_override: originalName,
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });

module.exports = { isCloudinaryConfigured, uploadBuffer };
