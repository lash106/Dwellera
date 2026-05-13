"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useIsAdmin } from "@/lib/admin";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function VerificationAgentPage() {
  const router = useRouter();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const [pending, setPending] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const loadPending = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/verifications/pending`);
      const data = await res.json();
      setPending(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setMessage("Could not load verification queue.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (adminLoading) return;
    if (!isAdmin) {
      router.replace("/dashboard");
      return;
    }
    loadPending();
  }, [adminLoading, isAdmin, router]);

  if (adminLoading || !isAdmin) {
    return (
      <ProtectedRoute>
        <div className="flex h-[60vh] items-center justify-center text-gray-500">
          Checking permissions…
        </div>
      </ProtectedRoute>
    );
  }

  const review = async (userId: string, status: "verified" | "rejected") => {
    try {
      const res = await fetch(`${API_URL}/api/users/${userId}/verification/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          notes: status === "verified" ? "ID approved by review agent." : "ID rejected by review agent.",
        }),
      });
      if (!res.ok) throw new Error("Review failed");
      setMessage(status === "verified" ? "Seller verified." : "Seller rejected.");
      await loadPending();
    } catch (err) {
      console.error(err);
      setMessage("Could not submit review.");
    }
  };

  return (
    <ProtectedRoute>
      <div className="max-w-6xl mx-auto p-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8 pb-6 border-b">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Seller Verification Queue</h1>
            <p className="text-gray-500 mt-1">Review submitted ID captures and approve listing access.</p>
          </div>
          <button
            onClick={loadPending}
            className="px-4 py-2 border rounded-lg font-semibold hover:bg-gray-50 transition w-fit"
          >
            Refresh
          </button>
        </div>

        {message && (
          <div className="mb-6 bg-gray-50 border rounded-lg px-4 py-3 text-sm text-gray-700">
            {message}
          </div>
        )}

        {loading ? (
          <div className="bg-white border rounded-xl p-8 text-center text-gray-500">Loading verification queue...</div>
        ) : pending.length === 0 ? (
          <div className="bg-white border border-dashed rounded-xl p-12 text-center text-gray-500">
            No pending seller verifications.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {pending.map(user => (
              <div key={user.id} className="bg-white border rounded-xl overflow-hidden shadow-sm">
                <div className="p-5 border-b">
                  <h2 className="text-xl font-bold text-gray-900">{user.name}</h2>
                  <p className="text-sm text-gray-500">{user.email}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Submitted {user.verification_submitted_at ? new Date(user.verification_submitted_at).toLocaleString() : "recently"}
                  </p>
                </div>

                {user.id_document_image ? (
                  <img
                    src={user.id_document_image}
                    alt={`${user.name} ID capture`}
                    className="w-full h-72 object-contain bg-gray-100 border-b"
                  />
                ) : (
                  <div className="h-72 bg-gray-100 border-b flex items-center justify-center text-gray-400">
                    No ID capture
                  </div>
                )}

                <div className="p-5 flex gap-3">
                  <button
                    onClick={() => review(user.id, "verified")}
                    className="flex-1 py-2.5 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 transition"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => review(user.id, "rejected")}
                    className="flex-1 py-2.5 bg-red-50 text-red-700 font-bold rounded-lg border border-red-200 hover:bg-red-100 transition"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
