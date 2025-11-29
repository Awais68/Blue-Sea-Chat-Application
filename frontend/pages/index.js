import { useEffect } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../contexts/AuthContext";
import {
  FiMessageCircle,
  FiPhone,
  FiVideo,
  FiShield,
  FiUsers,
} from "react-icons/fi";

export default function Home() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isAuthenticated) {
      router.push("/rooms");
    }
  }, [isAuthenticated, router]);

  return (
    <div className="min-h-screen bg-[#111B21] flex flex-col">
      {/* Hero Section */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        {/* Logo */}
        <div className="relative mb-8">
          <div className="w-32 h-32 bg-[#25D366] rounded-full flex items-center justify-center shadow-2xl shadow-[#25D366]/30">
            <FiMessageCircle size={64} className="text-white" />
          </div>
          <div className="absolute -top-2 -right-2 w-8 h-8 bg-[#075E54] rounded-full flex items-center justify-center">
            <span className="text-white text-xs font-bold">+</span>
          </div>
        </div>

        {/* Title */}
        <h1 className="text-4xl md:text-5xl font-bold text-white text-center mb-4">
          WhatsApp
        </h1>
        <p className="text-gray-400 text-center text-lg mb-8 max-w-md">
          Simple, reliable, private messaging and calling for free*, available
          all over the world.
        </p>

        {/* Features Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12 max-w-2xl">
          <div className="text-center p-4">
            <div className="w-14 h-14 bg-[#202C33] rounded-full flex items-center justify-center mx-auto mb-3">
              <FiMessageCircle size={24} className="text-[#25D366]" />
            </div>
            <p className="text-gray-300 text-sm">Text Chat</p>
          </div>
          <div className="text-center p-4">
            <div className="w-14 h-14 bg-[#202C33] rounded-full flex items-center justify-center mx-auto mb-3">
              <FiPhone size={24} className="text-[#25D366]" />
            </div>
            <p className="text-gray-300 text-sm">Voice Calls</p>
          </div>
          <div className="text-center p-4">
            <div className="w-14 h-14 bg-[#202C33] rounded-full flex items-center justify-center mx-auto mb-3">
              <FiVideo size={24} className="text-[#25D366]" />
            </div>
            <p className="text-gray-300 text-sm">Video Calls</p>
          </div>
          <div className="text-center p-4">
            <div className="w-14 h-14 bg-[#202C33] rounded-full flex items-center justify-center mx-auto mb-3">
              <FiUsers size={24} className="text-[#25D366]" />
            </div>
            <p className="text-gray-300 text-sm">Group Chats</p>
          </div>
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md">
          <button
            onClick={() => router.push("/login")}
            className="flex-1 py-4 bg-[#25D366] hover:bg-[#128C7E] text-white font-semibold rounded-full transition-colors text-lg shadow-lg shadow-[#25D366]/30"
          >
            Sign In
          </button>
          <button
            onClick={() => router.push("/signup")}
            className="flex-1 py-4 bg-[#202C33] hover:bg-[#2A3942] text-white font-semibold rounded-full transition-colors text-lg border border-[#2A3942]"
          >
            Create Account
          </button>
        </div>

        {/* Security Badge */}
        <div className="flex items-center gap-2 mt-8 text-gray-500">
          <FiShield size={16} />
          <span className="text-sm">End-to-end encrypted</span>
        </div>
      </div>

      {/* Footer */}
      <div className="py-6 text-center border-t border-[#202C33]">
        <p className="text-gray-500 text-sm">
          Built with WebRTC for real-time communication
        </p>
      </div>
    </div>
  );
}
