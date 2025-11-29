import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../contexts/AuthContext";
import {
  FiMessageCircle,
  FiLock,
  FiMail,
  FiEye,
  FiEyeOff,
  FiUser,
  FiPhone,
  FiArrowLeft,
} from "react-icons/fi";

// Theme colors
const THEME_COLOR = "#00b3fd";
const THEME_DARK = "#0090cc";
const BG_DARK = "#0a1929";
const BG_CARD = "#0d2137";

export default function Signup() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { signup, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isAuthenticated) {
      router.push("/rooms");
    }
  }, [isAuthenticated, router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);

    const result = await signup(name, email, password);

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
        className="h-44 flex items-center justify-center relative"
        style={{ backgroundColor: THEME_COLOR }}
      >
        <button
          onClick={() => router.push("/login")}
          className="absolute left-4 top-4 text-white p-2 hover:bg-white/10 rounded-full"
        >
          <FiArrowLeft size={24} />
        </button>
        <div className="text-center">
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
            <FiUser size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Create Account</h1>
        </div>
      </div>

      {/* Signup Form */}
      <div className="flex-1 flex items-start justify-center -mt-10 px-4 pb-8">
        <div className="w-full max-w-md">
          <div
            className="rounded-xl shadow-2xl overflow-hidden"
            style={{ backgroundColor: BG_CARD }}
          >
            <div className="p-6">
              <h2 className="text-lg font-semibold text-white text-center mb-5">
                Fill in your details
              </h2>

              {error && (
                <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm text-center">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="relative">
                  <FiUser
                    className="absolute left-3 top-1/2 -translate-y-1/2"
                    size={20}
                    style={{ color: THEME_COLOR }}
                  />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Full Name"
                    required
                    className="w-full pl-11 pr-4 py-3 text-white rounded-lg focus:outline-none focus:ring-2 placeholder-gray-400"
                    style={{ backgroundColor: BG_DARK }}
                  />
                </div>

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
                    style={{ backgroundColor: BG_DARK }}
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

                <div className="relative">
                  <FiLock
                    className="absolute left-3 top-1/2 -translate-y-1/2"
                    size={20}
                    style={{ color: THEME_COLOR }}
                  />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm Password"
                    required
                    className="w-full pl-11 pr-4 py-3 text-white rounded-lg focus:outline-none focus:ring-2 placeholder-gray-400"
                    style={{ backgroundColor: BG_DARK }}
                  />
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
                      Creating account...
                    </span>
                  ) : (
                    "SIGN UP"
                  )}
                </button>
              </form>

              <div className="mt-6 text-center">
                <p className="text-gray-400">
                  Already have an account?{" "}
                  <button
                    onClick={() => router.push("/login")}
                    className="font-medium hover:underline"
                    style={{ color: THEME_COLOR }}
                  >
                    Sign in
                  </button>
                </p>
              </div>
            </div>
          </div>

          {/* Features */}
          <div className="mt-6 text-center">
            <p className="text-gray-500 text-sm mb-4">What you'll get</p>
            <div className="flex justify-center gap-6">
              <div className="flex items-center gap-2 text-gray-400 text-sm">
                <FiMessageCircle style={{ color: THEME_COLOR }} />
                <span>Free Messaging</span>
              </div>
              <div className="flex items-center gap-2 text-gray-400 text-sm">
                <FiPhone style={{ color: THEME_COLOR }} />
                <span>HD Calls</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
