import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/router";
import { useAuth } from "./AuthContext";
import { roomsAPI } from "../utils/api";
import {
  getSocket,
  onMessageNotification,
  onRoomRead,
  onGroupCreated,
  onOnlineUsers,
  onUserStatus,
  onUserStatusBulk,
  requestOnlineUsers,
  requestUserStatus,
} from "../utils/socket";

const NotificationContext = createContext(null);

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within NotificationProvider");
  }
  return context;
};

const BASE_TITLE = "Blue Sea Chat";
const TOAST_TIMEOUT_MS = 5000;
const MAX_TOASTS = 3;

/**
 * A short two-tone chime built with the Web Audio API.
 * Synthesising it avoids shipping an audio asset and avoids the autoplay
 * failure you get from an <audio> element the user has never interacted with.
 */
const playChime = (audioContextRef) => {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioCtx();
    }
    const ctx = audioContextRef.current;
    if (ctx.state === "suspended") ctx.resume();

    const now = ctx.currentTime;
    [880, 1320].forEach((frequency, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.value = frequency;

      const start = now + index * 0.11;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.16, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);

      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.24);
    });
  } catch (error) {
    // Sound is a nicety - never let it break the notification itself
    console.debug("Notification sound unavailable:", error);
  }
};

export const NotificationProvider = ({ children }) => {
  const { user, isAuthenticated, socketReady } = useAuth();
  const router = useRouter();

  const [unreadByRoom, setUnreadByRoom] = useState({});
  const [toasts, setToasts] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState(() => new Set());
  const [lastSeenById, setLastSeenById] = useState({});
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [permission, setPermission] = useState("default");

  const audioContextRef = useRef(null);
  const activeRoomRef = useRef(null);
  const toastTimersRef = useRef(new Map());
  const soundEnabledRef = useRef(true);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  /* ------------------------------------------------------------------ *
   * Preferences
   * ------------------------------------------------------------------ */
  useEffect(() => {
    if (typeof window === "undefined") return;

    const stored = localStorage.getItem("notificationSound");
    if (stored !== null) setSoundEnabled(stored === "true");

    if ("Notification" in window) setPermission(Notification.permission);
  }, []);

  const toggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev;
      localStorage.setItem("notificationSound", String(next));
      return next;
    });
  }, []);

  /**
   * Desktop notifications need a user gesture in most browsers, so this is
   * called from a button rather than automatically on mount.
   */
  const requestPermission = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return "unsupported";
    }
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      return result;
    } catch (error) {
      console.debug("Notification permission request failed:", error);
      return "denied";
    }
  }, []);

  /* ------------------------------------------------------------------ *
   * Toasts
   * ------------------------------------------------------------------ */
  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = toastTimersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      toastTimersRef.current.delete(id);
    }
  }, []);

  const pushToast = useCallback(
    (toast) => {
      const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
      setToasts((prev) => [...prev.slice(-(MAX_TOASTS - 1)), { ...toast, id }]);

      const timer = setTimeout(() => dismissToast(id), TOAST_TIMEOUT_MS);
      toastTimersRef.current.set(id, timer);
    },
    [dismissToast]
  );

  useEffect(() => {
    const timers = toastTimersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  /* ------------------------------------------------------------------ *
   * Unread bookkeeping
   * ------------------------------------------------------------------ */
  const clearUnread = useCallback((roomId) => {
    if (!roomId) return;
    setUnreadByRoom((prev) => {
      if (!prev[roomId]) return prev;
      const next = { ...prev };
      delete next[roomId];
      return next;
    });
  }, []);

  const setActiveRoom = useCallback(
    (roomId) => {
      activeRoomRef.current = roomId ? String(roomId) : null;
      if (roomId) clearUnread(String(roomId));
    },
    [clearUnread]
  );

  const totalUnread = useMemo(
    () => Object.values(unreadByRoom).reduce((sum, n) => sum + n, 0),
    [unreadByRoom]
  );

  /** Seed the badges from the server so a fresh tab is not blank. */
  const refreshUnread = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const { data } = await roomsAPI.getAll();
      const seeded = {};
      data.forEach((room) => {
        if (room.unreadCount > 0 && String(room._id) !== activeRoomRef.current) {
          seeded[room._id] = room.unreadCount;
        }
      });
      setUnreadByRoom(seeded);
    } catch (error) {
      console.debug("Could not seed unread counts:", error);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) refreshUnread();
    else setUnreadByRoom({});
  }, [isAuthenticated, refreshUnread]);

  /* ------------------------------------------------------------------ *
   * Tab title badge
   * ------------------------------------------------------------------ */
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.title = totalUnread > 0 ? `(${totalUnread}) ${BASE_TITLE}` : BASE_TITLE;
  }, [totalUnread]);

  /* ------------------------------------------------------------------ *
   * Live wiring. These listeners live for as long as the app does - a chat
   * page unmounting must not silence them.
   * ------------------------------------------------------------------ */
  useEffect(() => {
    if (!isAuthenticated || !socketReady || !user) return;

    const socket = getSocket();
    if (!socket) return;

    const handleNotification = (payload) => {
      const roomId = String(payload.roomId);

      // Reading the chat right now is not an unread message
      const isActive =
        roomId === activeRoomRef.current &&
        typeof document !== "undefined" &&
        document.visibilityState === "visible";

      if (!isActive) {
        setUnreadByRoom((prev) => ({
          ...prev,
          [roomId]: (prev[roomId] || 0) + 1,
        }));
      }

      // The toast is redundant while you are staring at the same chat
      if (isActive) return;

      const title = payload.isGroup
        ? `${payload.senderName} · ${payload.roomName}`
        : payload.senderName;

      pushToast({
        roomId,
        title,
        body: payload.mentioned ? `@you  ${payload.preview}` : payload.preview,
        mentioned: !!payload.mentioned,
        senderName: payload.senderName,
      });

      if (soundEnabledRef.current) playChime(audioContextRef);

      // A desktop notification only makes sense when the tab is not in front
      if (
        typeof document !== "undefined" &&
        document.visibilityState !== "visible" &&
        typeof window !== "undefined" &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        try {
          const notification = new Notification(title, {
            body: payload.preview,
            tag: roomId,
            icon: "/favicon.ico",
            renotify: false,
          });
          notification.onclick = () => {
            window.focus();
            router.push(`/chat/${roomId}`);
            notification.close();
          };
        } catch (error) {
          console.debug("Desktop notification failed:", error);
        }
      }
    };

    const handleRoomRead = ({ roomId }) => clearUnread(String(roomId));

    const handleGroupCreated = (payload) => {
      pushToast({
        roomId: String(payload.roomId),
        title: payload.name,
        body: "You were added to this group",
        isGroup: true,
      });
      if (soundEnabledRef.current) playChime(audioContextRef);
    };

    // Every one of these setters bails out when nothing actually changed.
    // Returning a fresh Set unconditionally would re-render every consumer on
    // each heartbeat, and any effect keyed on presence would ask for presence
    // again - a loop that never settles.
    const sameSet = (a, b) =>
      a.size === b.size && [...b].every((id) => a.has(id));

    const handleOnlineUsers = ({ users = [] }) =>
      setOnlineUsers((prev) => {
        const next = new Set(users.map(String));
        return sameSet(prev, next) ? prev : next;
      });

    const handleUserStatus = ({ userId, status, lastSeen }) => {
      const id = String(userId);
      setOnlineUsers((prev) => {
        const isOnline = status === "online";
        if (prev.has(id) === isOnline) return prev;
        const next = new Set(prev);
        if (isOnline) next.add(id);
        else next.delete(id);
        return next;
      });
      if (lastSeen) {
        setLastSeenById((prev) =>
          prev[id] === lastSeen ? prev : { ...prev, [id]: lastSeen }
        );
      }
    };

    const handleStatusBulk = ({ statuses = [] }) => {
      setOnlineUsers((prev) => {
        const next = new Set(prev);
        let changed = false;
        statuses.forEach(({ userId, status }) => {
          const id = String(userId);
          const isOnline = status === "online";
          if (next.has(id) === isOnline) return;
          changed = true;
          if (isOnline) next.add(id);
          else next.delete(id);
        });
        return changed ? next : prev;
      });

      setLastSeenById((prev) => {
        const next = { ...prev };
        let changed = false;
        statuses.forEach(({ userId, lastSeen }) => {
          const id = String(userId);
          if (lastSeen && next[id] !== lastSeen) {
            next[id] = lastSeen;
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    };

    onMessageNotification(handleNotification);
    onRoomRead(handleRoomRead);
    onGroupCreated(handleGroupCreated);
    onOnlineUsers(handleOnlineUsers);
    onUserStatus(handleUserStatus);
    onUserStatusBulk(handleStatusBulk);

    // Presence is asked for on every (re)connect, otherwise a reconnect
    // leaves the whole contact list stuck on "offline".
    requestOnlineUsers();
    const onReconnect = () => {
      requestOnlineUsers();
      refreshUnread();
    };
    socket.on("connect", onReconnect);

    return () => {
      socket.off("message-notification", handleNotification);
      socket.off("room-read", handleRoomRead);
      socket.off("group-created", handleGroupCreated);
      socket.off("online-users", handleOnlineUsers);
      socket.off("user-status", handleUserStatus);
      socket.off("user-status-bulk", handleStatusBulk);
      socket.off("connect", onReconnect);
    };
  }, [
    isAuthenticated,
    socketReady,
    user,
    pushToast,
    clearUnread,
    refreshUnread,
    router,
  ]);

  /* ------------------------------------------------------------------ *
   * Presence helpers
   * ------------------------------------------------------------------ */
  const isUserOnline = useCallback(
    (userId) => (userId ? onlineUsers.has(String(userId)) : false),
    [onlineUsers]
  );

  const watchUsers = useCallback(
    (userIds) => {
      const ids = (Array.isArray(userIds) ? userIds : [userIds])
        .filter(Boolean)
        .map(String);
      if (ids.length && socketReady) requestUserStatus(ids);
    },
    [socketReady]
  );

  const value = useMemo(
    () => ({
      unreadByRoom,
      totalUnread,
      clearUnread,
      setActiveRoom,
      refreshUnread,
      toasts,
      dismissToast,
      pushToast,
      onlineUsers,
      isUserOnline,
      watchUsers,
      lastSeenById,
      soundEnabled,
      toggleSound,
      permission,
      requestPermission,
    }),
    [
      unreadByRoom,
      totalUnread,
      clearUnread,
      setActiveRoom,
      refreshUnread,
      toasts,
      dismissToast,
      pushToast,
      onlineUsers,
      isUserOnline,
      watchUsers,
      lastSeenById,
      soundEnabled,
      toggleSound,
      permission,
      requestPermission,
    ]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};
