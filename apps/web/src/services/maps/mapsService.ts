// ============================================================
// CargoNepal — Maps service (spec §2, §34, §42)
// ============================================================
// Thin wrappers over Google Maps JS SDK services (Directions,
// Geocoder, Distance Matrix). Keys come from env; no key is ever
// hardcoded (spec §34). All calls degrade gracefully when the key
// is missing so the UI still renders (spec §59).
// ============================================================

import type { GeoPoint } from "@/models/types";

/* global google */

export interface RouteInfo {
  distanceKm: number;
  durationMin: number;
  path: GeoPoint[];
}

/** Reverse-geocode a lat/lng to a human address. */
export async function reverseGeocode(point: GeoPoint): Promise<string> {
  if (!hasGoogle()) return `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
  const geocoder = new google.maps.Geocoder();
  try {
    const res = await geocoder.geocode({ location: point });
    return res.results[0]?.formatted_address ?? `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
  } catch {
    return `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
  }
}

/** Forward-geocode a place query (biased to Nepal). */
export async function geocodeSearch(query: string): Promise<{ point: GeoPoint; address: string }[]> {
  if (!hasGoogle()) return [];
  const geocoder = new google.maps.Geocoder();
  try {
    const res = await geocoder.geocode({
      address: query,
      region: "np",
      bounds: new google.maps.LatLngBounds({ lat: 26.3, lng: 80.0 }, { lat: 30.5, lng: 88.2 }),
    });
    return res.results.slice(0, 6).map((r) => ({
      point: { lat: r.geometry.location.lat(), lng: r.geometry.location.lng() },
      address: r.formatted_address,
    }));
  } catch {
    return [];
  }
}

/** Driving route between two points (spec §34, §42). */
export async function getRoute(origin: GeoPoint, destination: GeoPoint): Promise<RouteInfo | null> {
  if (!hasGoogle()) return null;
  const service = new google.maps.DirectionsService();
  try {
    const result = await service.route({
      origin, destination,
      travelMode: google.maps.TravelMode.DRIVING,
      unitSystem: google.maps.UnitSystem.METRIC,
    });
    const leg = result.routes[0]?.legs[0];
    if (!leg) return null;
    const path = leg.steps.flatMap((s) => s.path.map((p) => ({ lat: p.lat(), lng: p.lng() })));
    return {
      distanceKm: leg.distance?.value ? leg.distance.value / 1000 : 0,
      durationMin: leg.duration?.value ? Math.round(leg.duration.value / 60) : 0,
      path,
    };
  } catch {
    return null;
  }
}

export function hasGoogle(): boolean {
  return typeof google !== "undefined" && Boolean(google?.maps);
}
