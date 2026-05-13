"use client";

import { useEffect, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null);
  const [appUser, setAppUser] = useState<any>(null);
  const [sellerListings, setSellerListings] = useState<any[]>([]);
  const router = useRouter();

  useEffect(() => {
    const fetchUserAndListings = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);

      if (user?.user_metadata?.role === "seller") {
        try {
          const userRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/users/${user.id}`);
          if (userRes.ok) {
            setAppUser(await userRes.json());
          }
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/listings?seller_id=${user.id}`);
          const data = await res.json();
          setSellerListings(data);
        } catch (err) {
          console.error("Failed to fetch seller listings", err);
        }
      } else {
        router.push("/search");
      }
    };
    fetchUserAndListings();
  }, [router]);

  const toggleListingStatus = async (listingId: number, currentStatus: string) => {
    const newStatus = currentStatus === 'Available' ? 'Sold' : 'Available';
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/listings/${listingId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        setSellerListings((prev: any) => prev.map((l: any) => l.id === listingId ? { ...l, status: newStatus } : l));
      }
    } catch (err) {
      console.error(err);
      alert("Failed to update status");
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  const isSeller = user?.user_metadata?.role === "seller";
  const verificationStatus = appUser?.verification_status || "pending";
  const canCreateListings = verificationStatus === "verified";

  return (
    <ProtectedRoute>
      <div className="max-w-6xl mx-auto p-8">
        <div className="flex justify-between items-center mb-8 pb-6 border-b">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-gray-500 mt-1">Logged in as: <span className="font-medium">{user?.email}</span></p>
          </div>
          <button
            onClick={handleSignOut}
            className="px-4 py-2 border border-red-200 text-red-600 rounded-md hover:bg-red-50 transition font-medium text-sm"
          >
            Sign Out
          </button>
        </div>

        {isSeller ? (
          <div>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-2xl font-bold">Your Listings</h2>
                <p className="text-sm text-gray-500 mt-1">Verification: <span className="font-semibold capitalize">{verificationStatus.replaceAll('_', ' ')}</span></p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => router.push('/messages')}
                  className="px-5 py-2.5 bg-white border border-gray-300 text-gray-800 font-medium rounded-lg hover:bg-gray-50 shadow-sm transition flex items-center gap-2"
                >
                  <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
                  My Inbox
                </button>
                <button
                  onClick={() => canCreateListings ? router.push('/create-listing') : alert('Seller ID verification must be approved before creating listings.')}
                  className={`px-5 py-2.5 font-medium rounded-lg shadow transition ${canCreateListings ? 'bg-primary text-white hover:bg-gray-800' : 'bg-gray-200 text-gray-500 cursor-not-allowed'}`}
                >
                  + Create New Listing
                </button>
              </div>
            </div>

            {!canCreateListings && (
              <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-5 text-amber-900">
                <h3 className="font-bold">Seller verification required</h3>
                <p className="text-sm mt-1">
                  Your account can receive messages, but listing creation is locked until an agent approves your submitted ID.
                  Pending verifications expire after 48 hours.
                </p>
                {appUser?.verification_notes && <p className="text-sm mt-2 font-medium">{appUser.verification_notes}</p>}
              </div>
            )}

            {sellerListings.length === 0 ? (
              <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-12 text-center text-gray-500">
                <p className="mb-2">You haven't created any property listings yet.</p>
                <p className="text-sm">Click the button above to add your first property to the marketplace.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {sellerListings.map((listing: any) => (
                  <div key={listing.id} className="border rounded-xl overflow-hidden shadow-sm bg-white">
                    {listing.image_urls && listing.image_urls.length > 0 && <img src={listing.image_urls[0]} alt={listing.title} className="w-full h-48 object-cover" />}
                    <div className="p-4">
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-bold text-lg line-clamp-1 flex-1 pr-2">{listing.title}</h3>
                        <span className={`text-xs font-bold px-2 py-1 rounded shrink-0 ${listing.status === 'Sold' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                          {listing.status || 'Available'}
                        </span>
                      </div>
                      <p className="text-primary font-bold mb-3">${listing.price.toLocaleString()}</p>
                      
                      <button 
                        onClick={() => toggleListingStatus(listing.id, listing.status || 'Available')}
                        className={`w-full py-2 rounded font-semibold text-sm transition ${listing.status === 'Sold' ? 'bg-gray-100 text-gray-800 hover:bg-gray-200' : 'bg-red-50 text-red-600 hover:bg-red-100'}`}
                      >
                        Mark as {listing.status === 'Sold' ? 'Available' : 'Sold'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-48">
            <p className="text-gray-500 font-medium">Redirecting to Marketplace...</p>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
