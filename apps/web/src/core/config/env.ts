// ============================================================
// CargoNepal — Environment configuration (spec §47)
// ============================================================
// Reads Vite env vars. All VITE_* values are PUBLIC (safe for browser).
// Service-role / payment secrets are NEVER referenced here — they live
// only in Supabase Edge Functions.
// ============================================================

function req(key: string): string {
  const v = import.meta.env[key] as string | undefined;
  return v ?? "";
}

export const env = {
  supabaseUrl: req("VITE_SUPABASE_URL"),
  supabaseAnonKey: req("VITE_SUPABASE_ANON_KEY"),
  googleMapsApiKey: req("VITE_GOOGLE_MAPS_API_KEY"),
  appEnv: req("VITE_APP_ENV") || "development",
  appName: req("VITE_APP_NAME") || "CargoNepal",
  baseUrl: req("VITE_PLATFORM_BASE_URL") || (typeof window !== "undefined" ? window.location.origin : ""),
  firebase: {
    apiKey: req("VITE_FIREBASE_API_KEY"),
    authDomain: req("VITE_FIREBASE_AUTH_DOMAIN"),
    projectId: req("VITE_FIREBASE_PROJECT_ID"),
    storageBucket: req("VITE_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: req("VITE_FIREBASE_MESSAGING_SENDER_ID"),
    appId: req("VITE_FIREBASE_APP_ID"),
    vapidKey: req("VITE_FIREBASE_VAPID_KEY"),
  },
};

export const isConfigured = {
  supabase: Boolean(env.supabaseUrl && env.supabaseAnonKey),
  maps: Boolean(env.googleMapsApiKey),
  firebase: Boolean(env.firebase.apiKey && env.firebase.projectId),
};

// Nepal-centric map defaults.
export const NEPAL_CENTER = { lat: 27.7172, lng: 85.324 }; // Kathmandu
export const DEFAULT_ZOOM = 13;
export const CURRENCY = "NPR";
