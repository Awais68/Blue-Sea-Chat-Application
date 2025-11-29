import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../contexts/AuthContext";
import { roomsAPI } from "../utils/api";
import { FiPlus, FiUsers, FiLogOut } from "react-icons/fi";

export default function Rooms() {
  const [rooms, setRooms] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [roomDescription, setRoomDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-bg">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-primary-blue mx-auto"></div>
          <p className="mt-4 text-primary-silver">Loading rooms...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-bg">
      {/* Header */}
      <div className="bg-dark-card shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-white">WebRTC Chat</h1>
              <p className="text-primary-silver mt-1">
                Welcome, {user?.username}!
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
            >
              <FiLogOut />
              Logout
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <FiUsers className="text-primary-blue" />
            Chat Rooms
          </h2>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary-blue to-primary-purple hover:from-primary-purple hover:to-primary-blue text-white rounded-lg transition-all duration-300"
          >
            <FiPlus />
            Create Room
          </button>
        </div>

        {/* Rooms Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {rooms.map((room) => (
            <div
              key={room._id}
              onClick={() => router.push(`/chat/${room._id}`)}
              className="bg-dark-card p-6 rounded-lg shadow-lg hover:shadow-xl cursor-pointer transform hover:scale-105 transition-all duration-300 border border-gray-700 hover:border-primary-blue"
            >
              <h3 className="text-xl font-bold text-white mb-2">{room.name}</h3>
              <p className="text-primary-silver mb-4">
                {room.description || "No description"}
              </p>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">
                  Created by: {room.createdBy?.username || "Unknown"}
                </span>
                <span className="flex items-center gap-1 text-primary-blue">
                  <FiUsers />
                  {room.participants?.length || 0}
                </span>
              </div>
            </div>
          ))}
        </div>

        {rooms.length === 0 && (
          <div className="text-center py-12">
            <FiUsers className="mx-auto text-6xl text-gray-600 mb-4" />
            <p className="text-gray-400 text-lg">
              No rooms available. Create one to get started!
            </p>
          </div>
        )}
      </div>

      {/* Create Room Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 px-4">
          <div className="bg-dark-card p-8 rounded-lg shadow-xl max-w-md w-full">
            <h3 className="text-2xl font-bold text-white mb-6">
              Create New Room
            </h3>

            {error && (
              <div className="bg-red-500 bg-opacity-20 border border-red-500 text-red-500 px-4 py-3 rounded mb-4">
                {error}
              </div>
            )}

            <form onSubmit={handleCreateRoom} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-primary-silver mb-2">
                  Room Name
                </label>
                <input
                  type="text"
                  required
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  className="w-full px-3 py-3 border border-gray-600 bg-dark-hover text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-blue"
                  placeholder="Enter room name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-primary-silver mb-2">
                  Description (optional)
                </label>
                <textarea
                  value={roomDescription}
                  onChange={(e) => setRoomDescription(e.target.value)}
                  className="w-full px-3 py-3 border border-gray-600 bg-dark-hover text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-blue"
                  placeholder="Enter room description"
                  rows="3"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setRoomName("");
                    setRoomDescription("");
                    setError("");
                  }}
                  className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-primary-blue to-primary-purple hover:from-primary-purple hover:to-primary-blue text-white rounded-lg transition-all duration-300"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
