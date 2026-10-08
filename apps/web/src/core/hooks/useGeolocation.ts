// ============================================================
// CargoNepal — Geolocation hook (spec §40)
// ============================================================
// Requests location only when needed and surfaces clear states for
// denied / unavailable / disabled so the UI can guide the user.
// ============================================================

import { useCallback, useState } from "react";
import { NEPAL_CENTER } from "@/core/config/env";

export type GeoStatus = "idle" | "locating" | "granted" | "denied" | "unavailable" | "error";

export interface GeoState {
  status: GeoStatus;
  position: { lat: number; lng: number } | null;
  accuracy: number | null;
  error: string | null;
}

export function useGeolocation() {
  const [state, setState] = useState<GeoState>({ status: "idle", position: null, accuracy: null, error: null });

  const request = useCallback((fallbackToKathmandu = true): Promise<{ lat: number; lng: number } | null> => {
    return new Promise((resolve) => {
      if (!("geolocation" in navigator)) {
        setState({ status: "unavailable", position: null, accuracy: null, error: "Geolocation is not supported by this browser." });
        resolve(fallbackToKathmandu ? NEPAL_CENTER : null);
        return;
      }
      setState((s) => ({ ...s, status: "locating", error: null }));
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setState({ status: "granted", position: p, accuracy: pos.coords.accuracy, error: null });
          resolve(p);
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            setState({ status: "denied", position: null, accuracy: null, error: "Location permission denied. Enable it in your browser settings to auto-fill your pickup point." });
          } else if (err.code === err.POSITION_UNAVAILABLE) {
            setState({ status: "unavailable", position: null, accuracy: null, error: "Location unavailable. Check your device GPS and try again." });
          } else {
            setState({ status: "error", position: null, accuracy: null, error: "Could not get your location. Please try again." });
          }
          resolve(fallbackToKathmandu ? NEPAL_CENTER : null);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
      );
    });
  }, []);

  // Continuous watch (rider during active delivery — spec §12/§40).
  const watchId = useCallback(() => {
    let id: number | null = null;
    const start = (onChange: (p: GeolocationPosition) => void) => {
      if (!("geolocation" in navigator)) return;
      id = navigator.geolocation.watchPosition(onChange, () => {}, { enableHighAccuracy: true, maximumAge: 3000 });
    };
    const stop = () => { if (id != null) navigator.geolocation.clearWatch(id); };
    return { start, stop };
  }, []);

  return { ...state, request, watch: watchId() };
}

/** One-shot position getter for the location sender hook. */
export function makePositionGetter(): () => Promise<GeolocationPosition | null> {
  return () => new Promise((resolve) => {
    if (!("geolocation" in navigator)) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { enableHighAccuracy: true, maximumAge: 4000, timeout: 9000 });
  });
}
