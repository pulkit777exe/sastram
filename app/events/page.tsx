"use client";
import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { UserButton } from "@clerk/nextjs";
import { format } from "date-fns";
import { toast } from "react-hot-toast";

interface Event {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  tags: { tag: { name: string } }[];
}

interface Comment {
  id: string;
  content: string;
  authorName: string;
  authorAvatar: string;
  createdAt: string;
}

export default function EventsPage() {
  const { user } = useUser();
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentInput, setCommentInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    fetchEvents();
  }, []);

  useEffect(() => {
    if (selectedEvent) fetchComments(selectedEvent.id);
  }, [selectedEvent]);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/questions");
      const data = await res.json();
      setEvents(data.sort((a: Event, b: Event) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()));
      setSelectedEvent(data[1] || data[0] || null); // Science Exhibition default if present
    } catch {
      toast.error("Failed to load events");
    } finally {
      setLoading(false);
    }
  };

  const fetchComments = async (eventId: string) => {
    const res = await fetch(`/api/questions/${eventId}`);
    const data = await res.json();
    setComments(
      (data.answers || []).map((a: any) => ({
        id: a.id,
        content: a.content,
        authorName: a.authorName,
        authorAvatar: a.authorAvatar,
        createdAt: a.createdAt,
      }))
    );
  };

  const handleComment = async () => {
    if (!user) {
      toast.error("Sign in to comment");
      return;
    }
    if (!commentInput.trim()) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/questions/${selectedEvent?.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: commentInput }),
      });
      if (!res.ok) throw new Error();
      setCommentInput("");
      fetchComments(selectedEvent!.id);
      toast.success("Comment posted");
    } catch {
      toast.error("Failed to post comment");
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#181818] flex items-center justify-center py-8 px-2">
      <div className="bg-white rounded-2xl shadow-xl flex w-full max-w-6xl min-h-[600px] overflow-hidden">
        {/* Sidebar */}
        <aside className="w-80 bg-[#f7f7f3] border-r border-gray-200 p-8 flex flex-col">
          <div className="text-xl font-bold mb-8 tracking-tight text-gray-900">Recent Events</div>
          <div className="flex flex-col gap-3">
            {events.map((event) => (
              <button
                key={event.id}
                onClick={() => setSelectedEvent(event)}
                className={`text-left rounded-xl px-4 py-4 transition-all border border-transparent ${
                  selectedEvent?.id === event.id
                    ? "bg-black text-white border-black shadow-sm"
                    : "bg-white text-gray-900 hover:bg-gray-100"
                }`}
              >
                <div className="font-semibold text-base mb-1 truncate">
                  {event.title}
                </div>
                <div className="text-xs text-gray-500 mb-2 truncate">
                  {event.content.slice(0, 60)}{event.content.length > 60 ? "..." : ""}
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span>{format(new Date(event.createdAt), "MMM d")}</span>
                  <span className="inline-block ml-2">→</span>
                </div>
              </button>
            ))}
          </div>
        </aside>
        {/* Main Content */}
        <main className="flex-1 bg-[#fcfcfa] flex flex-col p-10">
          {selectedEvent && (
            <>
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs text-gray-500">Date: {format(new Date(selectedEvent.createdAt), "MMMM d")}</div>
                <div className="flex items-center gap-2">
                  <UserButton afterSignOutUrl="/events" />
                </div>
              </div>
              <div className="text-2xl font-bold text-gray-900 mb-2">{selectedEvent.title}</div>
              <div className="text-gray-700 mb-6 max-w-2xl leading-relaxed">{selectedEvent.content}</div>
              <div className="flex gap-2 mb-8">
                {selectedEvent.tags.map(({ tag }) => (
                  <span key={tag.name} className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">
                    {tag.name}
                  </span>
                ))}
              </div>
              {/* Comments */}
              <div className="flex-1 flex flex-col">
                <div className="font-semibold text-gray-900 mb-4">{comments.length} comments</div>
                <div className="flex flex-col gap-6 mb-6 overflow-y-auto max-h-80 pr-2">
                  {comments.map((c) => (
                    <div key={c.id} className="flex gap-3 items-start">
                      <img src={c.authorAvatar} alt={c.authorName} className="w-9 h-9 rounded-full object-cover" />
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-gray-900 text-sm">{c.authorName}</span>
                          <span className="text-xs text-gray-400">{format(new Date(c.createdAt), "MMM d, h:mm a")}</span>
                        </div>
                        <div className="text-gray-700 text-sm leading-relaxed">{c.content}</div>
                      </div>
                    </div>
                  ))}
                  {comments.length === 0 && <div className="text-gray-400 text-sm">No comments yet.</div>}
                </div>
                {/* Comment input */}
                <div className="mt-auto pt-4 border-t border-gray-100 flex items-end gap-3">
                  <img
                    src={user?.imageUrl || "https://api.dicebear.com/7.x/avataaars/svg?seed=Anonymous"}
                    alt={user?.fullName || "Anonymous"}
                    className="w-9 h-9 rounded-full object-cover"
                  />
                  <textarea
                    className="flex-1 resize-none border border-gray-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black bg-white"
                    placeholder="Type your message here..."
                    value={commentInput}
                    onChange={(e) => setCommentInput(e.target.value)}
                    rows={2}
                    disabled={posting}
                  />
                  <button
                    onClick={handleComment}
                    disabled={posting || !commentInput.trim()}
                    className="bg-black text-white px-4 py-2 rounded-lg hover:bg-gray-900 transition disabled:opacity-50"
                  >
                    <span className="sr-only">Send</span>
                    <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path fill="currentColor" d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                  </button>
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
} 