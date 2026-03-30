"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { addNote, getNotes, deleteNote, Note } from "@/lib/firestore";
import { useRouter } from "next/navigation";

export default function Dashboard() {
  const { user, logout, loading } = useAuth();
  const router = useRouter();
  const [notes, setNotes] = useState<Note[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push("/auth");
  }, [user, loading, router]);

  useEffect(() => {
    if (user) fetchNotes();
  }, [user]);

  const fetchNotes = async () => {
    if (!user) return;
    const data = await getNotes(user.uid);
    setNotes(data);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !title.trim()) return;
    setSaving(true);
    await addNote({ title, content, userId: user.uid });
    setTitle("");
    setContent("");
    await fetchNotes();
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    await deleteNote(id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className="text-gray-400 text-sm mt-1">{user?.email}</p>
          </div>
          <button
            onClick={logout}
            className="bg-gray-800 hover:bg-gray-700 text-sm px-4 py-2 rounded-lg transition-colors"
          >
            Sign Out
          </button>
        </div>

        {/* Add Note Form */}
        <form onSubmit={handleAdd} className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
          <h2 className="font-semibold mb-4 text-gray-300">Add a Note</h2>
          <input
            type="text"
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 mb-3"
          />
          <textarea
            placeholder="Content (optional)"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 mb-3 resize-none"
          />
          <button
            type="submit"
            disabled={saving}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold px-6 py-2 rounded-lg transition-colors"
          >
            {saving ? "Saving..." : "Add Note"}
          </button>
        </form>

        {/* Notes List */}
        <div className="space-y-3">
          {notes.length === 0 && (
            <p className="text-center text-gray-600 py-10">No notes yet. Add one above!</p>
          )}
          {notes.map((note) => (
            <div key={note.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex justify-between items-start gap-4">
              <div>
                <h3 className="font-semibold text-white">{note.title}</h3>
                {note.content && <p className="text-gray-400 text-sm mt-1">{note.content}</p>}
              </div>
              <button
                onClick={() => handleDelete(note.id!)}
                className="text-red-500 hover:text-red-400 text-sm flex-shrink-0"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
