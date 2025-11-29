import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../contexts/AuthContext";
import { roomsAPI } from "../utils/api";
import {
  FiPlus,
  FiUsers,
  FiLogOut,
  FiSearch,
  FiMoreVertical,
  FiPhone,
  FiCamera,
  FiMessageCircle,
  FiSettings,
  FiCheck,
  FiClock,
} from "react-icons/fi";
import { format, isToday, isYesterday } from "date-fns";

export default function Rooms() {
  const [rooms, setRooms] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [roomDescription, setRoomDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("chats");

  const { user, logout, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }

    fetchRooms();
  }, [isAuthenticated, router]);

  const fetchRooms = async () => {
    try {
      const response = await roomsAPI.getAll();
      setRooms(response.data);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching rooms:", error);
      setLoading(false);
    }
  };

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    setError("");

    try {
      await roomsAPI.create({ name: roomName, description: roomDescription });
      setRoomName("");
      setRoomDescription("");
      setShowCreateModal(false);
      fetchRooms();
    } catch (error) {
      setError(error.response?.data?.message || "Failed to create room");
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

  const filteredRooms = rooms.filter((room) =>
    room.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#111B21]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-[#25D366] mx-auto"></div>
          <p className="mt-4 text-gray-400">Loading chats...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#111B21] flex flex-col">
      {/* WhatsApp Style Header */}
      <div className="bg-[#202C33] px-4 py-3">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-bold text-white">WhatsApp</h1>
          <div className="flex items-center gap-4">
            <button className="text-gray-400 hover:text-white transition-colors">
              <FiCamera size={20} />
            </button>
            <button className="text-gray-400 hover:text-white transition-colors">
              <FiSearch size={20} />
            </button>
            <div className="relative group">
              <button className="text-gray-400 hover:text-white transition-colors">
                <FiMoreVertical size={20} />
              </button>
              <div className="absolute right-0 top-full mt-2 bg-[#233138] rounded-lg shadow-xl py-2 w-48 hidden group-hover:block z-50">
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="w-full px-4 py-2 text-left text-gray-200 hover:bg-[#182229] flex items-center gap-3"
                >
                  <FiPlus size={16} />
                  New group
                </button>
                <button
                  onClick={handleLogout}
                  className="w-full px-4 py-2 text-left text-gray-200 hover:bg-[#182229] flex items-center gap-3"
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
      <div className="bg-[#111B21] px-3 py-2">
        <div className="relative">
          <FiSearch
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
            size={18}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search or start new chat"
            className="w-full pl-10 pr-4 py-2 bg-[#202C33] text-gray-200 rounded-lg focus:outline-none placeholder-gray-500"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#202C33]">
        <button
          onClick={() => setActiveTab("chats")}
          className={`flex-1 py-3 text-center font-medium transition-colors ${
            activeTab === "chats"
              ? "text-[#25D366] border-b-2 border-[#25D366]"
              : "text-gray-400"
          }`}
        >
          <FiMessageCircle className="inline mr-2" />
          Chats
        </button>
        <button
          onClick={() => setActiveTab("calls")}
          className={`flex-1 py-3 text-center font-medium transition-colors ${
            activeTab === "calls"
              ? "text-[#25D366] border-b-2 border-[#25D366]"
              : "text-gray-400"
          }`}
        >
          <FiPhone className="inline mr-2" />
          Calls
        </button>
      </div>

      {/* Chats List */}
      <div className="flex-1 overflow-y-auto">
        {filteredRooms.map((room) => (
          <div
            key={room._id}
            onClick={() => router.push(`/chat/${room._id}`)}
            className="flex items-center gap-3 px-4 py-3 hover:bg-[#202C33] cursor-pointer transition-colors border-b border-[#202C33]/50"
          >
            {/* Avatar */}
            <div className="w-12 h-12 rounded-full bg-[#6B7C85] flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
              {room.name.charAt(0).toUpperCase()}
            </div>

            {/* Chat Info */}
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-baseline">
                <h3 className="text-white font-medium truncate">{room.name}</h3>
                <span className="text-xs text-gray-500 flex-shrink-0 ml-2">
                  {formatLastSeen(room.updatedAt || room.createdAt)}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <FiCheck className="text-gray-500" size={14} />
                <p className="text-sm text-gray-400 truncate">
                  {room.description || "Tap to start chatting"}
                </p>
              </div>
            </div>
          </div>
        ))}

        {filteredRooms.length === 0 && (
          <div className="text-center py-12">
            <div className="w-20 h-20 rounded-full bg-[#202C33] mx-auto mb-4 flex items-center justify-center">
              <FiMessageCircle className="text-4xl text-gray-500" />
            </div>
            <p className="text-gray-400">
              {searchQuery ? "No chats found" : "No chats yet"}
            </p>
            <p className="text-gray-500 text-sm mt-1">
              Create a new group to start chatting
            </p>
          </div>
        )}
      </div>

      {/* Floating Action Button */}
      <button
        onClick={() => setShowCreateModal(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-[#25D366] hover:bg-[#128C7E] rounded-full flex items-center justify-center shadow-lg transition-colors"
      >
        <FiMessageCircle size={24} className="text-white" />
      </button>

      {/* Create Room Modal - WhatsApp Style */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-[#202C33] rounded-xl max-w-md w-full overflow-hidden">
            {/* Modal Header */}
            <div className="bg-[#075E54] px-4 py-4 flex items-center gap-4">
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-white hover:bg-white/10 p-1 rounded-full"
              >
                ✕
              </button>
              <h3 className="text-white font-semibold text-lg">New Group</h3>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleCreateRoom} className="p-4">
              {error && (
                <div className="mb-4 p-3 bg-red-500/20 border border-red-500 rounded-lg text-red-400 text-sm">
                  {error}
                </div>
              )}

              {/* Group Icon */}
              <div className="flex justify-center mb-6">
                <div className="w-24 h-24 rounded-full bg-[#6B7C85] flex items-center justify-center">
                  <FiCamera size={32} className="text-white" />
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <input
                    type="text"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    placeholder="Group name"
                    className="w-full px-0 py-3 bg-transparent text-white border-b-2 border-[#25D366] focus:outline-none placeholder-gray-400"
                    required
                  />
                </div>
                <div>
                  <input
                    type="text"
                    value={roomDescription}
                    onChange={(e) => setRoomDescription(e.target.value)}
                    placeholder="Group description (optional)"
                    className="w-full px-0 py-3 bg-transparent text-white border-b border-gray-600 focus:border-[#25D366] focus:outline-none placeholder-gray-400"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full mt-6 py-3 bg-[#25D366] hover:bg-[#128C7E] text-white font-semibold rounded-lg transition-colors"
              >
                Create Group
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Profile Bar */}
      <div className="bg-[#202C33] px-4 py-3 flex items-center justify-between border-t border-[#2A3942]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#6B7C85] flex items-center justify-center text-white font-bold">
            {user?.username?.charAt(0).toUpperCase()}
          </div>
          <span className="text-white font-medium">{user?.username}</span>
        </div>
        <button
          onClick={handleLogout}
          className="text-gray-400 hover:text-white transition-colors"
        >
          <FiSettings size={20} />
        </button>
      </div>
    </div>
  );
}
