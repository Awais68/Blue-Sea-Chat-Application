import { useEffect } from "react";
import "../styles/globals.css";
import { AuthProvider } from "../contexts/AuthContext";
import { NotificationProvider } from "../contexts/NotificationContext";
import NotificationToasts from "../components/NotificationToasts";
import { warmUpServer } from "../utils/api";

export default function App({ Component, pageProps }) {
  // The API host sleeps when idle. Ping it as soon as the app loads so the
  // cold start happens while the user is still reading the screen.
  useEffect(() => {
    warmUpServer();
  }, []);

  return (
    <AuthProvider>
      <NotificationProvider>
        <NotificationToasts />
        <Component {...pageProps} />
      </NotificationProvider>
    </AuthProvider>
  );
}
