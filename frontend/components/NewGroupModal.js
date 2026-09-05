import { useEffect, useMemo, useRef, useState } from "react";
import { FiX, FiSearch, FiCheck, FiUsers, FiArrowLeft } from "react-icons/fi";
import { roomsAPI, getErrorMessage } from "../utils/api";

const THEME_COLOR = "#00b3fd";
const THEME_DARK = "#0090cc";
const BG_DARK = "#0a1929";
const BG_CARD = "#0d2137";

/**
 * Two-step group creation, the same shape every messenger uses:
 * pick the members first, name the group second.
 *
 * Members come from your contacts, but the directory search is available
 * here too - otherwise you could never put somebody in a group without
 * first opening a one-to-one chat with them.
 */
const NewGroupModal = ({ open, contacts = [], onClose, onCreated }) => {
  const [step, setStep] = useState("members");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const nameRef = useRef(null);

  useEffect(() => {
    if (!open) {
      // Reset so re-opening never shows the previous attempt
      setStep("members");
      setQuery("");
      setResults([]);
      setSelected([]);
      setName("");
      setDescription("");
      setError("");
    }
  }, [open]);

  useEffect(() => {
    if (step === "details") nameRef.current?.focus();
  }, [step]);

  // Debounced directory search, so typing does not fire a request per key
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      return undefined;
    }

    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const { data } = await roomsAPI.searchUsers(term);
        if (!cancelled) setResults(data);
      } catch (err) {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const selectedIds = useMemo(
    () => new Set(selected.map((u) => String(u._id))),
    [selected]
  );

  const list = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (term.length >= 2) return results;
    if (!term) return contacts;
    return contacts.filter((c) => c.username?.toLowerCase().includes(term));
  }, [query, results, contacts]);

  const toggle = (person) => {
    setSelected((prev) =>
      prev.some((p) => String(p._id) === String(person._id))
        ? prev.filter((p) => String(p._id) !== String(person._id))
        : [...prev, person]
    );
  };

  const create = async () => {
    if (!name.trim()) {
      setError("Give the group a name");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const { data } = await roomsAPI.createGroup({
        name: name.trim(),
        description: description.trim(),
        participants: selected.map((u) => u._id),
      });
      onCreated?.(data);
    } catch (err) {
      setError(getErrorMessage(err, "Could not create the group"));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md h-[90vh] sm:h-[34rem] rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col shadow-2xl"
        style={{ backgroundColor: BG_DARK }}
      >
        {/* Header */}
        <div
          className="px-4 py-3 flex items-center gap-3"
          style={{ backgroundColor: THEME_COLOR }}
        >
          <button
            onClick={() => (step === "details" ? setStep("members") : onClose())}
            className="text-white/90 hover:text-white"
            aria-label="Back"
          >
            {step === "details" ? <FiArrowLeft size={20} /> : <FiX size={20} />}
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-white font-semibold leading-tight">
              {step === "members" ? "New group" : "Group details"}
            </h2>
            <p className="text-white/80 text-xs">
              {step === "members"
                ? `${selected.length} selected`
                : `${selected.length + 1} members`}
            </p>
          </div>
        </div>

        {step === "members" ? (
          <>
            {/* Selected chips */}
            {selected.length > 0 && (
              <div className="px-3 py-2 flex gap-2 overflow-x-auto border-b" style={{ borderColor: BG_CARD }}>
                {selected.map((person) => (
                  <button
                    key={person._id}
                    onClick={() => toggle(person)}
                    className="flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full shrink-0"
                    style={{ backgroundColor: BG_CARD }}
                  >
                    <span
                      className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                      style={{ backgroundColor: THEME_DARK }}
                    >
                      {person.username?.charAt(0).toUpperCase()}
                    </span>
                    <span className="text-gray-200 text-xs">{person.username}</span>
                    <FiX size={12} className="text-gray-400" />
                  </button>
                ))}
              </div>
            )}

            {/* Search */}
            <div className="px-3 py-2">
              <div className="relative">
                <FiSearch
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
                  size={16}
                />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search contacts or @username"
                  className="w-full pl-9 pr-3 py-2 text-sm text-gray-200 rounded-lg focus:outline-none placeholder-gray-500"
                  style={{ backgroundColor: BG_CARD }}
                />
              </div>
            </div>

            {/* People */}
            <div className="flex-1 overflow-y-auto">
              {searching && (
                <p className="px-4 py-2 text-xs text-gray-500">Searching…</p>
              )}
              {list.map((person) => {
                const isSelected = selectedIds.has(String(person._id));
                return (
                  <button
                    key={person._id}
                    onClick={() => toggle(person)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 text-left"
                  >
                    <div className="relative shrink-0">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
                        style={{ backgroundColor: THEME_DARK }}
                      >
                        {person.username?.charAt(0).toUpperCase()}
                      </div>
                      {isSelected && (
                        <span
                          className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center border-2"
                          style={{
                            backgroundColor: THEME_COLOR,
                            borderColor: BG_DARK,
                          }}
                        >
                          <FiCheck size={9} className="text-white" />
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-white text-sm truncate">
                        {person.username}
                      </p>
                      <p className="text-gray-500 text-xs truncate">
                        {person.about || person.email}
                      </p>
                    </div>
                  </button>
                );
              })}

              {!searching && list.length === 0 && (
                <p className="px-4 py-8 text-center text-sm text-gray-500">
                  {query.trim().length >= 2
                    ? "Nobody found"
                    : "Search for people to add"}
                </p>
              )}
            </div>

            <div className="p-3 border-t" style={{ borderColor: BG_CARD }}>
              <button
                disabled={selected.length === 0}
                onClick={() => setStep("details")}
                className="w-full py-2.5 rounded-lg text-white font-medium disabled:opacity-40"
                style={{ backgroundColor: THEME_COLOR }}
              >
                Next
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center text-white shrink-0"
                  style={{ backgroundColor: THEME_DARK }}
                >
                  <FiUsers size={24} />
                </div>
                <input
                  ref={nameRef}
                  type="text"
                  value={name}
                  maxLength={60}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Group name"
                  className="flex-1 px-3 py-2 text-gray-200 rounded-lg focus:outline-none placeholder-gray-500"
                  style={{ backgroundColor: BG_CARD }}
                />
              </div>

              <textarea
                value={description}
                maxLength={200}
                rows={3}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description (optional)"
                className="w-full px-3 py-2 text-sm text-gray-200 rounded-lg focus:outline-none placeholder-gray-500 resize-none"
                style={{ backgroundColor: BG_CARD }}
              />

              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wide mb-2">
                  Members
                </p>
                <div className="flex flex-wrap gap-2">
                  {selected.map((person) => (
                    <span
                      key={person._id}
                      className="px-2 py-1 rounded-full text-xs text-gray-200"
                      style={{ backgroundColor: BG_CARD }}
                    >
                      {person.username}
                    </span>
                  ))}
                </div>
              </div>

              {error && <p className="text-red-400 text-sm">{error}</p>}
            </div>

            <div className="p-3 border-t" style={{ borderColor: BG_CARD }}>
              <button
                disabled={saving}
                onClick={create}
                className="w-full py-2.5 rounded-lg text-white font-medium disabled:opacity-50"
                style={{ backgroundColor: THEME_COLOR }}
              >
                {saving ? "Creating…" : "Create group"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default NewGroupModal;
