import { useEffect } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../contexts/AuthContext";
import {
  FiMessageCircle,
  FiPhone,
  FiVideo,
  FiShield,
  FiUsers,
  FiArrowRight,
} from "react-icons/fi";

// Theme colors
const THEME_COLOR = "#00b3fd";
const THEME_DARK = "#0090cc";
const BG_DARK = "#0a1929";

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, loading } = useAuth();

  useEffect(() => {
    if (!loading && isAuthenticated) {
      router.push("/rooms");
    }
  }, [isAuthenticated, loading, router]);

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: BG_DARK }}
      >
        <div
          className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2"
          style={{ borderColor: THEME_COLOR }}
        ></div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: BG_DARK }}
    >
      {/* Hero Section */}
      <div
        className="flex-1 flex flex-col items-center justify-center px-4 text-center"
        style={{
          background: `linear-gradient(180deg, ${THEME_COLOR}20 0%, transparent 100%)`,
        }}
      >
        {/* Logo */}
        <div
          className="w-28 h-28 rounded-full flex items-center justify-center mb-6 shadow-2xl"
          style={{
            backgroundColor: THEME_COLOR,
            boxShadow: `0 0 60px ${THEME_COLOR}50`,
          }}
        >
          <FiMessageCircle size={56} className="text-white" />
        </div>

        {/* Title */}
        <h1 className="text-4xl font-bold text-white mb-3">Blue Sea Chat</h1>
        <p className="text-gray-400 text-lg max-w-md mb-8">
          Connect with friends and family through instant messaging,
          crystal-clear voice and video calls
        </p>

        {/* Features Grid */}
        <div className="grid grid-cols-2 gap-4 max-w-sm w-full mb-10">
          <div
            className="p-4 rounded-xl"
            style={{ backgroundColor: `${THEME_COLOR}15` }}
          >
            <FiMessageCircle
              className="mx-auto mb-2"
              size={28}
              style={{ color: THEME_COLOR }}
            />
            <p className="text-white font-medium">Messages</p>
            <p className="text-gray-500 text-xs mt-1">
              Send & receive instantly
            </p>
          </div>
          <div
            className="p-4 rounded-xl"
            style={{ backgroundColor: `${THEME_COLOR}15` }}
          >
            <FiPhone
              className="mx-auto mb-2"
              size={28}
              style={{ color: THEME_COLOR }}
            />
            <p className="text-white font-medium">Voice Calls</p>
            <p className="text-gray-500 text-xs mt-1">HD audio quality</p>
          </div>
          <div
            className="p-4 rounded-xl"
            style={{ backgroundColor: `${THEME_COLOR}15` }}
          >
            <FiVideo
              className="mx-auto mb-2"
              size={28}
              style={{ color: THEME_COLOR }}
            />
            <p className="text-white font-medium">Video Calls</p>
            <p className="text-gray-500 text-xs mt-1">Face-to-face chat</p>
          </div>
          <div
            className="p-4 rounded-xl"
            style={{ backgroundColor: `${THEME_COLOR}15` }}
          >
            <FiShield
              className="mx-auto mb-2"
              size={28}
              style={{ color: THEME_COLOR }}
            />
            <p className="text-white font-medium">Secure</p>
            <p className="text-gray-500 text-xs mt-1">End-to-end encryption</p>
          </div>
        </div>

        {/* CTA Buttons */}
        <div className="w-full max-w-sm space-y-3">
          <button
            onClick={() => router.push("/login")}
            className="w-full py-3.5 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-all hover:opacity-90"
            style={{ backgroundColor: THEME_COLOR }}
          >
            Get Started
            <FiArrowRight size={20} />
          </button>

          <button
            onClick={() => router.push("/signup")}
            className="w-full py-3.5 text-white font-semibold rounded-xl border-2 transition-all hover:bg-white/5"
            style={{ borderColor: THEME_COLOR }}
          >
            Create New Account
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="py-6 text-center">
        <div className="flex items-center justify-center gap-2 text-gray-500 text-sm mb-2">
          <FiUsers size={16} />
          <span>Join thousands of users worldwide</span>
        </div>
        <p className="text-gray-600 text-xs">
          © 2024 Blue Sea Chat. All rights reserved.
        </p>
      </div>

      {/* Decorative Elements */}
      <div
        className="fixed top-0 left-0 w-72 h-72 rounded-full blur-3xl opacity-20 pointer-events-none"
        style={{ backgroundColor: THEME_COLOR }}
      />
      <div
        className="fixed bottom-0 right-0 w-96 h-96 rounded-full blur-3xl opacity-10 pointer-events-none"
        style={{ backgroundColor: THEME_COLOR }}
      />
    </div>
  );
}
