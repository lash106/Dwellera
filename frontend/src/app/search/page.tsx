"use client";

import { useEffect, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import { supabase } from "@/lib/supabase";
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';
import PropertyDetailsModal from "@/components/PropertyDetailsModal";

// 1. REMOVE the L.icon code from here. It cannot be at the top level.

const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(m => m.Marker), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(m => m.Popup), { ssr: false });

export default function SearchPage() {
  const [listings, setListings] = useState([]);
  const [selectedListing, setSelectedListing] = useState<any>(null);
  const [session, setSession] = useState<any>(null);
  const [savedProperties, setSavedProperties] = useState<any[]>([]);
  
  // 2. Add a state for the custom icon
  const [customIcon, setCustomIcon] = useState<any>(null);

  useEffect(() => {
    // 3. Import Leaflet and set the icon ONLY on the client side
    const L = require('leaflet');
    const icon = L.icon({
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
    });
    setCustomIcon(icon);

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchSavedProperties(session.user.id);
    });
  }, []);

  // ... rest of your functions (fetchSavedProperties, fetchListings, etc) ...

  return (
    <ProtectedRoute>
      {/* ... filter sidebar and results ... */}

      {/* 4. Use customIcon in your Marker loop */}
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
        {listings.map((l: any, i) => (
          <Marker 
            key={i} 
            position={[l.location_lat, l.location_lng]} 
            icon={customIcon} // Use the state-based icon
          >
            {/* ... popup content ... */}
          </Marker>
        ))}
      </MapContainer>
    </ProtectedRoute>
  );
}
