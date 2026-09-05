import { useState } from "react";
import { format } from "date-fns";
import {
  FiCheck,
  FiDownload,
  FiFile,
  FiPlay,
  FiCornerUpRight,
  FiEye,
  FiEyeOff,
} from "react-icons/fi";
import { mediaUrl } from "../utils/api";

const THEME_COLOR = "#00b3fd";
const THEME_DARK = "#0090cc";
const SENDER_MSG_COLOR = "#DCF8C6"; // your messages (right)
const RECEIVER_MSG_COLOR = "#FFFFFF"; // their messages (left)

/**
 * WhatsApp-style double tick.
 * sent = single grey, delivered = double grey, read = double blue.
 */
const StatusTicks = ({ status }) => {
  if (status === "sent" || !status) {
    return <FiCheck size={13} className="text-gray-400" />;
  }
  const color = status === "read" ? "#34B7F1" : "#9ca3af";
  return (
    <span className="relative inline-block w-4 h-3" style={{ color }}>
      <FiCheck size={13} className="absolute left-0 top-0" />
      <FiCheck size={13} className="absolute left-[4px] top-0" />
    </span>
  );
};

const formatBytes = (bytes) => {
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
};

const formatDuration = (seconds) => {
  if (!seconds && seconds !== 0) return "";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

/**
 * Renders message text with @mentions picked out.
 * The server has already resolved which handles are real members, but the
 * highlight is purely visual so matching on the text is enough here.
 */
const MessageText = ({ content, isSender, muted }) => {
  if (!content) return null;

  const parts = content.split(/(@[A-Za-z0-9_.-]{3,32})/g);

  return (
    <p
      className={`text-sm whitespace-pre-wrap break-words ${
        muted ? "italic text-gray-500" : "text-gray-800"
      }`}
    >
      {parts.map((part, index) =>
        part.startsWith("@") && !muted ? (
          <span
            key={index}
            className="font-semibold rounded px-0.5"
            style={{
              color: THEME_COLOR,
              backgroundColor: isSender
                ? "rgba(0,179,253,0.10)"
                : "rgba(0,179,253,0.08)",
            }}
          >
            {part}
          </span>
        ) : (
          part
        )
      )}
    </p>
  );
};

/**
 * The placeholder that stands in for view-once media.
 * The media itself is never sent with the message - it is fetched on tap and
 * the server refuses to serve it a second time.
 */
const ViewOnceCard = ({ message, isSender, opened, onOpen, loading }) => {
  const label = message.messageType === "video" ? "Video" : "Photo";

  if (opened) {
    return (
      <div className="flex items-center gap-2 mb-1 px-2 py-2 rounded-lg bg-black/5 min-w-[170px]">
        <FiEyeOff size={16} className="text-gray-400 shrink-0" />
        <span className="text-sm text-gray-500 italic">
          {isSender ? "Opened" : `${label} opened`}
        </span>
      </div>
    );
  }

  if (isSender) {
    return (
      <div className="flex items-center gap-2 mb-1 px-2 py-2 rounded-lg bg-black/5 min-w-[170px]">
        <FiEye size={16} style={{ color: THEME_COLOR }} className="shrink-0" />
        <span className="text-sm text-gray-600">View once {label.toLowerCase()}</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={loading}
      onClick={(event) => {
        event.stopPropagation();
        onOpen?.(message);
      }}
      className="flex items-center gap-2 mb-1 px-3 py-2 rounded-lg transition-colors min-w-[170px] disabled:opacity-60"
      style={{ backgroundColor: "rgba(0,179,253,0.12)" }}
    >
      <span
        className="w-7 h-7 rounded-full flex items-center justify-center text-white shrink-0"
        style={{ backgroundColor: THEME_COLOR }}
      >
        <FiEye size={14} />
      </span>
      <span className="text-sm font-medium" style={{ color: THEME_DARK }}>
        {loading ? "Opening…" : `View once · ${label}`}
      </span>
    </button>
  );
};

/**
 * Renders the attachment part of a message (everything except text).
 */
const Attachment = ({ message, onOpenImage }) => {
  const url = mediaUrl(message.mediaUrl);

  switch (message.messageType) {
    case "image":
      return (
        <img
          src={url}
          alt={message.fileName || "image"}
          onClick={() => onOpenImage?.(url)}
          className="rounded-lg max-w-full max-h-72 object-cover cursor-pointer mb-1"
          loading="lazy"
        />
      );

    case "video":
      return (
        <video
          src={url}
          controls
          playsInline
          preload="metadata"
          className="rounded-lg max-w-full max-h-72 mb-1"
        />
      );

    case "voice-note":
      return (
        <div className="flex items-center gap-2 mb-1 min-w-[200px]">
          <span
            className="w-8 h-8 rounded-full flex items-center justify-center text-white shrink-0"
            style={{ backgroundColor: THEME_COLOR }}
          >
            <FiPlay size={14} />
          </span>
          <audio src={url} controls preload="metadata" className="h-8 w-full" />
          {message.duration ? (
            <span className="text-[10px] text-gray-500 shrink-0">
              {formatDuration(message.duration)}
            </span>
          ) : null}
        </div>
      );

    case "audio":
      return (
        <div className="mb-1 min-w-[220px]">
          <p className="text-xs text-gray-600 truncate mb-1">
            {message.fileName}
          </p>
          <audio src={url} controls preload="metadata" className="w-full h-9" />
        </div>
      );

    case "file":
      return (
        <a
          href={url}
          download={message.fileName || true}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 mb-1 p-2 rounded-lg bg-black/5 hover:bg-black/10 transition-colors min-w-[200px]"
        >
          <span
            className="w-10 h-10 rounded-lg flex items-center justify-center text-white shrink-0"
            style={{ backgroundColor: THEME_COLOR }}
          >
            <FiFile size={20} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm text-gray-800 truncate">
              {message.fileName || "File"}
            </span>
            <span className="block text-[11px] text-gray-500">
              {formatBytes(message.fileSize)}
            </span>
          </span>
          <FiDownload size={16} className="text-gray-500 shrink-0" />
        </a>
      );

    default:
      return null;
  }
};

/**
 * A single chat bubble. Handles text, all attachment types, forwarded
 * markers, delivery ticks and selection state.
 */
const MessageBubble = ({
  message,
  isSender,
  isSelected,
  isSelectionMode,
  isGroup,
  onSelect,
  onContextMenu,
  onOpenImage,
  onOpenViewOnce,
  viewOnceLoading,
}) => {
  const [imgError, setImgError] = useState(false);

  const isViewOnce = !!message.viewOnce;
  const viewOnceOpened = !!message.viewOnceOpened;

  const hasAttachment =
    !isViewOnce &&
    message.messageType &&
    message.messageType !== "text" &&
    message.messageType !== "forwarded" &&
    message.mediaUrl;

  return (
    <div
      className={`flex mb-2 ${isSender ? "justify-end" : "justify-start"}`}
      onClick={() => isSelectionMode && onSelect?.(message._id)}
      onContextMenu={(e) => onContextMenu?.(e, message)}
    >
      <div
        className={`relative max-w-[75%] px-2 py-1.5 rounded-lg shadow ${
          isSelected ? "ring-2 ring-blue-400" : ""
        }`}
        style={{
          backgroundColor: isSender ? SENDER_MSG_COLOR : RECEIVER_MSG_COLOR,
          borderTopRightRadius: isSender ? 0 : 8,
          borderTopLeftRadius: !isSender ? 0 : 8,
        }}
      >
        <div
          className="absolute top-0 w-0 h-0"
          style={
            isSender
              ? {
                  right: -8,
                  borderLeft: `8px solid ${SENDER_MSG_COLOR}`,
                  borderTop: "8px solid transparent",
                }
              : {
                  left: -8,
                  borderRight: `8px solid ${RECEIVER_MSG_COLOR}`,
                  borderTop: "8px solid transparent",
                }
          }
        />

        {message.messageType === "forwarded" && (
          <div className="flex items-center gap-1 text-gray-500 text-xs mb-1 italic">
            <FiCornerUpRight size={12} />
            Forwarded
          </div>
        )}

        {!isSender && isGroup && (
          <p
            className="text-xs font-semibold mb-1"
            style={{ color: THEME_COLOR }}
          >
            {message.senderName || message.sender?.username}
          </p>
        )}

        {isViewOnce && !message.isDeleted && (
          <ViewOnceCard
            message={message}
            isSender={isSender}
            opened={viewOnceOpened}
            onOpen={onOpenViewOnce}
            loading={viewOnceLoading}
          />
        )}

        {hasAttachment && !message.isDeleted && !imgError && (
          <div onError={() => setImgError(true)}>
            <Attachment message={message} onOpenImage={onOpenImage} />
          </div>
        )}

        {(message.content || (!hasAttachment && !isViewOnce)) && (
          <MessageText
            content={message.content}
            isSender={isSender}
            muted={message.isDeleted}
          />
        )}

        <div className="flex items-center justify-end gap-1 mt-0.5">
          {message.pending && (
            <span className="text-[10px] text-gray-400">sending…</span>
          )}
          {message.failed && (
            <span className="text-[10px] text-red-500">failed</span>
          )}
          <span className="text-[10px] text-gray-500">
            {message.timestamp
              ? format(new Date(message.timestamp), "HH:mm")
              : ""}
          </span>
          {isSender && !message.isDeleted && !message.pending && (
            <StatusTicks status={message.status} />
          )}
        </div>

        {isSelectionMode && (
          <div
            className="absolute -left-6 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-2 flex items-center justify-center"
            style={{
              backgroundColor: isSelected ? THEME_COLOR : "white",
              borderColor: isSelected ? THEME_COLOR : "#9ca3af",
            }}
          >
            {isSelected && <FiCheck size={12} className="text-white" />}
          </div>
        )}
      </div>
    </div>
  );
};

export default MessageBubble;
