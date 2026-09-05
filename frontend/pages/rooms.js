import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../contexts/AuthContext";
import { useNotifications } from "../contexts/NotificationContext";
import { roomsAPI } from "../utils/api";
import NewGroupModal from "../components/NewGroupModal";
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
  FiUserPlus,
  FiBell,
  FiBellOff,
  FiX,
} from "react-icons/fi";
import { format, isToday, isYesterday } from "date-fns";

// Theme colors
const THEME_COLOR = "#00b3fd";
const THEME_DARK = "#0090cc";
const BG_DARK = "#0a1929";
const BG_CARD = "#0d2137";

export default function Rooms() {
  const [chats, setChats] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [directory, setDirectory] = useState([]);
  const [searching, setSearching] = useState(false);
  const [activeTab, setActiveTab] = useState("chats"); // "chats" | "contacts" | "calls"
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const { user, logout, isAuthenticated, loading: authLoading } = useAuth();
  const {
    unreadByRoom,
    isUserOnline,
    watchUsers,
    lastSeenById,
    soundEnabled,
    toggleSound,
    setActiveRoom,
  } = useNotifications();
  const router = useRouter();

  /**
   * Waiting for authLoading is the whole fix for the "stuck on loading"
   * report: redirecting on !isAuthenticated before the stored session has
   * been read bounces a perfectly valid session out to /login.
   */
  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }
    fetchData();
  }, [authLoading, isAuthenticated, router]);

  // No room is open on this screen
  useEffect(() => {
    setActiveRoom(null);
  }, [setActiveRoom]);

  const fetchData = async () => {
    try {
      const [chatsRes, contactsRes] = await Promise.all([
        roomsAPI.getAll(),
        roomsAPI.getUsers(),
      ]);
      setChats(chatsRes.data);
      setContacts(contactsRes.data);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  // Ask the server for the current status of everyone we are about to render
  useEffect(() => {
    const ids = new Set();
    contacts.forEach((c) => ids.add(String(c._id)));
    chats.forEach((chat) => {
      if (!chat.isGroup) {
        (chat.participants || []).forEach((p) => {
          const id = String(p._id || p);
          if (id !== String(user?.id)) ids.add(id);
        });
      }
    });
    if (ids.size) watchUsers(Array.from(ids));
  }, [contacts, chats, user, watchUsers]);

  /* ------------------------------------------------------------------ *
   * Directory search - the only way to reach somebody outside contacts
   * ------------------------------------------------------------------ */
  useEffect(() => {
    const term = searchQuery.trim();
    if (activeTab !== "contacts" || term.length < 2) {
      setDirectory([]);
      return undefined;
    }

    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const { data } = await roomsAPI.searchUsers(term);
        if (!cancelled) setDirectory(data);
      } catch (error) {
        if (!cancelled) setDirectory([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, activeTab]);

  const handleStartChat = async (targetUserId) => {
    try {
      const response = await roomsAPI.startDirectChat(targetUserId);
      router.push(`/chat/${response.data._id}`);
    } catch (error) {
      console.error("Error starting chat:", error);
    }
  };

  const handleAddContact = async (person) => {
    try {
      await roomsAPI.addContact(person._id);
      setContacts((prev) =>
        prev.some((c) => String(c._id) === String(person._id))
          ? prev
          : [...prev, person].sort((a, b) =>
              a.username.localeCompare(b.username)
            )
      );
      setDirectory((prev) =>
        prev.map((p) =>
          String(p._id) === String(person._id) ? { ...p, isContact: true } : p
        )
      );
    } catch (error) {
      console.error("Error adding contact:", error);
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

  /** The other side of a 1:1 chat, used for the presence dot. */
  const otherParticipantId = useCallback(
    (chat) => {
      if (chat.isGroup) return null;
      const other = (chat.participants || []).find(
        (p) => String(p._id || p) !== String(user?.id)
      );
      return other ? String(other._id || other) : null;
    },
    [user]
  );

  const filteredChats = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    const list = term
      ? chats.filter((chat) => chat.name?.toLowerCase().includes(term))
      : chats;

    // Unread first, then most recent - the order you actually want
    return [...list].sort((a, b) => {
      const unreadA = unreadByRoom[a._id] || a.unreadCount || 0;
      const unreadB = unreadByRoom[b._id] || b.unreadCount || 0;
      if ((unreadA > 0) !== (unreadB > 0)) return unreadB - unreadA;
      const timeA = new Date(a.lastMessage?.timestamp || a.createdAt).getTime();
      const timeB = new Date(b.lastMessage?.timestamp || b.createdAt).getTime();
      return timeB - timeA;
    });
  }, [chats, searchQuery, unreadByRoom]);

  const contactIds = useMemo(
    () => new Set(contacts.map((c) => String(c._id))),
    [contacts]
  );

  const filteredContacts = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    if (!term) return contacts;
    return contacts.filter(
      (c) =>
        c.username.toLowerCase().includes(term) ||
        c.email?.toLowerCase().includes(term)
    );
  }, [contacts, searchQuery]);

  // People the search turned up who are not already in the contact list
  const strangers = useMemo(
    () => directory.filter((p) => !contactIds.has(String(p._id))),
    [directory, contactIds]
  );

  if (authLoading || loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: BG_DARK }}
      >
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
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: BG_DARK }}
    >
      {/* Header */}
      <div className="px-4 py-3" style={{ backgroundColor: THEME_COLOR }}>
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-bold text-white">Blue Sea Chat</h1>
          <div className="flex items-center gap-4">
            <button
              onClick={toggleSound}
              className="text-white/80 hover:text-white transition-colors"
              title={soundEnabled ? "Mute notifications" : "Unmute notifications"}
            >
              {soundEnabled ? <FiBell size={20} /> : <FiBellOff size={20} />}
            </button>
            <div className="relative">
              <button
                onClick={() => setMenuOpen((open) => !open)}
                className="text-white/80 hover:text-white transition-colors"
              >
                <FiMoreVertical size={20} />
              </button>
              {menuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setMenuOpen(false)}
                  />
                  <div
                    className="absolute right-0 top-full mt-2 rounded-lg shadow-xl py-2 w-48 z-50"
                    style={{ backgroundColor: BG_CARD }}
                  >
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        setShowGroupModal(true);
                      }}
                      className="w-full px-4 py-2 text-left text-gray-200 hover:bg-white/10 flex items-center gap-3"
                    >
                      <FiUsers size={16} />
                      New group
                    </button>
                    <button
                      onClick={handleLogout}
                      className="w-full px-4 py-2 text-left text-gray-200 hover:bg-white/10 flex items-center gap-3"
                    >
                      <FiLogOut size={16} />
                      Log out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="px-3 py-2" style={{ backgroundColor: BG_DARK }}>
        <div className="relative">
          <FiSearch
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
            size={18}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              activeTab === "contacts"
                ? "Search contacts or find @username"
                : "Search chats..."
            }
            className="w-full pl-10 pr-9 py-2 text-gray-200 rounded-lg focus:outline-none placeholder-gray-500"
            style={{ backgroundColor: BG_CARD }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              aria-label="Clear search"
            >
              <FiX size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b" style={{ borderColor: BG_CARD }}>
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
          onClick={() => setActiveTab("contacts")}
          className={`flex-1 py-3 text-center font-medium transition-colors ${
            activeTab === "contacts" ? "border-b-2 text-white" : "text-gray-400"
          }`}
          style={activeTab === "contacts" ? { borderColor: THEME_COLOR } : {}}
        >
          <FiUsers className="inline mr-2" />
          Contacts ({contacts.length})
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
        {/* Chats */}
        {activeTab === "chats" && (
          <>
            {filteredChats.map((chat) => {
              const unread = unreadByRoom[chat._id] ?? chat.unreadCount ?? 0;
              const otherId = otherParticipantId(chat);
              const online = otherId ? isUserOnline(otherId) : false;

              return (
                <div
                  key={chat._id}
                  onClick={() => router.push(`/chat/${chat._id}`)}
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors border-b hover:bg-white/5"
                  style={{ borderColor: BG_CARD }}
                >
                  <div className="relative flex-shrink-0">
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg"
                      style={{
                        backgroundColor: chat.isGroup ? THEME_DARK : THEME_COLOR,
                      }}
                    >
                      {chat.isGroup ? (
                        <FiUsers size={22} />
                      ) : (
                        chat.name?.charAt(0).toUpperCase() || "?"
                      )}
                    </div>
                    {online && (
                      <span
                        className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2"
                        style={{
                          backgroundColor: "#22c55e",
                          borderColor: BG_DARK,
                        }}
                      />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline">
                      <h3 className="text-white font-medium truncate">
                        {chat.name}
                      </h3>
                      <span
                        className="text-xs flex-shrink-0 ml-2"
                        style={{ color: unread > 0 ? THEME_COLOR : "#6b7280" }}
                      >
                        {formatLastSeen(
                          chat.lastMessage?.timestamp || chat.createdAt
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 min-w-0 flex-1">
                        {chat.lastMessage && unread === 0 && (
                          <FiCheck className="text-gray-500 shrink-0" size={14} />
                        )}
                        <p
                          className={`text-sm truncate ${
                            unread > 0 ? "text-gray-200" : "text-gray-400"
                          }`}
                        >
                          {chat.lastMessage?.content || "Tap to start chatting"}
                        </p>
                      </div>
                      {unread > 0 && (
                        <span
                          className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold text-white flex items-center justify-center"
                          style={{ backgroundColor: THEME_COLOR }}
                        >
                          {unread > 99 ? "99+" : unread}
                        </span>
                      )}
                    </div>
                    {chat.isGroup && chat.memberCount > 0 && (
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        {chat.memberCount} members
                      </p>
                    )}
                  </div>
                </div>
              );
            })}

            {filteredChats.length === 0 && (
              <div className="text-center py-12">
                <div
                  className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center"
                  style={{ backgroundColor: BG_CARD }}
                >
                  <FiMessageCircle className="text-4xl text-gray-500" />
                </div>
                <p className="text-gray-400">
                  {searchQuery ? "No chats found" : "No chats yet"}
                </p>
                <p className="text-gray-500 text-sm mt-1">
                  Open Contacts to start a new chat
                </p>
              </div>
            )}
          </>
        )}

        {/* Contacts + directory search */}
        {activeTab === "contacts" && (
          <>
            <button
              onClick={() => setShowGroupModal(true)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 border-b"
              style={{ borderColor: BG_CARD }}
            >
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-white flex-shrink-0"
                style={{ backgroundColor: THEME_COLOR }}
              >
                <FiUsers size={22} />
              </div>
              <span className="text-white font-medium">New group</span>
            </button>

            {filteredContacts.length > 0 && (
              <div
                className="px-4 py-2 text-gray-400 text-xs uppercase tracking-wide"
                style={{ backgroundColor: BG_CARD }}
              >
                Contacts
              </div>
            )}

            {filteredContacts.map((person) => {
              const online = isUserOnline(person._id);
              return (
                <div
                  key={person._id}
                  onClick={() => handleStartChat(person._id)}
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors border-b hover:bg-white/5"
                  style={{ borderColor: BG_CARD }}
                >
                  <div className="relative flex-shrink-0">
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg"
                      style={{ backgroundColor: THEME_DARK }}
                    >
                      {person.username.charAt(0).toUpperCase()}
                    </div>
                    {online && (
                      <span
                        className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2"
                        style={{
                          backgroundColor: "#22c55e",
                          borderColor: BG_DARK,
                        }}
                      />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="text-white font-medium truncate">
                      {person.username}
                    </h3>
                    <p className="text-sm text-gray-400 truncate">
                      {online
                        ? "Online"
                        : lastSeenById[String(person._id)]
                        ? `Last seen ${formatLastSeen(
                            lastSeenById[String(person._id)]
                          )}`
                        : person.about || person.email}
                    </p>
                  </div>

                  <div className="text-gray-400">
                    <FiMessageCircle size={20} />
                  </div>
                </div>
              );
            })}

            {searching && (
              <p className="px-4 py-3 text-xs text-gray-500">Searching…</p>
            )}

            {strangers.length > 0 && (
              <>
                <div
                  className="px-4 py-2 text-gray-400 text-xs uppercase tracking-wide"
                  style={{ backgroundColor: BG_CARD }}
                >
                  Found on Blue Sea
                </div>
                {strangers.map((person) => (
                  <div
                    key={person._id}
                    className="flex items-center gap-3 px-4 py-3 border-b"
                    style={{ borderColor: BG_CARD }}
                  >
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0"
                      style={{ backgroundColor: "#334155" }}
                    >
                      {person.username.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-white font-medium truncate">
                        @{person.username}
                      </h3>
                      <p className="text-sm text-gray-500 truncate">
                        {person.about || "Not in your contacts"}
                      </p>
                    </div>
                    <button
                      onClick={() => handleAddContact(person)}
                      className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium text-white flex items-center gap-1.5"
                      style={{ backgroundColor: THEME_COLOR }}
                    >
                      <FiUserPlus size={13} />
                      Add
                    </button>
                  </div>
                ))}
              </>
            )}

            {filteredContacts.length === 0 &&
              strangers.length === 0 &&
              !searching && (
                <div className="text-center py-12">
                  <div
                    className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center"
                    style={{ backgroundColor: BG_CARD }}
                  >
                    <FiUser className="text-4xl text-gray-500" />
                  </div>
                  <p className="text-gray-400">
                    {searchQuery.trim().length >= 2
                      ? "Nobody found"
                      : "No contacts yet"}
                  </p>
                  <p className="text-gray-500 text-sm mt-1 px-8">
                    Search a username above to find someone and add them
                  </p>
                </div>
              )}
          </>
        )}

        {/* Calls */}
        {activeTab === "calls" && (
          <div className="text-center py-12">
            <div
              className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center"
              style={{ backgroundColor: BG_CARD }}
            >
              <FiPhone className="text-4xl text-gray-500" />
            </div>
            <p className="text-gray-400">No recent calls</p>
            <p className="text-gray-500 text-sm mt-1">
              Your call history will appear here
            </p>
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
            <span className="text-white font-medium block">
              {user?.username}
            </span>
            <span className="text-gray-400 text-xs">@{user?.username}</span>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="text-gray-400 hover:text-white transition-colors"
        >
          <FiSettings size={20} />
        </button>
      </div>

      <NewGroupModal
        open={showGroupModal}
        contacts={contacts}
        onClose={() => setShowGroupModal(false)}
        onCreated={(room) => {
          setShowGroupModal(false);
          setChats((prev) => [room, ...prev]);
          router.push(`/chat/${room._id}`);
        }}
      />
    </div>
  );
}
