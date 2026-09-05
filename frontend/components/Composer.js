import { useState, useRef, useEffect } from "react";
import {
  FiSend,
  FiPaperclip,
  FiSmile,
  FiMic,
  FiTrash2,
  FiImage,
  FiVideo,
  FiFile,
  FiEye,
} from "react-icons/fi";

const THEME_COLOR = "#00b3fd";

const EMOJIS = [
  "😀","😁","😂","🤣","😊","😍","😘","😎","🤔","😐",
  "😴","😢","😭","😡","🥳","🤗","🙏","👍","👎","👏",
  "🔥","💯","🎉","❤️","💔","✨","⭐","☀️","🌙","🌧️",
  "🍕","☕","🎵","⚽","🚗","✈️","💻","📱","📎","✅",
];

/**
 * WhatsApp-style message composer: text, emoji picker, file attachments
 * (image / video / audio / document) and hold-to-record voice notes.
 */
const Composer = ({
  onSendText,
  onSendAttachment,
  onTyping,
  disabled,
  members = [],
}) => {
  const [text, setText] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [mentionQuery, setMentionQuery] = useState(null);

  const fileInputRef = useRef(null);
  const inputRef = useRef(null);
  const acceptRef = useRef("*/*");
  // Set by the "view once" entries in the attach menu, consumed by the very
  // next upload and then reset - it must never leak into a later send.
  const viewOnceRef = useRef(false);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const recordTimerRef = useRef(null);
  const recordStreamRef = useRef(null);
  const cancelRecordRef = useRef(false);
  const typingTimeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      recordStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const handleChange = (e) => {
    const value = e.target.value;
    setText(value);
    onTyping?.(true);

    // "@" plus whatever has been typed since, but only when it starts a word
    const match = value
      .slice(0, e.target.selectionStart ?? value.length)
      .match(/(?:^|\s)@([A-Za-z0-9_.-]*)$/);
    setMentionQuery(match ? match[1].toLowerCase() : null);

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => onTyping?.(false), 1500);
  };

  const mentionMatches =
    mentionQuery === null
      ? []
      : members
          .filter((m) => m.username?.toLowerCase().startsWith(mentionQuery))
          .slice(0, 6);

  /** Replace the half-typed @handle with the chosen username. */
  const applyMention = (username) => {
    setText((prev) => {
      const replaced = prev.replace(
        /(^|\s)@([A-Za-z0-9_.-]*)$/,
        `$1@${username} `
      );
      return replaced === prev ? `${prev}@${username} ` : replaced;
    });
    setMentionQuery(null);
    inputRef.current?.focus();
  };

  const submit = (e) => {
    e?.preventDefault();
    const value = text.trim();
    if (!value) return;
    onSendText(value);
    setText("");
    setShowEmoji(false);
    setMentionQuery(null);
    onTyping?.(false);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
  };

  const openFilePicker = (accept, viewOnce = false) => {
    acceptRef.current = accept;
    viewOnceRef.current = viewOnce;
    setShowAttachMenu(false);
    // The accept attribute has to be applied before the dialog opens
    if (fileInputRef.current) {
      fileInputRef.current.accept = accept;
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  const handleFileSelected = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      alert("File is too large. Maximum size is 25 MB.");
      return;
    }

    const viewOnce = viewOnceRef.current;
    viewOnceRef.current = false;

    try {
      setUploadProgress(0);
      await onSendAttachment(file, {
        caption: text.trim(),
        viewOnce,
        onProgress: setUploadProgress,
      });
      setText("");
    } catch (error) {
      alert(error?.response?.data?.message || "Upload failed");
    } finally {
      setUploadProgress(null);
    }
  };

  /* ---------------- voice notes ---------------- */

  const startRecording = async () => {
    if (recording || disabled) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      recordStreamRef.current = stream;
      recordedChunksRef.current = [];
      cancelRecordRef.current = false;

      // Pick a container the browser actually supports
      const mimeType = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/mp4",
      ].find((t) => MediaRecorder.isTypeSupported(t));

      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined
      );
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordedChunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        const duration = recordSeconds;
        stream.getTracks().forEach((t) => t.stop());
        recordStreamRef.current = null;

        if (cancelRecordRef.current || recordedChunksRef.current.length === 0) {
          return;
        }

        const blob = new Blob(recordedChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });

        try {
          setUploadProgress(0);
          await onSendAttachment(blob, {
            messageType: "voice-note",
            viewOnce: false,
            fileName: `voice-note-${Date.now()}.webm`,
            duration,
            onProgress: setUploadProgress,
          });
        } catch (error) {
          alert(error?.response?.data?.message || "Voice note upload failed");
        } finally {
          setUploadProgress(null);
        }
      };

      recorder.start();
      setRecording(true);
      setRecordSeconds(0);
      recordTimerRef.current = setInterval(
        () => setRecordSeconds((s) => s + 1),
        1000
      );
    } catch (error) {
      console.error("Recording error:", error);
      alert("Microphone access denied. Please allow it in browser settings.");
    }
  };

  const stopRecording = (cancel = false) => {
    cancelRecordRef.current = cancel;
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (mediaRecorderRef.current?.state !== "inactive") {
      mediaRecorderRef.current?.stop();
    }
    setRecording(false);
  };

  const formatRecordTime = (s) =>
    `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  /* ---------------- render ---------------- */

  return (
    <div className="relative z-10 bg-[#F0F0F0] px-2 py-2">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileSelected}
      />

      {uploadProgress !== null && (
        <div className="px-2 pb-2">
          <div className="h-1 bg-gray-300 rounded-full overflow-hidden">
            <div
              className="h-full transition-all"
              style={{
                width: `${uploadProgress}%`,
                backgroundColor: THEME_COLOR,
              }}
            />
          </div>
          <p className="text-[11px] text-gray-500 mt-1">
            Uploading… {uploadProgress}%
          </p>
        </div>
      )}

      {showEmoji && (
        <div className="absolute bottom-16 left-2 bg-white rounded-lg shadow-xl p-2 grid grid-cols-10 gap-1 w-[320px] max-h-52 overflow-y-auto z-50">
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => setText((prev) => prev + emoji)}
              className="text-xl hover:bg-gray-100 rounded p-0.5"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {showAttachMenu && (
        <div className="absolute bottom-16 right-14 bg-white rounded-lg shadow-xl py-2 w-52 z-50">
          <button
            type="button"
            onClick={() => openFilePicker("image/*")}
            className="w-full px-4 py-2 text-left text-gray-700 hover:bg-gray-100 flex items-center gap-3"
          >
            <FiImage size={18} style={{ color: THEME_COLOR }} /> Photo
          </button>
          <button
            type="button"
            onClick={() => openFilePicker("video/*")}
            className="w-full px-4 py-2 text-left text-gray-700 hover:bg-gray-100 flex items-center gap-3"
          >
            <FiVideo size={18} style={{ color: THEME_COLOR }} /> Video
          </button>
          <button
            type="button"
            onClick={() => openFilePicker("audio/*")}
            className="w-full px-4 py-2 text-left text-gray-700 hover:bg-gray-100 flex items-center gap-3"
          >
            <FiMic size={18} style={{ color: THEME_COLOR }} /> Audio
          </button>
          <button
            type="button"
            onClick={() =>
              openFilePicker(
                ".pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,application/pdf,text/plain,application/zip"
              )
            }
            className="w-full px-4 py-2 text-left text-gray-700 hover:bg-gray-100 flex items-center gap-3"
          >
            <FiFile size={18} style={{ color: THEME_COLOR }} /> Document
          </button>

          <div className="border-t my-1" />
          <p className="px-4 pb-1 text-[11px] uppercase tracking-wide text-gray-400">
            View once
          </p>
          <button
            type="button"
            onClick={() => openFilePicker("image/*", true)}
            className="w-full px-4 py-2 text-left text-gray-700 hover:bg-gray-100 flex items-center gap-3"
          >
            <FiEye size={18} style={{ color: THEME_COLOR }} /> Photo · once
          </button>
          <button
            type="button"
            onClick={() => openFilePicker("video/*", true)}
            className="w-full px-4 py-2 text-left text-gray-700 hover:bg-gray-100 flex items-center gap-3"
          >
            <FiEye size={18} style={{ color: THEME_COLOR }} /> Video · once
          </button>
        </div>
      )}

      {mentionMatches.length > 0 && (
        <div className="absolute bottom-16 left-2 right-2 sm:right-auto sm:w-72 bg-white rounded-lg shadow-xl py-1 max-h-52 overflow-y-auto z-50">
          {mentionMatches.map((member) => (
            <button
              key={member._id}
              type="button"
              onClick={() => applyMention(member.username)}
              className="w-full px-3 py-2 text-left hover:bg-gray-100 flex items-center gap-2"
            >
              <span
                className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                style={{ backgroundColor: THEME_COLOR }}
              >
                {member.username?.charAt(0).toUpperCase()}
              </span>
              <span className="text-sm text-gray-800 truncate">
                @{member.username}
              </span>
            </button>
          ))}
        </div>
      )}

      {recording ? (
        <div className="flex items-center gap-3 px-2">
          <button
            type="button"
            onClick={() => stopRecording(true)}
            className="p-2 text-red-500 hover:bg-gray-200 rounded-full"
            title="Cancel"
          >
            <FiTrash2 size={22} />
          </button>
          <span className="flex items-center gap-2 flex-1 text-gray-700">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            Recording… {formatRecordTime(recordSeconds)}
          </span>
          <button
            type="button"
            onClick={() => stopRecording(false)}
            className="w-11 h-11 text-white rounded-full flex items-center justify-center shadow-md"
            style={{ backgroundColor: THEME_COLOR }}
            title="Send voice note"
          >
            <FiSend size={20} />
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setShowEmoji((v) => !v);
              setShowAttachMenu(false);
            }}
            className="p-2 text-gray-600 hover:bg-gray-200 rounded-full transition-colors"
            title="Emoji"
          >
            <FiSmile size={24} />
          </button>

          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              value={text}
              onChange={handleChange}
              onKeyDown={(e) => {
                if (e.key === "Escape") setMentionQuery(null);
                // Enter picks the first match instead of sending a half-typed
                // handle, which is what every other chat app does.
                if (e.key === "Enter" && mentionMatches.length > 0) {
                  e.preventDefault();
                  applyMention(mentionMatches[0].username);
                }
              }}
              placeholder="Type a message"
              disabled={disabled}
              className="w-full px-4 py-2.5 bg-white text-gray-800 rounded-full focus:outline-none shadow-sm disabled:opacity-60"
            />
          </div>

          <button
            type="button"
            onClick={() => {
              setShowAttachMenu((v) => !v);
              setShowEmoji(false);
            }}
            className="p-2 text-gray-600 hover:bg-gray-200 rounded-full transition-colors"
            title="Attach"
          >
            <FiPaperclip size={22} />
          </button>

          {text.trim() ? (
            <button
              type="submit"
              className="w-11 h-11 text-white rounded-full flex items-center justify-center transition-colors shadow-md"
              style={{ backgroundColor: THEME_COLOR }}
              title="Send"
            >
              <FiSend size={20} />
            </button>
          ) : (
            <button
              type="button"
              onClick={startRecording}
              className="w-11 h-11 text-white rounded-full flex items-center justify-center transition-colors shadow-md"
              style={{ backgroundColor: THEME_COLOR }}
              title="Record voice note"
            >
              <FiMic size={20} />
            </button>
          )}
        </form>
      )}
    </div>
  );
};

export default Composer;
