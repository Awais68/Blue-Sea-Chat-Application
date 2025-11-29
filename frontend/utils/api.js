import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

/**
 * Axios instance with default config
 */
const api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

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
 * Handle response errors - clear invalid tokens
 */
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // If token is invalid, clear it and redirect to login
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");

      // Redirect to login if not already there
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
  create: (data) => api.post("/api/rooms", data),
  getMessages: (roomId) => api.get(`/api/rooms/${roomId}/messages`),
};

export default api;
