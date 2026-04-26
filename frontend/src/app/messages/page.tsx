"use client";

import { useEffect, useState, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import { supabase } from "@/lib/supabase";

export default function MessagesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const listingId = searchParams.get("listing_id");
  const receiverId = searchParams.get("receiver_id");

  const [messages, setMessages] = useState<any[]>([]);
  const [inboxThreads, setInboxThreads] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [user, setUser] = useState<any>(null);
  const [fallbackPropertyTitle, setFallbackPropertyTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    let channel: any;

    const initChat = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setUser(session.user);

      // 1. Fetch Inbox Threads ALWAYS for the sidebar
      try {
        const inboxRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/inbox?user_id=${session.user.id}`);
        const inboxData = await inboxRes.json();
        setInboxThreads(Array.isArray(inboxData) ? inboxData : []);
      } catch (err) {
        console.error("Failed to load inbox", err);
      }

      // 2. Fetch specific chat history if a chat is active
      if (listingId) {
        try {
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/messages?listing_id=${listingId}&user_id=${session.user.id}`);
          const data = await res.json();
          setMessages(Array.isArray(data) ? data : []);
          
          // Fetch property details for header fallback (if new conversation)
          const listingRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/listings/${listingId}`);
          if (listingRes.ok) {
            const listingData = await listingRes.json();
            setFallbackPropertyTitle(listingData.title);
          }
        } catch (err) {
          console.error("Failed to load message history", err);
        }

        // Subscribe to live Broadcast updates via Supabase WebSockets
        channel = supabase.channel(`public:messages:${listingId}`)
          .on(
            'broadcast',
            { event: 'new_message' },
            (payload: any) => {
              console.log("Broadcast payload received!", payload);
              if (payload.payload) {
                setMessages(prev => {
                  if (prev.find(m => m.id === payload.payload.id)) return prev;
                  return [...prev, payload.payload];
                });
              }
            }
          )
          .subscribe((status, err) => {
            console.log("Supabase Broadcast Status:", status, err);
          });
      }
      setLoading(false);
    };

    initChat();

    // Cleanup subscription on unmount
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [listingId]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user || !listingId || !receiverId) return;

    const messagePayload = {
      listing_id: parseInt(listingId),
      sender_id: user.id,
      receiver_id: receiverId,
      content: newMessage.trim()
    };

    setNewMessage(""); // optimistic clear

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(messagePayload)
      });

      const savedMessage = await res.json();

      // OPTIMISTIC UPDATE: Update local UI immediately
      setMessages(prev => {
        if (prev.find(m => m.id === savedMessage.id)) return prev;
        return [...prev, savedMessage];
      });

      // BROADCAST to other connected users in the chat room seamlessly
      supabase.channel(`public:messages:${listingId}`).send({
        type: 'broadcast',
        event: 'new_message',
        payload: savedMessage
      });

      // BROADCAST to the recipient's global notification channel
      supabase.channel(`user_notifications:${receiverId}`).send({
        type: 'broadcast',
        event: 'new_message',
        payload: savedMessage
      });

    } catch (err) {
      console.error("Failed to send message", err);
      alert("Error sending message.");
    }
  };

  // Group threads by listing
  const groups = inboxThreads.reduce((acc, thread) => {
    if (!acc[thread.listing_id]) {
      acc[thread.listing_id] = {
        title: thread.listing_title,
        image: thread.listing_image,
        threads: []
      };
    }
    acc[thread.listing_id].threads.push(thread);
    return acc;
  }, {} as Record<string, { title: string, image: string | null, threads: any[] }>);

  // Derive active chat metadata
  const activeThread = inboxThreads.find(t => t.listing_id.toString() === listingId && t.other_user_id === receiverId);
  const activePropertyTitle = activeThread?.listing_title || fallbackPropertyTitle || `Property #${listingId}`;
  const activeUserName = activeThread?.other_user_name || "User";

  return (
    <ProtectedRoute>
      <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-white">
        
        {/* LEFT PANE: Inbox Sidebar */}
        <div className={`w-full md:w-1/3 max-w-sm border-r flex flex-col ${listingId ? 'hidden md:flex' : 'flex'}`}>
          <div className="p-4 border-b bg-gray-50">
            <h1 className="text-xl font-bold text-gray-900">Inbox</h1>
          </div>
          
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <p className="p-4 text-sm text-gray-500 text-center mt-10">Loading threads...</p>
            ) : inboxThreads.length === 0 ? (
              <div className="p-8 text-center text-gray-500 text-sm">
                No active conversations. When buyers contact you, they will appear here!
              </div>
            ) : (
              Object.entries(groups).map(([lId, group]: [string, any]) => (
                <div key={lId} className="border-b last:border-b-0">
                  {/* Listing Group Header */}
                  <div className="bg-gray-100 p-3 pt-4 flex items-center gap-3 sticky top-0">
                    {group.image ? (
                      <img src={group.image} alt="Property" className="w-10 h-10 rounded-md object-cover border" />
                    ) : (
                      <div className="w-10 h-10 rounded-md bg-gray-300 flex items-center justify-center border font-bold text-gray-500">?</div>
                    )}
                    <h3 className="font-bold text-sm text-gray-800 line-clamp-1">{group.title}</h3>
                  </div>
                  
                  {/* Threads inside this listing */}
                  <div className="flex flex-col bg-white">
                    {group.threads.map((thread: any, idx: number) => {
                      const isActive = listingId === String(thread.listing_id) && receiverId === String(thread.other_user_id);
                      return (
                        <div
                          key={idx}
                          onClick={() => router.push(`/messages?listing_id=${thread.listing_id}&receiver_id=${thread.other_user_id}`)}
                          className={`p-4 border-b last:border-b-0 cursor-pointer transition flex justify-between ${isActive ? 'bg-blue-50 border-l-4 border-blue-600' : 'hover:bg-gray-50 border-l-4 border-transparent'}`}
                        >
                          <div className="flex-1">
                            <h4 className="font-semibold text-gray-900 text-sm">Chat with {thread.other_user_name}</h4>
                            <p className="text-gray-500 text-xs mt-1 line-clamp-1">{thread.last_message}</p>
                          </div>
                          <div className="text-xs text-gray-400 whitespace-nowrap ml-2">
                            {new Date(thread.last_message_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* RIGHT PANE: Active Chat */}
        <div className={`w-full md:w-2/3 md:flex-1 flex flex-col bg-gray-50 ${!listingId ? 'hidden md:flex' : 'flex'}`}>
          {!listingId ? (
            <div className="flex-1 flex flex-col w-full h-full items-center justify-center text-gray-400">
              <svg className="w-16 h-16 mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8A9.971 9.971 0 013 19.5L2 22l2.5-1A9.971 9.971 0 0112 4c4.97 0 9 3.582 9 8z" /></svg>
              <p className="text-lg">Select a conversation to start messaging</p>
            </div>
          ) : (
            <div className="flex flex-col h-full overflow-hidden shadow-[inset_10px_0_15px_-10px_rgba(0,0,0,0.05)]">
              {/* Chat Header */}
              <div className="bg-primary px-4 md:px-6 py-4 flex items-center gap-4 text-white shadow z-10">
                <button 
                  onClick={() => router.push('/messages')}
                  className="md:hidden p-2 -ml-2 rounded-full hover:bg-white/10 transition"
                  aria-label="Back to inbox"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
                </button>
                
                {activeThread?.listing_image && (
                  <img src={activeThread.listing_image} alt="Thumb" className="w-10 h-10 rounded-full object-cover border-2 border-white/20 hidden sm:block" />
                )}
                
                <div className="flex-1">
                  <h2 className="text-md md:text-lg font-bold leading-tight">{activeUserName}</h2>
                  <p className="text-xs text-white/80 line-clamp-1">{activePropertyTitle}</p>
                </div>
                
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse"></span>
                  <span className="text-xs font-medium opacity-90 hidden sm:block">Live Chat</span>
                </div>
              </div>

              {/* Messages Area */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
                {messages.length === 0 && !loading && (
                  <div className="text-center text-gray-400 mt-10">
                    <p>No messages yet. Say hello!</p>
                  </div>
                )}

                {messages.map((msg, idx) => {
                  const isMine = msg.sender_id === user?.id;
                  return (
                    <div key={msg.id || idx} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] md:max-w-[70%] rounded-2xl px-4 py-3 shadow-sm ${isMine
                          ? 'bg-primary text-white rounded-br-none'
                          : 'bg-white border text-gray-800 rounded-bl-none'
                        }`}>
                        <p className="leading-relaxed text-sm md:text-base whitespace-pre-wrap">{msg.content}</p>
                        <p className={`text-[10px] mt-1.5 text-right ${isMine ? 'text-white/70' : 'text-gray-400'}`}>
                          {new Date(msg.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Input Area */}
              <form onSubmit={sendMessage} className="p-3 md:p-4 bg-white border-t">
                <div className="flex gap-2">
                  <input
                    aria-label="Type your message"
                    type="text"
                    value={newMessage}
                    onChange={e => setNewMessage(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1 px-4 py-2.5 md:py-3 border rounded-full focus:ring-2 focus:ring-primary focus:border-primary outline-none transition text-sm md:text-base"
                  />
                  <button
                    type="submit"
                    aria-label="Send message"
                    disabled={!newMessage.trim()}
                    className="px-5 md:px-6 py-2.5 md:py-3 bg-primary text-white font-bold rounded-full hover:bg-black transition disabled:opacity-50 shadow-sm"
                  >
                    Send
                  </button>
                </div>
              </form>

            </div>
          )}
        </div>

      </div>
    </ProtectedRoute>
  );
}
