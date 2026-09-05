import { useRouter } from "next/router";
import { FiMessageCircle, FiUsers, FiX, FiBell } from "react-icons/fi";
import { useNotifications } from "../contexts/NotificationContext";

const THEME_COLOR = "#00b3fd";

/**
 * The in-app notification stack. Sits above every screen so a message that
 * arrives while you are on another chat, or on the chat list, is impossible
 * to miss. Clicking a toast opens the conversation it came from.
 */
const NotificationToasts = () => {
  const { toasts, dismissToast, permission, requestPermission } =
    useNotifications();
  const router = useRouter();

  const open = (toast) => {
    dismissToast(toast.id);
    if (toast.roomId) router.push(`/chat/${toast.roomId}`);
  };

  const showPermissionPrompt =
    permission === "default" && toasts.length > 0 && typeof window !== "undefined";

  return (
    <div className="fixed top-3 right-3 z-[100] flex flex-col gap-2 w-[min(22rem,calc(100vw-1.5rem))] pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          onClick={() => open(toast)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && open(toast)}
          className="pointer-events-auto cursor-pointer rounded-xl shadow-2xl border overflow-hidden animate-[toastIn_220ms_ease-out] backdrop-blur"
          style={{
            backgroundColor: "rgba(13, 33, 55, 0.96)",
            borderColor: toast.mentioned ? "#f59e0b" : "rgba(0,179,253,0.35)",
          }}
        >
          <div className="flex items-start gap-3 p-3">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-white shrink-0"
              style={{
                backgroundColor: toast.mentioned ? "#f59e0b" : THEME_COLOR,
              }}
            >
              {toast.isGroup ? <FiUsers size={17} /> : <FiMessageCircle size={17} />}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-semibold truncate">
                {toast.title}
              </p>
              <p className="text-gray-300 text-xs truncate mt-0.5">
                {toast.body}
              </p>
              {toast.mentioned && (
                <p className="text-[11px] mt-1" style={{ color: "#f59e0b" }}>
                  You were mentioned
                </p>
              )}
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                dismissToast(toast.id);
              }}
              className="text-gray-500 hover:text-white transition-colors shrink-0"
              aria-label="Dismiss notification"
            >
              <FiX size={16} />
            </button>
          </div>
        </div>
      ))}

      {showPermissionPrompt && (
        <button
          onClick={requestPermission}
          className="pointer-events-auto flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-white shadow-xl border"
          style={{
            backgroundColor: "rgba(13, 33, 55, 0.96)",
            borderColor: "rgba(0,179,253,0.35)",
          }}
        >
          <FiBell size={14} style={{ color: THEME_COLOR }} />
          Turn on desktop notifications
        </button>
      )}

      <style jsx global>{`
        @keyframes toastIn {
          from {
            opacity: 0;
            transform: translateX(16px) scale(0.97);
          }
          to {
            opacity: 1;
            transform: translateX(0) scale(1);
          }
        }
      `}</style>
    </div>
  );
};

export default NotificationToasts;
