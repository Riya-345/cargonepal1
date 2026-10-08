// ============================================================
// CargoNepal — MapView (shared map component, spec §34)
// ============================================================
// Wraps @vis.gl/react-google-maps. Renders pickup/drop markers, a
// route polyline, and a live rider marker. When the Maps key is
// absent it renders a clear setup placeholder instead of crashing
// (spec §39, §59) — the rest of the app stays functional.
// ============================================================

import { memo, useMemo } from "react";
import { APIProvider, Map as GMap, Marker, Polyline, useMap } from "@vis.gl/react-google-maps";
import { env, isConfigured, NEPAL_CENTER, DEFAULT_ZOOM } from "@/core/config/env";
import type { GeoPoint } from "@/models/types";

export interface MapMarker {
  point: GeoPoint;
  type: "pickup" | "dropoff" | "rider" | "generic";
  label?: string;
}

interface MapViewProps {
  center?: GeoPoint;
  zoom?: number;
  markers?: MapMarker[];
  route?: GeoPoint[];
  onMapClick?: (p: GeoPoint) => void;
  draggableMarker?: { point: GeoPoint; onDragEnd: (p: GeoPoint) => void } | null;
  className?: string;
  fitMarkers?: boolean;
}

const COLORS: Record<MapMarker["type"], string> = {
  pickup: "#1f42eb",
  dropoff: "#f83232",
  rider: "#0f9d58",
  generic: "#637491",
};

function MapContent({ center, zoom, markers = [], route = [], onMapClick, draggableMarker, fitMarkers }: Omit<MapViewProps, "className">) {
  const map = useMap();

  useMemo(() => {
    if (!map || !fitMarkers || markers.length < 2) return;
    const bounds = new window.google.maps.LatLngBounds();
    markers.forEach((m) => bounds.extend(m.point));
    route.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, 80);
  }, [map, fitMarkers, markers, route]);

  return (
    <>
      {markers.map((m, i) => (
        <Marker
          key={`${m.type}-${i}`}
          position={m.point}
          title={m.label}
          icon={{
            path: m.type === "rider" ? window.google.maps.SymbolPath.CIRCLE : window.google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
            scale: m.type === "rider" ? 8 : 6,
            fillColor: COLORS[m.type],
            fillOpacity: 1,
            strokeColor: "#fff",
            strokeWeight: 2,
            anchor: new window.google.maps.Point(0, m.type === "rider" ? 0 : 6),
          }}
        />
      ))}
      {draggableMarker && (
        <Marker
          position={draggableMarker.point}
          draggable
          onDragEnd={(e) => {
            const latLng = (e as unknown as { latLng: { lat: () => number; lng: () => number } }).latLng;
            draggableMarker.onDragEnd({ lat: latLng.lat(), lng: latLng.lng() });
          }}
        />
      )}
      {route.length >= 2 && (
        <Polyline
          path={route}
          options={{ strokeColor: "#1f42eb", strokeOpacity: 0.9, strokeWeight: 5, geodesic: true }}
        />
      )}
      {onMapClick && <ClickCatcher onClick={onMapClick} />}
    </>
  );
}

function ClickCatcher({ onClick }: { onClick: (p: GeoPoint) => void }) {
  const map = useMap();
  useMemo(() => {
    if (!map) return;
    const listener = map.addListener("click", (e: { latLng: { lat: () => number; lng: () => number } }) => {
      onClick({ lat: e.latLng.lat(), lng: e.latLng.lng() });
    });
    return () => listener.remove();
  }, [map, onClick]);
  return null;
}

function MapPlaceholder({ className }: { className?: string }) {
  return (
    <div className={`flex flex-col items-center justify-center bg-ink-100 text-center p-6 ${className ?? ""}`}>
      <div className="text-4xl mb-3">🗺️</div>
      <p className="font-semibold text-ink-700">Map unavailable</p>
      <p className="text-sm text-ink-500 mt-1 max-w-xs">
        Set <code className="bg-white px-1 rounded">VITE_GOOGLE_MAPS_API_KEY</code> to enable live maps.
        Coordinates can still be entered manually.
      </p>
    </div>
  );
}

export const MapView = memo(function MapView(props: MapViewProps) {
  if (!isConfigured.maps) {
    return <MapPlaceholder className={props.className ?? "h-full w-full"} />;
  }
  return (
    <div className={props.className ?? "h-full w-full"}>
      <APIProvider apiKey={env.googleMapsApiKey}>
        <GMap
          defaultCenter={props.center ?? NEPAL_CENTER}
          defaultZoom={props.zoom ?? DEFAULT_ZOOM}
          gestureHandling="greedy"
          disableDefaultUI={false}
          mapId="cargonepal-map"
        >
          <MapContent {...props} />
        </GMap>
      </APIProvider>
    </div>
  );
});
