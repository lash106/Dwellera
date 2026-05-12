"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function Navbar() {
    const [session, setSession] = useState<any>(null);
    const [notifications, setNotifications] = useState<any[]>([]);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const router = useRouter();

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
        const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => setSession(session));
        return () => authListener.subscription.unsubscribe();
    }, []);

    useEffect(() => {
        if (!session?.user?.id) return;

        const notifChannel = supabase.channel(`user_notifications:${session.user.id}`)
          .on('broadcast', { event: 'new_message' }, async (rawPayload: any) => {
             const message = rawPayload.payload;
             if (!message) return;
             
             let senderName = "A user";
             try {
                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/users/${message.sender_id}`);
                if (res.ok) {
                   const data = await res.json();
                   senderName = data.name || "A user";
                }
             } catch(e) {}

             const newNotif = {
                id: message.id,
                title: `New message from ${senderName}`,
                content: message.content,
                link: `/messages?listing_id=${message.listing_id}&receiver_id=${message.sender_id}`
             };

             setNotifications(prev => [...prev, newNotif]);

             // Auto dismiss after 6 seconds
             setTimeout(() => {
                 setNotifications(prev => prev.filter(n => n.id !== message.id));
             }, 6000);
          })
          .subscribe();

        return () => { supabase.removeChannel(notifChannel); };
    }, [session]);

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        router.push('/');
        router.refresh();
    };

    return (
        <nav className="px-4 md:px-6 py-3 md:py-4 bg-primary text-white shadow-md relative z-50 flex justify-center">
            <div className="flex justify-between items-center w-full max-w-[1500px]">
                <Link href="/" className="text-2xl font-extrabold tracking-tight shrink-0">Dwellera</Link>
                
                {/* Mobile Menu Button */}
                <button 
                    className="md:hidden p-2 text-white hover:bg-white/10 rounded-lg transition"
                    onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                >
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        {isMobileMenuOpen ? (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        ) : (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" />
                        )}
                    </svg>
                </button>

                {/* Desktop Links */}
                <div className="hidden md:flex items-center gap-6 text-sm font-medium">
                    {!session && <Link href="/" className="hover:text-gray-300 transition">Home</Link>}
                    {session && <Link href="/search" className="hover:text-gray-300 transition">Map</Link>}
                    {session && <Link href="/negotiation" className="hover:text-gray-300 transition">Negotiation</Link>}
                    {session && <Link href="/verification-agent" className="hover:text-gray-300 transition">Verify Sellers</Link>}
                    {session && <Link href="/messages" className="hover:text-gray-300 transition">Messages</Link>}
                    {session && <Link href="/settings" className="hover:text-gray-300 transition">Settings</Link>}

                    {session ? (
                        <div className="flex items-center gap-4 ml-2">
                            <button onClick={handleSignOut} className="text-gray-300 hover:text-white transition font-medium">
                                Sign Out
                            </button>
                            <Link href="/dashboard" className="bg-white text-primary px-6 py-2 rounded-full hover:bg-gray-100 transition shadow-sm font-bold">
                                Dashboard
                            </Link>
                        </div>
                    ) : (
                        <Link href="/auth" className="bg-white text-primary px-6 py-2 rounded-full hover:bg-gray-100 transition shadow-sm font-bold ml-2">
                            Sign In / Join
                        </Link>
                    )}
                </div>
            </div>

            {/* Mobile Dropdown Menu */}
            {isMobileMenuOpen && (
                <div className="md:hidden absolute top-full left-0 right-0 bg-primary border-t border-white/10 flex flex-col py-6 px-6 gap-5 shadow-2xl z-[60]">
                    {!session && <Link href="/" onClick={() => setIsMobileMenuOpen(false)} className="text-xl font-medium text-white hover:text-gray-200">Home</Link>}
                    {session && <Link href="/search" onClick={() => setIsMobileMenuOpen(false)} className="text-xl font-medium text-white hover:text-gray-200">Map</Link>}
                    {session && <Link href="/negotiation" onClick={() => setIsMobileMenuOpen(false)} className="text-xl font-medium text-white hover:text-gray-200">Negotiation</Link>}
                    {session && <Link href="/verification-agent" onClick={() => setIsMobileMenuOpen(false)} className="text-xl font-medium text-white hover:text-gray-200">Verify Sellers</Link>}
                    {session && <Link href="/messages" onClick={() => setIsMobileMenuOpen(false)} className="text-xl font-medium text-white hover:text-gray-200">Messages</Link>}
                    {session && <Link href="/settings" onClick={() => setIsMobileMenuOpen(false)} className="text-xl font-medium text-white hover:text-gray-200">Settings</Link>}

                    <div className="h-px bg-white/20 w-full my-3"></div>

                    {session ? (
                        <div className="flex flex-col gap-4">
                            <Link href="/dashboard" onClick={() => setIsMobileMenuOpen(false)} className="bg-white text-primary px-6 py-3.5 rounded-full font-bold text-lg text-center shadow-lg">
                                Dashboard
                            </Link>
                            <button onClick={() => { handleSignOut(); setIsMobileMenuOpen(false); }} className="text-gray-200 hover:text-white font-medium text-lg text-left mt-2 pb-2">
                                Sign Out
                            </button>
                        </div>
                    ) : (
                        <Link href="/auth" onClick={() => setIsMobileMenuOpen(false)} className="bg-white text-primary px-6 py-3.5 rounded-full font-bold text-lg text-center shadow-lg">
                            Sign In / Join
                        </Link>
                    )}
                </div>
            )}

            {/* Global Notifications Toast Container */}
            <div className="fixed bottom-24 right-6 z-[100] flex flex-col gap-3 pointer-events-none">
                {notifications.map(n => (
                    <div key={n.id} className="bg-white border rounded-xl shadow-2xl p-4 w-80 pointer-events-auto transform transition-all duration-300 flex flex-col animate-bounce-short">
                        <div className="flex justify-between items-start mb-1">
                            <h4 className="font-bold text-gray-900 text-sm text-left">{n.title}</h4>
                            <button onClick={() => setNotifications(prev => prev.filter(x => x.id !== n.id))} className="text-gray-400 hover:text-gray-600">
                                ×
                            </button>
                        </div>
                        <p className="text-gray-600 text-sm line-clamp-2 text-left mb-3">{n.content}</p>
                        <button 
                            onClick={() => {
                                setNotifications(prev => prev.filter(x => x.id !== n.id));
                                router.push(n.link);
                            }}
                            className="bg-primary text-white text-xs font-bold py-2 px-4 rounded-lg w-fit hover:bg-black transition shadow-sm"
                        >
                            Open Chat
                        </button>
                    </div>
                ))}
            </div>
        </nav>
    );
}
