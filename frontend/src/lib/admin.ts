"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "")
  .split(",")
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

export function useIsAdmin() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const evaluate = (email: string | undefined) => {
      const normalized = email?.toLowerCase();
      setIsAdmin(!!normalized && ADMIN_EMAILS.includes(normalized));
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      evaluate(session?.user?.email);
      setLoading(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      evaluate(session?.user?.email);
    });

    return () => authListener.subscription.unsubscribe();
  }, []);

  return { isAdmin, loading };
}
