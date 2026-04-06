"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { addNote, getNotes, updateNote, deleteNote, Note } from "@/lib/firestore";
import { CIPRecord } from "@/lib/cip";
import { useRouter } from "next/navigation";

const STATUS_COLORS: Record<string, string> = {
  open:        "bg-blue-900/40 text-blue-300",
  "in progress": "bg-yellow-900/40 text-yellow-300",
  completed:   "bg-green-900/40 text-green-300",
  closed:      "bg-gray-700 text-gray-400",
};

function statusClass(status: string) {
  return STATUS_COLORS[status.toLowerCase()] ?? "bg-gray-700 text-gray-400";
}

type ActiveTab = "notes" | "cip";

export default function Dashboard() {
  const { user, logout, loading, msAccessToken } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ActiveTab>("cip");

  // Notes state
  const [notes, setNotes] = useState<Note[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [isPinned, setIsPinned] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // CIP state
  const [cipRecords, setCipRecords] = useState<CIPRecord[]>([]);
  const [cipLoading, setCipLoading] = useState(false);
  const [cipError, setCipError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterType, setFilterType] = useState("");

  useEffect(() => {
    if (!loading && !user) router.push("/auth");
  }, [user, loading, router]);

  useEffect(() => {
    if (user) {
      fetchNotes();
      fetchCIPRecords();
    }
  }, [user]);

  // ── Notes ──────────────────────────────────────────────
  const fetchNotes = async () => {
    if (!user) return;
    const data = await getNotes(user.uid);
    setNotes(data);
  };

  const handleSubmit = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (!user || !title.trim()) return;
    setSaving(true);
    const parsedTags = tags.split(",").map((t) => t.trim()).filter(Boolean);
    if (editingId) {
      await updateNote(editingId, { title, content, tags: parsedTags, isPinned });
      setEditingId(null);
    } else {
      await addNote({ title, content, userId: user.uid, tags: parsedTags, isPinned });
    }
    setTitle(""); setContent(""); setTags(""); setIsPinned(false);
    await fetchNotes();
    setSaving(false);
  };

  const handleEdit = (note: Note) => {
    setEditingId(note.id!);
    setTitle(note.title);
    setContent(note.content);
    setTags(note.tags?.join(", ") ?? "");
    setIsPinned(note.isPinned ?? false);
  };

  const handleTogglePin = async (note: Note) => {
    await updateNote(note.id!, { isPinned: !note.isPinned });
    await fetchNotes();
  };

  const handleDelete = async (id: string) => {
    await deleteNote(id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
  };

  // ── CIP Records ────────────────────────────────────────
  const fetchCIPRecords = async () => {
    setCipLoading(true);
    setCipError("");
    try {
      const headers: Record<string, string> = {};
      if (msAccessToken) headers["Authorization"] = `Bearer ${msAccessToken}`;
      const res = await fetch("/api/cip", { headers });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setCipRecords(data.records);
    } catch (err) {
      setCipError(err instanceof Error ? err.message : "Failed to load CIP records");
    } finally {
      setCipLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setCipError("");
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (msAccessToken) headers["Authorization"] = `Bearer ${msAccessToken}`;
      const res = await fetch("/api/sync", { method: "POST", headers });
      const data = await res.json();
      if (!data.success && !data.synced) throw new Error(data.error);
      setLastSynced(new Date().toLocaleTimeString());
      await fetchCIPRecords();
    } catch (err) {
      setCipError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const filteredCIP = cipRecords.filter((r) => {
    const matchStatus = filterStatus ? r.cipStatus.toLowerCase().includes(filterStatus.toLowerCase()) : true;
    const matchType   = filterType   ? r.cipType.toLowerCase().includes(filterType.toLowerCase())     : true;
    return matchStatus && matchType;
  });

  const uniqueStatuses = [...new Set(cipRecords.map((r) => r.cipStatus).filter(Boolean))];
  const uniqueTypes    = [...new Set(cipRecords.map((r) => r.cipType).filter(Boolean))];

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className="text-gray-400 text-sm mt-1">{user?.email}</p>
          </div>
          <button onClick={logout} className="bg-gray-800 hover:bg-gray-700 text-sm px-4 py-2 rounded-lg transition-colors">
            Sign Out
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-gray-800">
          {(["cip", "notes"] as ActiveTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === tab
                  ? "bg-gray-900 text-white border border-b-gray-900 border-gray-700"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {tab === "cip" ? "CIP Records" : "Notes"}
            </button>
          ))}
        </div>

        {/* ── CIP Records Tab ── */}
        {activeTab === "cip" && (
          <div>
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="bg-gray-800 border border-gray-700 text-sm text-white rounded-lg px-3 py-2 focus:outline-none"
              >
                <option value="">All Statuses</option>
                {uniqueStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="bg-gray-800 border border-gray-700 text-sm text-white rounded-lg px-3 py-2 focus:outline-none"
              >
                <option value="">All Types</option>
                {uniqueTypes.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <div className="ml-auto flex items-center gap-3">
                {lastSynced && <span className="text-xs text-gray-500">Last synced: {lastSynced}</span>}
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                >
                  {syncing ? "Syncing..." : "Sync from SharePoint"}
                </button>
                <button
                  onClick={fetchCIPRecords}
                  disabled={cipLoading}
                  className="bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-sm px-4 py-2 rounded-lg transition-colors"
                >
                  {cipLoading ? "Loading..." : "Refresh"}
                </button>
              </div>
            </div>

            {cipError && (
              <div className="bg-red-900/30 border border-red-700 text-red-400 text-sm rounded-lg px-4 py-3 mb-4">
                {cipError}
              </div>
            )}

            {/* Table */}
            {cipLoading ? (
              <p className="text-center text-gray-500 py-16">Loading CIP records...</p>
            ) : filteredCIP.length === 0 ? (
              <p className="text-center text-gray-600 py-16">
                No CIP records found. Click &quot;Sync from SharePoint&quot; to load data.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-800">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-900 text-gray-400 text-left">
                      <th className="px-4 py-3 font-medium">CHR Ticket #</th>
                      <th className="px-4 py-3 font-medium">CIP Type</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Submission Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {filteredCIP.map((record) => (
                      <tr key={record.id} className="hover:bg-gray-900/60 transition-colors">
                        <td className="px-4 py-3 font-medium text-white">{record.chrTicketNumbers || "—"}</td>
                        <td className="px-4 py-3 text-gray-300">{record.cipType || "—"}</td>
                        <td className="px-4 py-3">
                          {record.cipStatus ? (
                            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusClass(record.cipStatus)}`}>
                              {record.cipStatus}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-400">
                          {record.submissionDate
                            ? new Date(record.submissionDate).toLocaleDateString()
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-4 py-2 bg-gray-900 border-t border-gray-800 text-xs text-gray-500">
                  {filteredCIP.length} record{filteredCIP.length !== 1 ? "s" : ""}
                  {msAccessToken ? " · Delegated access" : " · App-only access"}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Notes Tab ── */}
        {activeTab === "notes" && (
          <div>
            <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
              <h2 className="font-semibold mb-4 text-gray-300">{editingId ? "Edit Note" : "Add a Note"}</h2>
              <input type="text" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} required
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 mb-3" />
              <textarea placeholder="Content (optional)" value={content} onChange={(e) => setContent(e.target.value)} rows={3}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 mb-3 resize-none" />
              <input type="text" placeholder="Tags (comma separated)" value={tags} onChange={(e) => setTags(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 mb-3" />
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
                  <input type="checkbox" checked={isPinned} onChange={(e) => setIsPinned(e.target.checked)} className="accent-indigo-500" />
                  Pin this note
                </label>
                <div className="flex gap-2">
                  {editingId && (
                    <button type="button" onClick={() => { setEditingId(null); setTitle(""); setContent(""); setTags(""); setIsPinned(false); }}
                      className="bg-gray-700 hover:bg-gray-600 text-sm px-4 py-2 rounded-lg transition-colors">Cancel</button>
                  )}
                  <button type="submit" disabled={saving}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold px-6 py-2 rounded-lg transition-colors">
                    {saving ? "Saving..." : editingId ? "Update" : "Add Note"}
                  </button>
                </div>
              </div>
            </form>

            <div className="space-y-3">
              {notes.length === 0 && <p className="text-center text-gray-600 py-10">No notes yet. Add one above!</p>}
              {notes.map((note) => (
                <div key={note.id} className={`bg-gray-900 border rounded-xl p-5 ${note.isPinned ? "border-indigo-700" : "border-gray-800"}`}>
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {note.isPinned && <span className="text-indigo-400 text-xs font-semibold uppercase tracking-wide">Pinned</span>}
                        <h3 className="font-semibold text-white">{note.title}</h3>
                      </div>
                      {note.content && <p className="text-gray-400 text-sm mt-1">{note.content}</p>}
                      {note.tags?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {note.tags.map((tag) => (
                            <span key={tag} className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">{tag}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button onClick={() => handleTogglePin(note)} className="text-gray-500 hover:text-indigo-400 text-sm transition-colors">
                        {note.isPinned ? "Unpin" : "Pin"}
                      </button>
                      <button onClick={() => handleEdit(note)} className="text-blue-500 hover:text-blue-400 text-sm transition-colors">Edit</button>
                      <button onClick={() => handleDelete(note.id!)} className="text-red-500 hover:text-red-400 text-sm transition-colors">Delete</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
