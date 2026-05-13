"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";

type Pt = [number, number];

interface Props {
  active: boolean;
  polygon: Pt[] | null;
  onComplete: (pts: Pt[]) => void;
}

export default function DrawLayer({ active, polygon, onComplete }: Props) {
  const map = useMap();
  const polygonRef = useRef<L.Polygon | null>(null);

  // Show completed polygon overlay
  useEffect(() => {
    polygonRef.current?.remove();
    polygonRef.current = null;
    if (polygon && polygon.length >= 3) {
      polygonRef.current = L.polygon(polygon, {
        color: "#111",
        weight: 2,
        dashArray: "6 4",
        fillColor: "#111",
        fillOpacity: 0.08,
      }).addTo(map);
    }
    return () => { polygonRef.current?.remove(); };
  }, [polygon, map]);

  // Freehand lasso — mousedown+drag+mouseup on the map
  useEffect(() => {
    if (!active) {
      map.dragging.enable();
      map.getContainer().style.cursor = "";
      return;
    }

    map.dragging.disable();
    map.getContainer().style.cursor = "crosshair";

    let drawing = false;
    const pts: Pt[] = [];
    let preview: L.Polyline | null = null;

    const onMouseDown = (e: L.LeafletMouseEvent) => {
      drawing = true;
      pts.length = 0;
      pts.push([e.latlng.lat, e.latlng.lng]);
    };

    const onMouseMove = (e: L.LeafletMouseEvent) => {
      if (!drawing) return;
      pts.push([e.latlng.lat, e.latlng.lng]);
      if (pts.length % 4 !== 0) return; // throttle redraws
      preview?.remove();
      preview = L.polyline(pts, { color: "#111", weight: 2, dashArray: "5 4", opacity: 0.85 }).addTo(map);
    };

    const finish = () => {
      if (!drawing) return;
      drawing = false;
      preview?.remove();
      preview = null;
      if (pts.length >= 3) onComplete([...pts]);
    };

    map.on("mousedown", onMouseDown);
    map.on("mousemove", onMouseMove);
    map.on("mouseup", finish);
    document.addEventListener("mouseup", finish); // catch release outside map

    return () => {
      map.off("mousedown", onMouseDown);
      map.off("mousemove", onMouseMove);
      map.off("mouseup", finish);
      document.removeEventListener("mouseup", finish);
      map.dragging.enable();
      map.getContainer().style.cursor = "";
      preview?.remove();
    };
  }, [active, map, onComplete]);

  return null;
}
