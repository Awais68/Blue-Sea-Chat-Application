import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

/**
 * Turn a stored "/uploads/xyz.jpg" path into an absolute URL on the API host.
 */
export const mediaUrl = (url) => {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_URL.replace(/\/$/, "")}${url.startsWith("/") ? "" : "/"}${url}`;
};

/**
 * Axios instance with default config
 */
const api = axios.create({
  // A trailing slash here would produce "//api/..." on every request
  baseURL: API_URL.replace(/\/$/, ""),
  // The API runs on a free host that sleeps when idle; a cold start can take
  // the better part of a minute, and the default (no timeout) leaves the UI
  // hanging forever when the host is genuinely down.
  timeout: 60000,
  headers: {
    "Content-Type": "application/json",
  },
});

/**
 * Wake the API up.
 *
 * Called once when the app mounts so the cold start overlaps with the user
 * typing their credentials instead of blocking their first login attempt.
 * Failures are irrelevant - this is a best-effort nudge.
 */
export const warmUpServer = () => {
  api.get("/health", { timeout: 60000 }).catch(() => {});
};

/**
 * Add token to requests if available
 */
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * Handle response errors - refresh token or clear invalid tokens
 */
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    const isRefreshCall = originalRequest?.url?.includes("/api/auth/refresh");

    // If token is invalid and we haven't already tried to refresh
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !isRefreshCall
    ) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem("refreshToken");
        if (refreshToken) {
          // Try to refresh the token
          const response = await api.post("/api/auth/refresh", { refreshToken });
          const { accessToken, refreshToken: newRefreshToken } = response.data;

          // Update tokens
          localStorage.setItem("token", accessToken);
          localStorage.setItem("refreshToken", newRefreshToken);

          // Update header and retry original request
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return api(originalRequest);
        }
      } catch (refreshError) {
        // Refresh failed, redirect to login
        localStorage.removeItem("token");
        localStorage.removeItem("refreshToken");
        localStorage.removeItem("user");

        if (
          typeof window !== "undefined" &&
          !window.location.pathname.includes("/login")
        ) {
          window.location.href = "/login";
        }
      }
    }

    // For other 401 errors or if refresh failed
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("refreshToken");
      localStorage.removeItem("user");

      if (
        typeof window !== "undefined" &&
        !window.location.pathname.includes("/login")
      ) {
        window.location.href = "/login";
      }
    }

    return Promise.reject(error);
  }
);

/**
 * Authentication API
 */
export const authAPI = {
  signup: (data) => api.post("/api/auth/signup", data),
  login: (data) => api.post("/api/auth/login", data),
};

/**
 * Rooms API
 */
export const roomsAPI = {
  getAll: () => api.get("/api/rooms"),

  // Contacts: getUsers returns only the people you already know. Everyone
  // else has to be found deliberately through searchUsers.
  getUsers: () => api.get("/api/rooms/users"),
  searchUsers: (q) => api.get("/api/rooms/users/search", { params: { q } }),
  addContact: (userId) => api.post(`/api/rooms/contacts/${userId}`),
  removeContact: (userId) => api.delete(`/api/rooms/contacts/${userId}`),

  startDirectChat: (userId) => api.post(`/api/rooms/direct/${userId}`),
  create: (data) => api.post("/api/rooms", data),

  // Groups
  createGroup: (data) => api.post("/api/rooms/group", data),
  updateGroup: (roomId, data) => api.patch(`/api/rooms/${roomId}/group`, data),
  addParticipants: (roomId, userIds) =>
    api.post(`/api/rooms/${roomId}/participants`, { userIds }),
  removeParticipant: (roomId, userId) =>
    api.delete(`/api/rooms/${roomId}/participants/${userId}`),

  // View once: the media URL is deliberately not part of the message
  // payload; it is handed out exactly once by this endpoint.
  openViewOnce: (roomId, messageId) =>
    api.post(`/api/rooms/${roomId}/messages/${messageId}/view`),

  getMessages: (roomId, params = {}) =>
    api.get(`/api/rooms/${roomId}/messages`, { params }),
  deleteMessage: (roomId, messageId, forEveryone) =>
    api.delete(
      `/api/rooms/${roomId}/messages/${messageId}?deleteForEveryone=${forEveryone}`
    ),
  forwardMessage: (roomId, messageId, targetRoomId) =>
    api.post(`/api/rooms/${roomId}/messages/${messageId}/forward`, {
      targetRoomId,
    }),
  getCallLogs: (roomId) => api.get(`/api/rooms/${roomId}/calls`),
  createCallLog: (roomId, data) => api.post(`/api/rooms/${roomId}/calls`, data),
};

/**
 * Attachment upload API
 */
export const uploadAPI = {
  /**
   * @param {File|Blob} file       the file to upload
   * @param {Object}    opts       { messageType, duration, onProgress }
   */
  upload: (file, opts = {}) => {
    const formData = new FormData();
    formData.append("file", file, opts.fileName || file.name || "upload");
    if (opts.messageType) formData.append("messageType", opts.messageType);
    if (opts.duration != null) formData.append("duration", String(opts.duration));

    return api.post("/api/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      // A 25 MB file on a slow uplink can outlast the default timeout
      timeout: 0,
      onUploadProgress: (event) => {
        if (opts.onProgress && event.total) {
          opts.onProgress(Math.round((event.loaded * 100) / event.total));
        }
      },
    });
  },
};

/**
 * Pull a human-readable message out of an axios error.
 *
 * The API is not perfectly uniform: routes return { message }, express-validator
 * returns { errors: [...] }, and express-rate-limit can answer with a plain
 * string body. Without this, a 429 or a validation failure would surface to the
 * user as a meaningless generic fallback.
 */
export const getErrorMessage = (error, fallback = "Something went wrong") => {
  if (!error) return fallback;

  const data = error.response?.data;

  if (typeof data === "string" && data.trim()) return data.trim();
  if (data?.message) return data.message;
  if (Array.isArray(data?.errors) && data.errors.length) {
    return data.errors.map((e) => e.msg || e.message).filter(Boolean).join(", ") || fallback;
  }
  if (error.code === "ERR_NETWORK") {
    return "Cannot reach the server. It may be waking up - please try again in a few seconds.";
  }
  if (error.code === "ECONNABORTED") {
    return "The server took too long to respond. Please try again.";
  }

  return error.message || fallback;
};

export default api;
