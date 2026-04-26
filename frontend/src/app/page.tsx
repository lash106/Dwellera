"use client";

import { useEffect, useState } from "react";
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
    // 1. Initialize Leaflet ONLY in the browser to fix "window is not defined"
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
      if (!res.ok) return;
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

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await fetch(`${apiUrl}/api/listings?${params.toString()}`);
      if (!res.ok) throw new Error("Backend unreachable");
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
      }
    } catch (err) {
      console.error("Map search failed", err);
    } finally {
      setIsSearchingMap(false);
    }
  };

  return (
    <div className="flex flex-col md:flex-row w-full h-screen overflow-hidden">
      
      {/* LEFT SIDEBAR: Filters */}
      <div className="w-full md:w-72 bg-white border-r flex flex-col overflow-y-auto p-5 shadow-sm">
        <h2 className="text-xl font-bold mb-6">Filters</h2>
        <div className="space-y-4">
          <input 
            type="text" placeholder="Search..."
            className="w-full px-3 py-2 border rounded-md"
            value={filters.search} onChange={e => setFilters({...filters, search: e.target.value})}
          />
          <div className="flex gap-2">
              <input type="number" placeholder="Min $" className="w-1/2 px-3 py-2 border rounded-md" value={filters.min_price} onChange={e => setFilters({...filters, min_price: e.target.value})} />
              <input type="number" placeholder="Max $" className="w-1/2 px-3 py-2 border rounded-md" value={filters.max_price} onChange={e => setFilters({...filters, max_price: e.target.value})} />
          </div>
          <button 
            onClick={fetchListings}
            className="w-full py-2.5 bg-black text-white font-medium rounded-md hover:bg-gray-800 transition"
          >
            Apply Filters
          </button>
        </div>
      </div>

      {/* MIDDLE: List Results */}
      <div className="w-full md:w-96 bg-gray-50 flex flex-col border-r relative overflow-y-auto">
        <div className="p-4 border-b bg-white sticky top-0 z-10">
          <h1 className="text-xl font-bold">Marketplace</h1>
          <p className="text-sm text-gray-500">{listings.length} properties found</p>
        </div>
        
        <div className="p-4 space-y-4">
          {listings.map((l, i) => (
            <div 
              key={i} 
              onClick={() => setSelectedListing(l)}
              className="p-4 border rounded-xl shadow-sm bg-white cursor-pointer hover:border-black transition"
            >
              <img src={l.image_urls?.[0]} className="w-full h-40 object-cover rounded-lg mb-2" alt={l.title} />
              <h3 className="font-semibold text-md line-clamp-1">{l.title}</h3>
              <p className="text-blue-600 font-bold">${l.price?.toLocaleString()}</p>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT: Map */}
      <div className="flex-1 relative">
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] w-full max-w-xs px-4">
           <form onSubmit={handleMapSearch} className="flex shadow-xl rounded-xl bg-white p-1 border">
             <input 
               value={mapSearchQuery} 
               onChange={e => setMapSearchQuery(e.target.value)} 
               placeholder="Search city..."
               className="flex-1 px-4 py-2 focus:outline-none text-sm"
             />
             <button type="submit" className="px-4 py-2 bg-black text-white rounded-lg text-sm">Go</button>
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
                <div className="p-1">
                  <h3 className="font-bold text-sm">{l.title}</h3>
                  <p className="text-blue-600">${l.price?.toLocaleString()}</p>
                  <button onClick={() => setSelectedListing(l)} className="mt-2 w-full text-xs py-1 bg-gray-200 rounded">Details</button>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {selectedListing && (
        <PropertyDetailsModal listing={selectedListing} onClose={() => setSelectedListing(null)} />
      )}
    </div>
  );
}
