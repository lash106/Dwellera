"use client";

import { useCallback, useEffect, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import { supabase } from "@/lib/supabase";
import dynamic from 'next/dynamic';
import type { DivIcon } from 'leaflet';

const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(m => m.Marker), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(m => m.Popup), { ssr: false });
const HeatmapLayer = dynamic(() => import('@/components/HeatmapLayer'), { ssr: false });
const DrawLayer = dynamic(() => import('@/components/DrawLayer'), { ssr: false });
import 'leaflet/dist/leaflet.css';
import PropertyDetailsModal from "@/components/PropertyDetailsModal";

function formatPrice(price: number): string {
  if (price >= 1_000_000) return `$${(price / 1_000_000).toFixed(1)}M`;
  if (price >= 1_000) return `$${Math.round(price / 1_000)}K`;
  return `$${price}`;
}

function createPriceIcon(price: number): DivIcon {
  const leaflet = require('leaflet') as typeof import('leaflet');
  const label = formatPrice(price);
  return leaflet.divIcon({
    className: "",
    html: `
      <div style="
        background: white;
        color: #111;
        font-size: 12px;
        font-weight: 800;
        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
        padding: 5px 10px;
        border-radius: 20px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.22);
        white-space: nowrap;
        position: relative;
        display: inline-block;
        border: 1.5px solid rgba(0,0,0,0.08);
        letter-spacing: -0.2px;
      ">
        ${label}
        <div style="
          position: absolute;
          bottom: -6px;
          left: 50%;
          transform: translateX(-50%);
          width: 0; height: 0;
          border-left: 5px solid transparent;
          border-right: 5px solid transparent;
          border-top: 6px solid white;
        "></div>
      </div>`,
    iconAnchor: [28, 36],
    popupAnchor: [0, -38],
  });
}



export default function SearchPage() {
  const [listings, setListings] = useState([]);
  const [selectedListing, setSelectedListing] = useState<any>(null);
  const [session, setSession] = useState<any>(null);
  const [savedProperties, setSavedProperties] = useState<any[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchSavedProperties(session.user.id);
    });
  }, []);

  const fetchSavedProperties = async (userId: string) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/inbox?user_id=${userId}`);
      const data = await res.json();
      setSavedProperties(data);
    } catch (err) { console.error(err); }
  };

  const [filters, setFilters] = useState({
    search: '',
    min_price: '',
    max_price: '',
    min_bedrooms: '',
    property_type: 'All'
  });
  const [naturalQuery, setNaturalQuery] = useState("");
  const [naturalSearchSummary, setNaturalSearchSummary] = useState("");
  const [naturalSearchLoading, setNaturalSearchLoading] = useState(false);
  
  const [mapCenter, setMapCenter] = useState<[number, number]>([37.7749, -122.4194]);
  const [mapSearchQuery, setMapSearchQuery] = useState("");
  const [isSearchingMap, setIsSearchingMap] = useState(false);
  const [drawMode, setDrawMode] = useState(false);
  const [drawnPolygon, setDrawnPolygon] = useState<[number, number][] | null>(null);
  const [totalListings, setTotalListings] = useState(0);

  const fetchListingsInPolygon = async (pts: [number, number][]) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/listings/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          polygon: pts,
          search: filters.search || null,
          min_price: filters.min_price ? Number(filters.min_price) : null,
          max_price: filters.max_price ? Number(filters.max_price) : null,
          min_bedrooms: filters.min_bedrooms ? Number(filters.min_bedrooms) : null,
          property_type: filters.property_type !== 'All' ? filters.property_type : null,
        }),
      });
      const data = await res.json();
      setListings(data);
    } catch (err) {
      console.error('Failed to fetch listings in polygon:', err);
    }
  };

  const handleDrawComplete = useCallback((pts: [number, number][]) => {
    setDrawnPolygon(pts);
    setDrawMode(false);
    fetchListingsInPolygon(pts);
  }, [filters]);

  const clearDraw = () => {
    setDrawnPolygon(null);
    setDrawMode(false);
    fetchListings();
  };

  const handleMapSearch = async (e: React.FormEvent) => {
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

  const fetchListings = async () => {
    try {
      const params = new URLSearchParams();
      if (filters.search) params.append("search", filters.search);
      if (filters.min_price) params.append("min_price", filters.min_price);
      if (filters.max_price) params.append("max_price", filters.max_price);
      if (filters.min_bedrooms) params.append("min_bedrooms", filters.min_bedrooms);
      if (filters.property_type && filters.property_type !== 'All') params.append("property_type", filters.property_type);

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/listings?${params.toString()}`);
      const data = await res.json();
      setListings(data);
      setTotalListings(data.length);
    } catch (err) {
      console.error('Failed to fetch listings:', err);
    }
  };

  useEffect(() => {
    fetchListings();
  }, []);

  const runNaturalSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = naturalQuery.trim();
    if (!query) return;

    setNaturalSearchLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/listings/nlp-search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, limit: 50 })
      });
      const result = await res.json();
      const data = Array.isArray(result.listings) ? result.listings : [];
      setListings(data);
      setTotalListings(data.length);
      setNaturalSearchSummary(result.message || "");
      if (data[0]?.location_lat && data[0]?.location_lng) {
        setMapCenter([data[0].location_lat, data[0].location_lng]);
      }
    } catch (err) {
      console.error("Natural language search failed:", err);
      setNaturalSearchSummary("Natural search failed. Make sure the backend is running.");
    } finally {
      setNaturalSearchLoading(false);
    }
  };

  return (
    <ProtectedRoute>
      <div className="flex flex-col md:flex-row w-full min-h-full md:h-full">
        
        {/* LEFT SIDEBAR: Filters (Amazon Style) */}
        <div className="w-full md:w-72 bg-white border-r flex flex-col overflow-y-auto z-10 p-5 shadow-sm">
          <h2 className="text-xl font-bold mb-6 mt-4">Filters</h2>
          
          <div className="space-y-6">
            <form onSubmit={runNaturalSearch} className="bg-gray-50 border rounded-lg p-3">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Natural Search</label>
              <textarea
                value={naturalQuery}
                onChange={e => setNaturalQuery(e.target.value)}
                rows={3}
                placeholder="e.g. best value condos in SOMA under $1.3M"
                className="w-full px-3 py-2 border rounded-md text-sm resize-none"
              />
              <button
                type="submit"
                disabled={!naturalQuery.trim() || naturalSearchLoading}
                className="w-full mt-2 py-2 bg-gray-900 text-white font-medium rounded-md hover:bg-black transition disabled:opacity-50"
              >
                {naturalSearchLoading ? "Searching..." : "Ask Dwellera"}
              </button>
              {naturalSearchSummary && (
                <p className="mt-2 text-xs text-gray-500 leading-relaxed">{naturalSearchSummary}</p>
              )}
            </form>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Search Term</label>
              <input 
                type="text" placeholder="e.g. Pool, Modern"
                className="w-full px-3 py-2 border rounded-md text-sm"
                value={filters.search} onChange={e => setFilters({...filters, search: e.target.value})}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Price Range</label>
              <div className="flex items-center gap-2">
                <input type="number" placeholder="Min" className="w-full px-3 py-2 border rounded-md text-sm" value={filters.min_price} onChange={e => setFilters({...filters, min_price: e.target.value})} />
                <span className="text-gray-400">-</span>
                <input type="number" placeholder="Max" className="w-full px-3 py-2 border rounded-md text-sm" value={filters.max_price} onChange={e => setFilters({...filters, max_price: e.target.value})} />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Property Type</label>
              <select className="w-full px-3 py-2 border rounded-md text-sm" value={filters.property_type} onChange={e => setFilters({...filters, property_type: e.target.value})}>
                <option value="All">Any Property Type</option>
                <option value="House">House</option>
                <option value="Apartment">Apartment</option>
                <option value="Condo">Condo</option>
                <option value="Townhouse">Townhouse</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Minimum Bedrooms</label>
              <select className="w-full px-3 py-2 border rounded-md text-sm" value={filters.min_bedrooms} onChange={e => setFilters({...filters, min_bedrooms: e.target.value})}>
                <option value="">Any</option>
                <option value="1">1+ Beds</option>
                <option value="2">2+ Beds</option>
                <option value="3">3+ Beds</option>
                <option value="4">4+ Beds</option>
              </select>
            </div>

            <button 
              onClick={fetchListings}
              className="w-full py-2.5 bg-primary text-white font-medium rounded-md hover:bg-gray-800 transition"
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
                <h3 className="text-xs font-bold text-gray-800 mb-2 uppercase tracking-wide flex items-center gap-1">
                  <svg className="w-4 h-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
                  Saved / Messaged
                </h3>
                <div className="flex gap-2 overflow-x-auto pb-1 snap-x">
                  {savedProperties.map(prop => (
                    <div 
                      key={prop.listing_id} 
                      onClick={() => window.location.href = `/messages?listing_id=${prop.listing_id}&receiver_id=${prop.other_user_id}`}
                      className="shrink-0 w-36 bg-white p-2.5 rounded hover:border-gray-400 border border-transparent shadow-sm cursor-pointer transition snap-start"
                    >
                      <p className="text-xs font-bold line-clamp-1">{prop.listing_title}</p>
                      <p className="text-[10px] text-primary mt-1 font-semibold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span> Open Chat
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <h1 className="text-xl font-bold text-gray-900">Marketplace</h1>
            <p className="text-sm text-gray-500">
              {listings.length} {drawnPolygon ? `of ${totalListings} ` : ''}properties found
              {drawnPolygon && <span className="ml-2 text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">Area filtered</span>}
            </p>
          </div>
          
          <div className="overflow-y-auto p-4 flex-1">
            <div className="space-y-4">
              {listings.map((l: any, i) => (
                <div
                  key={i}
                  onClick={() => setSelectedListing(l)}
                  className={`p-4 border rounded-xl shadow-sm hover:shadow-md transition cursor-pointer ${l.status === 'Sold' ? 'bg-gray-50 opacity-75' : 'bg-white'}`}
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') setSelectedListing(l); }}
                  aria-label={`View details for ${l.title}`}
                >
                  <div className="relative overflow-hidden rounded-lg mb-3">
                    {l.image_urls && l.image_urls.length > 0 ? (
                      <img src={l.image_urls[0]} alt={l.title} className="w-full h-48 object-cover hover:scale-105 transition duration-500" />
                    ) : (
                      <div className="w-full h-48 bg-gray-100 flex items-center justify-center text-gray-400">No Image</div>
                    )}
                    {l.status === 'Sold' && (
                      <div className="absolute top-2 left-2 bg-red-100 text-red-800 text-xs font-bold px-2 py-1 rounded shadow-sm">
                        SOLD
                      </div>
                    )}
                  </div>
                  <h3 className="font-semibold text-lg text-gray-800 line-clamp-1">{l.title}</h3>
                  <div className="flex gap-3 text-xs text-gray-600 mb-2 mt-1">
                    <span>{l.property_type || 'Property'}</span> • 
                    <span>{l.bedrooms ? `${l.bedrooms} Beds` : '-'}</span> • 
                    <span>{l.bathrooms ? `${l.bathrooms} Baths` : '-'}</span>
                  </div>
                  <p className="text-primary font-extrabold text-xl">${l.price.toLocaleString()}</p>
                </div>
              ))}
              {listings.length === 0 && (
                <div className="text-center p-8 text-gray-500">
                  <p>No properties match your filters.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: Full Height Map */}
        <div className="w-full h-[50vh] md:w-auto md:flex-1 md:h-full relative z-[5] order-first md:order-last border-b md:border-none shadow-sm md:shadow-none">
          
          {/* Lasso Controls */}
          <div className="absolute top-4 right-4 z-[1000] flex flex-col items-end gap-2">
            {!drawnPolygon ? (
              <button
                onClick={() => setDrawMode(m => !m)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm shadow-lg border transition-all ${
                  drawMode
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white/90 backdrop-blur-sm text-gray-700 border-gray-200 hover:border-gray-400'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-7 7M9 9l6 6m0-6L9 15m6-6l-7 7" />
                </svg>
                {drawMode ? 'Drawing…' : 'Lasso Select'}
              </button>
            ) : (
              <button
                onClick={clearDraw}
                className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm shadow-lg border bg-white/90 backdrop-blur-sm text-red-600 border-red-200 hover:border-red-400 transition-all"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Clear Selection
              </button>
            )}
            {drawMode && (
              <div className="bg-gray-900/80 backdrop-blur-sm text-white text-xs font-medium px-3 py-2 rounded-xl shadow-lg text-center leading-snug">
                Hold & drag to draw a selection
              </div>
            )}
          </div>

          {/* Address Search Overlay */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] w-full max-w-sm px-4">
             <form onSubmit={handleMapSearch} className="flex shadow-xl rounded-xl bg-white/90 backdrop-blur-sm p-1.5 border border-gray-200">
               <input
                 value={mapSearchQuery}
                 onChange={e => setMapSearchQuery(e.target.value)}
                 placeholder="Fly map to city, zip, or address..."
                 className="flex-1 px-4 py-2 bg-transparent focus:outline-none text-gray-800 placeholder-gray-500 font-medium"
               />
               <button
                 type="submit"
                 disabled={isSearchingMap}
                 className="px-5 py-2 bg-gray-900 text-white font-bold rounded-lg hover:bg-gray-800 transition disabled:opacity-50"
               >
                  {isSearchingMap ? '...' : 'Go'}
               </button>
             </form>
          </div>



          <MapContainer 
            key={`${mapCenter[0]}-${mapCenter[1]}`}
            center={mapCenter} 
            zoom={12} 
            style={{ height: '100%', width: '100%' }}
            zoomControl={false}
          >
            <TileLayer
              attribution='&copy; <a href="https://carto.com/">CartoDB</a>'
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            />
            <HeatmapLayer listings={listings} visible={true} />
            <DrawLayer active={drawMode} polygon={drawnPolygon} onComplete={handleDrawComplete} />
            {listings.map((l: any, i) => (
              <Marker key={i} position={[l.location_lat, l.location_lng]} icon={createPriceIcon(l.price)}>
                <Popup>
                  <div className="p-1 w-[200px]">
                    {l.image_urls && l.image_urls.length > 0 && (
                      <img src={l.image_urls[0]} alt={`${l.title} thumbnail`} className="w-full h-28 object-cover rounded-md mb-2 shadow" />
                    )}
                    <h3 className="font-bold text-sm line-clamp-1">{l.title}</h3>
                    <p className="text-primary font-bold">${l.price.toLocaleString()}</p>
                    <button 
                      onClick={() => setSelectedListing(l)}
                      className="w-full mt-2 text-xs py-1.5 bg-gray-100 font-semibold rounded hover:bg-gray-200 transition"
                    >
                      View Details
                    </button>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      </div>

      {/* Property Details Modal */}
      {selectedListing && (
        <PropertyDetailsModal 
          listing={selectedListing} 
          onClose={() => setSelectedListing(null)} 
        />
      )}
    </ProtectedRoute>
  );
}
