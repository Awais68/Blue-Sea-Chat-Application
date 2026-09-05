import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../contexts/AuthContext";
import {
  FiMessageCircle,
  FiLock,
  FiMail,
  FiEye,
  FiEyeOff,
  FiPhone,
} from "react-icons/fi";

// Theme colors
const THEME_COLOR = "#00b3fd";
const THEME_DARK = "#0090cc";
const BG_DARK = "#0a1929";
const BG_CARD = "#0d2137";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { login, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isAuthenticated) {
      router.push("/rooms");
    }
  }, [isAuthenticated, router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await login(email, password);

    if (result.success) {
      router.push("/rooms");
    } else {
      setError(result.message);
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: BG_DARK }}
    >
      {/* Header Bar */}
      <div
        className="h-52 flex items-center justify-center"
        style={{ backgroundColor: THEME_COLOR }}
      >
        <div className="text-center">
          <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <FiMessageCircle size={40} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">Blue Sea Chat</h1>
          <p className="text-blue-100 mt-1">Connect with friends</p>
        </div>
      </div>

      {/* Login Form */}
      <div className="flex-1 flex items-start justify-center -mt-16 px-4">
        <div className="w-full max-w-md">
          <div
            className="rounded-xl shadow-2xl overflow-hidden"
            style={{ backgroundColor: BG_CARD }}
          >
            <div className="p-6">
              <h2 className="text-xl font-semibold text-white text-center mb-6">
                Sign in to continue
              </h2>

              {error && (
                <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm text-center">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="relative">
                  <FiMail
                    className="absolute left-3 top-1/2 -translate-y-1/2"
                    size={20}
                    style={{ color: THEME_COLOR }}
                  />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email address"
                    required
                    className="w-full pl-11 pr-4 py-3 text-white rounded-lg focus:outline-none focus:ring-2 placeholder-gray-400"
                    style={{
                      backgroundColor: BG_DARK,
                      focusRingColor: THEME_COLOR,
                    }}
                  />
                </div>

                <div className="relative">
                  <FiLock
                    className="absolute left-3 top-1/2 -translate-y-1/2"
                    size={20}
                    style={{ color: THEME_COLOR }}
                  />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    required
                    className="w-full pl-11 pr-11 py-3 text-white rounded-lg focus:outline-none focus:ring-2 placeholder-gray-400"
                    style={{ backgroundColor: BG_DARK }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                  >
                    {showPassword ? (
                      <FiEyeOff size={20} />
                    ) : (
                      <FiEye size={20} />
                    )}
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ backgroundColor: THEME_COLOR }}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                          fill="none"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      Signing in...
                    </span>
                  ) : (
                    "CONTINUE"
                  )}
                </button>
              </form>

              <div className="mt-6 text-center">
                <p className="text-gray-400">
                  Don't have an account?{" "}
                  <button
                    onClick={() => router.push("/signup")}
                    className="font-medium hover:underline"
                    style={{ color: THEME_COLOR }}
                  >
                    Sign up
                  </button>
                </p>
              </div>
            </div>
          </div>

          {/* Features */}
          <div className="mt-8 grid grid-cols-3 gap-4 text-center">
            <div className="p-4">
              <FiMessageCircle
                className="mx-auto mb-2"
                size={24}
                style={{ color: THEME_COLOR }}
              />
              <p className="text-gray-400 text-sm">Messages</p>
            </div>
            <div className="p-4">
              <FiPhone
                className="mx-auto mb-2"
                size={24}
                style={{ color: THEME_COLOR }}
              />
              <p className="text-gray-400 text-sm">Voice Calls</p>
            </div>
            <div className="p-4">
              <svg
                className="mx-auto mb-2"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke={THEME_COLOR}
                strokeWidth="2"
              >
                <path d="M23 7l-7 5 7 5V7z" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </svg>
              <p className="text-gray-400 text-sm">Video Calls</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
