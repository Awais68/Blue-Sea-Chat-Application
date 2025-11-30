import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../contexts/AuthContext";
import { roomsAPI } from "../utils/api";
import {
  FiLogOut,
  FiSearch,
  FiMoreVertical,
  FiPhone,
  FiMessageCircle,
  FiSettings,
  FiCheck,
  FiUser,
  FiUsers,
} from "react-icons/fi";
import { format, isToday, isYesterday } from "date-fns";

// Theme colors
const THEME_COLOR = "#00b3fd";
const THEME_DARK = "#0090cc";
const BG_DARK = "#0a1929";
const BG_CARD = "#0d2137";

export default function Rooms() {
  const [chats, setChats] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("chats"); // "chats", "users", "calls"

  const { user, logout, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }

    fetchData();
  }, [isAuthenticated, router]);

  const fetchData = async () => {
    try {
      const [chatsRes, usersRes] = await Promise.all([
        roomsAPI.getAll(),
        roomsAPI.getUsers(),
      ]);
      setChats(chatsRes.data);
      setUsers(usersRes.data);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching data:", error);
      setLoading(false);
    }
  };

  const handleStartChat = async (targetUserId) => {
    try {
      const response = await roomsAPI.startDirectChat(targetUserId);
      router.push(`/chat/${response.data._id}`);
    } catch (error) {
      console.error("Error starting chat:", error);
    }
  };

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  const formatLastSeen = (date) => {
    if (!date) return "";
    const d = new Date(date);
    if (isToday(d)) return format(d, "HH:mm");
    if (isYesterday(d)) return "Yesterday";
    return format(d, "dd/MM/yy");
  };

  // Filter based on active tab
  const filteredChats = chats.filter((chat) =>
    chat.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredUsers = users.filter(
    (u) =>
      u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: BG_DARK }}>
        <div className="text-center">
          <div
            className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 mx-auto"
            style={{ borderColor: THEME_COLOR }}
          ></div>
          <p className="mt-4 text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: BG_DARK }}>
      {/* Header */}
      <div className="px-4 py-3" style={{ backgroundColor: THEME_COLOR }}>
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-bold text-white">Blue Sea Chat</h1>
          <div className="flex items-center gap-4">
            <button className="text-white/80 hover:text-white transition-colors">
              <FiSearch size={20} />
            </button>
            <div className="relative group">
              <button className="text-white/80 hover:text-white transition-colors">
                <FiMoreVertical size={20} />
              </button>
              <div
                className="absolute right-0 top-full mt-2 rounded-lg shadow-xl py-2 w-48 hidden group-hover:block z-50"
                style={{ backgroundColor: BG_CARD }}
              >
                <button
                  onClick={handleLogout}
                  className="w-full px-4 py-2 text-left text-gray-200 hover:bg-white/10 flex items-center gap-3"
                >
                  <FiLogOut size={16} />
                  Log out
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="px-3 py-2" style={{ backgroundColor: BG_DARK }}>
        <div className="relative">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={activeTab === "users" ? "Search users..." : "Search chats..."}
            className="w-full pl-10 pr-4 py-2 text-gray-200 rounded-lg focus:outline-none placeholder-gray-500"
            style={{ backgroundColor: BG_CARD }}
          />
        </div>
      </div>

      {/* Tabs - Users, Chats, Calls */}
      <div className="flex border-b" style={{ borderColor: BG_CARD }}>
        <button
          onClick={() => setActiveTab("users")}
          className={`flex-1 py-3 text-center font-medium transition-colors ${
            activeTab === "users" ? "border-b-2 text-white" : "text-gray-400"
          }`}
          style={activeTab === "users" ? { borderColor: THEME_COLOR } : {}}
        >
          <FiUsers className="inline mr-2" />
          Users ({users.length})
        </button>
        <button
          onClick={() => setActiveTab("chats")}
          className={`flex-1 py-3 text-center font-medium transition-colors ${
            activeTab === "chats" ? "border-b-2 text-white" : "text-gray-400"
          }`}
          style={activeTab === "chats" ? { borderColor: THEME_COLOR } : {}}
        >
          <FiMessageCircle className="inline mr-2" />
          Chats ({chats.length})
        </button>
        <button
          onClick={() => setActiveTab("calls")}
          className={`flex-1 py-3 text-center font-medium transition-colors ${
            activeTab === "calls" ? "border-b-2 text-white" : "text-gray-400"
          }`}
          style={activeTab === "calls" ? { borderColor: THEME_COLOR } : {}}
        >
          <FiPhone className="inline mr-2" />
          Calls
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto">
        {/* Users Tab - Show all registered users */}
        {activeTab === "users" && (
          <>
            <div className="px-4 py-2 text-gray-400 text-sm" style={{ backgroundColor: BG_CARD }}>
              All Registered Users - Tap to start chat
            </div>
            {filteredUsers.map((u) => (
              <div
                key={u._id}
                onClick={() => handleStartChat(u._id)}
                className="flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors border-b hover:bg-white/5"
                style={{ borderColor: BG_CARD }}
              >
                {/* Avatar */}
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0"
                  style={{ backgroundColor: THEME_DARK }}
                >
                  {u.username.charAt(0).toUpperCase()}
                </div>

                {/* User Info */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-white font-medium truncate">{u.username}</h3>
                  <p className="text-sm text-gray-400 truncate">{u.email}</p>
                </div>

                {/* Message icon */}
                <div className="text-gray-400">
                  <FiMessageCircle size={20} />
                </div>
              </div>
            ))}

            {filteredUsers.length === 0 && (
              <div className="text-center py-12">
                <div
                  className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center"
                  style={{ backgroundColor: BG_CARD }}
                >
                  <FiUser className="text-4xl text-gray-500" />
                </div>
                <p className="text-gray-400">{searchQuery ? "No users found" : "No users available"}</p>
              </div>
            )}
          </>
        )}

        {/* Chats Tab - Show existing conversations */}
        {activeTab === "chats" && (
          <>
            <div className="px-4 py-2 text-gray-400 text-sm" style={{ backgroundColor: BG_CARD }}>
              Your Conversations
            </div>
            {filteredChats.map((chat) => (
              <div
                key={chat._id}
                onClick={() => router.push(`/chat/${chat._id}`)}
                className="flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors border-b hover:bg-white/5"
                style={{ borderColor: BG_CARD }}
              >
                {/* Avatar */}
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0"
                  style={{ backgroundColor: THEME_COLOR }}
                >
                  {chat.name?.charAt(0).toUpperCase() || "?"}
                </div>

                {/* Chat Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline">
                    <h3 className="text-white font-medium truncate">{chat.name}</h3>
                    <span className="text-xs text-gray-500 flex-shrink-0 ml-2">
                      {formatLastSeen(chat.lastMessage?.timestamp || chat.createdAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {chat.lastMessage && <FiCheck className="text-gray-500" size={14} />}
                    <p className="text-sm text-gray-400 truncate">
                      {chat.lastMessage?.content || "Tap to start chatting"}
                    </p>
                  </div>
                </div>
              </div>
            ))}

            {filteredChats.length === 0 && (
              <div className="text-center py-12">
                <div
                  className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center"
                  style={{ backgroundColor: BG_CARD }}
                >
                  <FiMessageCircle className="text-4xl text-gray-500" />
                </div>
                <p className="text-gray-400">{searchQuery ? "No chats found" : "No chats yet"}</p>
                <p className="text-gray-500 text-sm mt-1">Go to Users tab to start a new chat</p>
              </div>
            )}
          </>
        )}

        {/* Calls Tab */}
        {activeTab === "calls" && (
          <div className="text-center py-12">
            <div
              className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center"
              style={{ backgroundColor: BG_CARD }}
            >
              <FiPhone className="text-4xl text-gray-500" />
            </div>
            <p className="text-gray-400">No recent calls</p>
            <p className="text-gray-500 text-sm mt-1">Your call history will appear here</p>
          </div>
        )}
      </div>

      {/* Profile Bar */}
      <div
        className="px-4 py-3 flex items-center justify-between border-t"
        style={{ backgroundColor: BG_CARD, borderColor: BG_DARK }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
            style={{ backgroundColor: THEME_COLOR }}
          >
            {user?.username?.charAt(0).toUpperCase()}
          </div>
          <div>
            <span className="text-white font-medium block">{user?.username}</span>
            <span className="text-gray-400 text-xs">Online</span>
          </div>
        </div>
        <button onClick={handleLogout} className="text-gray-400 hover:text-white transition-colors">
          <FiSettings size={20} />
        </button>
      </div>
    </div>
  );
}
