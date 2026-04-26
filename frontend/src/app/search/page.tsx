"use client";

import { useEffect, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import { supabase } from "@/lib/supabase";
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';
import PropertyDetailsModal from "@/components/PropertyDetailsModal";

// Dynamically import Leaflet components to prevent SSR (Server Side Rendering) errors
const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(m => m.Marker), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(m => m.Popup), { ssr: false });

export default function SearchPage() {
  const [listings, setListings] = useState([]);
  const [selectedListing, setSelectedListing] = useState(null);
  const [session, setSession] = useState(null);
  const [savedProperties, setSavedProperties] = useState([]);
  const [customIcon, setCustomIcon] = useState(null);

  const [filters, setFilters] = useState({
    search: '',
    min_price: '',
    max_price: '',
    min_bedrooms: '',
    property_type: 'All'
  });
  
  const [mapCenter, setMapCenter] = useState([37.7749, -122.4194]);
  const [mapSearchQuery, setMapSearchQuery] = useState("");
  const [isSearchingMap, setIsSearchingMap] = useState(false);

  useEffect(() => {
    // 1. Initialize Leaflet ONLY in the browser
    const L = require('leaflet');
    const leafIcon = L.icon({
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
    });
    setCustomIcon(leafIcon);

    // 2. Auth Session check
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchSavedProperties(session.user.id);
    });

    // 3. Initial Listings fetch
    fetchListings();
  }, []);

  const fetchSavedProperties = async (userId) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/inbox?user_id=${userId}`);
      const data = await res.json();
      setSavedProperties(data);
    } catch (err) { console.error(err); }
  };

  const fetchListings = async () => {
    try {
      const params = new URLSearchParams();
      if (filters.search) params.append("search", filters.search);
      if (filters.min_price) params.append("min_price", filters.min_price);
      if (filters.max_price) params.append("max_price", filters.max_price);
      if (filters.min_bedrooms) params.append("min_bedrooms", filters.min_bedrooms);
      if (filters.property_type && filters.property_type !== 'All') params.append("property_type", filters.property_type);

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/listings?${params.toString()}`);
      const data = await res.json();
      setListings(data);
    } catch (err) {
      console.error('Failed to fetch listings:', err);
    }
  };

  const handleMapSearch = async (e) => {
    e.preventDefault();
    if (!mapSearchQuery.trim()) return;
    
    setIsSearchingMap(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(mapSearchQuery)}`);
      const data = await res.json();
      if (data && data.length > 0) {
        setMapCenter([parseFloat(data[0].lat), parseFloat(data[0].lon)]);
      } else {
        alert("Address or city not found.");
      }
    } catch (err) {
      alert("Failed to find location. Please try again.");
    } finally {
      setIsSearchingMap(false);
    }
  };

  const handleOpenChat = (prop) => {
    if (typeof window !== 'undefined') {
        window.location.href = `/messages?listing_id=${prop.listing_id}&receiver_id=${prop.other_user_id}`;
    }
  };

  return (
    <ProtectedRoute>
      <div className="flex flex-col md:flex-row w-full min-h-full md:h-full">
        
        {/* LEFT SIDEBAR: Filters */}
        <div className="w-full md:w-72 bg-white border-r flex flex-col overflow-y-auto z-10 p-5 shadow-sm">
          <h2 className="text-xl font-bold mb-6 mt-4">Filters</h2>
          
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Search Term</label>
              <input 
                type="text" placeholder="e.g. Pool, Modern"
                className="w-full px-3 py-2 border rounded-md text-sm"
                value={filters.search} onChange={e => setFilters({...filters, search: e.target.value})}
              />
            </div>

            <div className="flex items-center gap-2">
                <input type="number" placeholder="Min" className="w-full px-3 py-2 border rounded-md text-sm" value={filters.min_price} onChange={e => setFilters({...filters, min_price: e.target.value})} />
                <input type="number" placeholder="Max" className="w-full px-3 py-2 border rounded-md text-sm" value={filters.max_price} onChange={e => setFilters({...filters, max_price: e.target.value})} />
            </div>

            <button 
              onClick={fetchListings}
              className="w-full py-2.5 bg-black text-white font-medium rounded-md hover:bg-gray-800 transition"
            >
              Apply Filters
            </button>
          </div>
        </div>

        {/* MIDDLE: Scrollable Results */}
        <div className="w-full md:w-96 bg-gray-50 flex flex-col h-[500px] md:h-full border-r z-10 relative">
          <div className="p-4 border-b bg-white flex-shrink-0">
            {session && savedProperties.length > 0 && (
              <div className="mb-4 bg-gray-50 border rounded-lg p-3 shadow-sm">
                <h3 className="text-xs font-bold text-gray-800 mb-2 uppercase tracking-wide">Saved / Messaged</h3>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {savedProperties.map(prop => (
                    <div 
                      key={prop.listing_id} 
                      onClick={() => handleOpenChat(prop)}
                      className="shrink-0 w-36 bg-white p-2.5 rounded border shadow-sm cursor-pointer"
                    >
                      <p className="text-xs font-bold line-clamp-1">{prop.listing_title}</p>
                      <p className="text-[10px] text-blue-600 mt-1 font-semibold">Open Chat</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <h1 className="text-xl font-bold text-gray-900">Marketplace</h1>
            <p className="text-sm text-gray-500">{listings.length} properties found</p>
          </div>
          
          <div className="overflow-y-auto p-4 flex-1">
            <div className="space-y-4">
              {listings.map((l, i) => (
                <div 
                  key={i} 
                  onClick={() => setSelectedListing(l)}
                  className="p-4 border rounded-xl shadow-sm bg-white cursor-pointer"
                >
                  <img src={l.image_urls?.[0]} className="w-full h-48 object-cover rounded-lg mb-3" />
                  <h3 className="font-semibold text-lg text-gray-800">{l.title}</h3>
                  <p className="text-blue-600 font-extrabold text-xl">${l.price?.toLocaleString()}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT: Full Height Map */}
        <div className="w-full h-[50vh] md:w-auto md:flex-1 md:h-full relative z-[5]">
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] w-full max-w-sm px-4">
             <form onSubmit={handleMapSearch} className="flex shadow-xl rounded-xl bg-white p-1.5 border">
               <input 
                 value={mapSearchQuery} 
                 onChange={e => setMapSearchQuery(e.target.value)} 
                 placeholder="Search city..."
                 className="flex-1 px-4 py-2 focus:outline-none"
               />
               <button type="submit" className="px-5 py-2 bg-black text-white rounded-lg">Go</button>
             </form>
          </div>

          <MapContainer 
            key={`${mapCenter[0]}-${mapCenter[1]}`}
            center={mapCenter} 
            zoom={12} 
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
            {customIcon && listings.map((l, i) => (
              <Marker key={i} position={[l.location_lat, l.location_lng]} icon={customIcon}>
                <Popup>
                  <div className="p-1 w-[200px]">
                    <h3 className="font-bold">{l.title}</h3>
                    <p>${l.price?.toLocaleString()}</p>
                    <button onClick={() => setSelectedListing(l)} className="w-full mt-2 text-xs py-1 bg-gray-100 rounded">View</button>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      </div>

      {selectedListing && (
        <PropertyDetailsModal listing={selectedListing} onClose={() => setSelectedListing(null)} />
      )}
    </ProtectedRoute>
  );
}
