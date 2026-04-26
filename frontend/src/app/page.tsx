"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function Home() {
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
  }, []);

  return (
    <div className="relative flex flex-col items-center justify-center min-h-[calc(100vh-68px)] h-full py-20 text-center px-4 md:px-8">
      
      {/* Background Image Setup */}
      <div 
        className="absolute inset-0 z-0"
        style={{
          backgroundImage: 'url("https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=2000&q=80")',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        {/* Dark Overlay for Text Legibility */}
        <div className="absolute inset-0 bg-gray-900/60" />
      </div>

      {/* Floating Content */}
      <div className="relative z-10 flex flex-col items-center animate-in fade-in zoom-in duration-700">
        <h1 className="text-6xl md:text-7xl font-extrabold mb-6 text-white drop-shadow-lg tracking-tight">
          Dwellera
        </h1>
        <p className="text-xl md:text-2xl mb-10 text-gray-200 max-w-2xl drop-shadow-md font-light">
          The premium marketplace for real estate. Explore our visual map to find your dream property.
        </p>
        
        <div className="flex gap-4">
          {session ? (
            <Link href="/dashboard" className="px-8 py-4 bg-primary text-white font-bold rounded-xl shadow-2xl hover:bg-gray-800 hover:scale-105 transition-all text-lg">
              Go to Dashboard
            </Link>
          ) : (
            <Link href="/auth" className="px-8 py-4 bg-primary text-white font-bold rounded-xl shadow-2xl hover:bg-blue-600 hover:scale-105 transition-all text-lg">
              Get Started (Login / Sign Up)
            </Link>
          )}
        </div>
      </div>

    </div>
  );
}
