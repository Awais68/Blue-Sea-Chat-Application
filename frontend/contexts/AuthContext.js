import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { authAPI, getErrorMessage } from "../utils/api";
import { initSocket, disconnectSocket, getSocket } from "../utils/socket";

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [socketReady, setSocketReady] = useState(false);

  /**
   * Open the socket and track its liveness. Pages wait on `socketReady`
   * instead of polling getSocket(), which used to leave a chat screen stuck
   * on its spinner when the page mounted before the connection existed.
   */
  const connectSocket = useCallback((authToken) => {
    const s = initSocket(authToken);
    if (!s) return;

    setSocketReady(s.connected);
    s.on("connect", () => setSocketReady(true));
    s.on("disconnect", () => setSocketReady(false));
  }, []);

  useEffect(() => {
    // Check for stored token on mount
    const storedToken = localStorage.getItem("token");
    const storedUser = localStorage.getItem("user");

    if (storedToken && storedUser) {
      try {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
        connectSocket(storedToken);
      } catch (error) {
        // Corrupt localStorage should send the user to login, not wedge the
        // app on a spinner forever.
        console.error("Stored session is invalid:", error);
        localStorage.removeItem("token");
        localStorage.removeItem("refreshToken");
        localStorage.removeItem("user");
      }
    }

    setLoading(false);
  }, [connectSocket]);

  /**
   * The axios interceptor swaps the access token behind our back on a 401.
   * Watch for that so the socket reconnects with the fresh identity instead
   * of silently staying on a token the server no longer accepts.
   */
  useEffect(() => {
    if (!token) return;

    const interval = setInterval(() => {
      const current = localStorage.getItem("token");
      if (!current) return;
      if (current !== token) {
        setToken(current);
        connectSocket(current);
        return;
      }
      const s = getSocket();
      if (s && !s.connected) s.connect();
    }, 5000);

    return () => clearInterval(interval);
  }, [token, connectSocket]);

  const login = async (email, password) => {
    try {
      const response = await authAPI.login({ email, password });
      const { accessToken, refreshToken, user } = response.data;

      // Store both tokens
      localStorage.setItem("token", accessToken);
      localStorage.setItem("refreshToken", refreshToken);
      localStorage.setItem("user", JSON.stringify(user));

      setToken(accessToken);
      setUser(user);
      connectSocket(accessToken);

      return { success: true };
    } catch (error) {
      return {
        success: false,
        message: getErrorMessage(error, "Login failed"),
      };
    }
  };

  const signup = async (username, email, password) => {
    try {
      const response = await authAPI.signup({ username, email, password });
      const { accessToken, refreshToken, user } = response.data;

      // Store both tokens
      localStorage.setItem("token", accessToken);
      localStorage.setItem("refreshToken", refreshToken);
      localStorage.setItem("user", JSON.stringify(user));

      setToken(accessToken);
      setUser(user);
      connectSocket(accessToken);

      return { success: true };
    } catch (error) {
      return {
        success: false,
        message: getErrorMessage(error, "Signup failed"),
      };
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("user");
    setToken(null);
    setUser(null);
    setSocketReady(false);
    disconnectSocket();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        signup,
        logout,
        socketReady,
        isAuthenticated: !!token,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
