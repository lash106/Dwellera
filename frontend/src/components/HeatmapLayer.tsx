"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";

function priceToHue(price: number, min: number, max: number): number {
  const ratio = max === min ? 0.5 : (price - min) / (max - min);
  return Math.round(120 * (1 - ratio)); // 120=green → 60=yellow → 0=red
}

// Three concentric rings per listing simulate a radial gradient
const RINGS = [
  { radiusM: 400, opacity: 0.07 },
  { radiusM: 220, opacity: 0.14 },
  { radiusM: 100, opacity: 0.30 },
];

export default function HeatmapLayer({ listings, visible }: { listings: any[]; visible: boolean }) {
  const map = useMap();
  const layersRef = useRef<L.Circle[]>([]);

  useEffect(() => {
    layersRef.current.forEach(c => c.remove());
    layersRef.current = [];

    if (!visible || listings.length === 0) return;

    const prices = listings.map((l: any) => l.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);

    listings.forEach((listing: any) => {
      const hue = priceToHue(listing.price, min, max);
      RINGS.forEach(({ radiusM, opacity }) => {
        const circle = L.circle([listing.location_lat, listing.location_lng], {
          radius: radiusM,
          weight: 0,
          fillColor: `hsl(${hue}, 85%, 50%)`,
          fillOpacity: opacity,
          color: "transparent",
        }).addTo(map);
        layersRef.current.push(circle);
      });
    });

    return () => {
      layersRef.current.forEach(c => c.remove());
      layersRef.current = [];
    };
  }, [listings, visible, map]);

  return null;
}
