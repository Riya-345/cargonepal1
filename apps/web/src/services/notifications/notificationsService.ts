// ============================================================
// CargoNepal — Notifications service (spec §29)
// ============================================================
// Firebase Cloud Messaging (web). Requests permission, registers the
// service worker, obtains a device token, and stores it on the user
// row so Edge Functions can push. Degrades gracefully when Firebase
// is not configured or permission is denied (spec §39, §59).
// ============================================================

import { initializeApp, type FirebaseApp } from "firebase/app";
import { getMessaging, getToken, onMessage, type Messaging } from "firebase/messaging";
import { supabase } from "@/services/supabaseClient";
import { env, isConfigured } from "@/core/config/env";

let app: FirebaseApp | null = null;
let messaging: Messaging | null = null;

function ensureMessaging(): Messaging | null {
  if (!isConfigured.firebase) return null;
  try {
    if (!app) app = initializeApp(env.firebase);
    if (!messaging) messaging = getMessaging(app);
    return messaging;
  } catch (e) {
    console.warn("Firebase init failed:", e);
    return null;
  }
}

/** Request permission + register token for the current user. */
export async function registerForPush(userId: string): Promise<{ ok: boolean; message?: string }> {
  const m = ensureMessaging();
  if (!m) return { ok: false, message: "Push notifications are not configured (missing Firebase env vars)." };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, message: "Notification permission denied." };

  try {
    // Register the SW that handles background messages.
    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    const token = await getToken(m, { vapidKey: env.firebase.vapidKey, serviceWorkerRegistration: registration });
    if (!token) return { ok: false, message: "Could not obtain a push token." };
    await saveToken(userId, token);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

async function saveToken(userId: string, token: string) {
  const { data } = await supabase.from("users").select("push_tokens").eq("id", userId).single();
  const tokens: string[] = Array.from(new Set([...((data?.push_tokens as string[]) ?? []), token]));
  await supabase.from("users").update({ push_tokens: tokens }).eq("id", userId);
}

export async function unregisterPush(userId: string, token: string) {
  const { data } = await supabase.from("users").select("push_tokens").eq("id", userId).single();
  const tokens = ((data?.push_tokens as string[]) ?? []).filter((t) => t !== token);
  await supabase.from("users").update({ push_tokens: tokens }).eq("id", userId);
}

/** Foreground message handler (spec §29 in-app). */
export function onForegroundMessage(handler: (n: { title: string; body: string; data: Record<string, unknown> }) => void): () => void {
  const m = ensureMessaging();
  if (!m) return () => {};
  return onMessage(m, (payload) => {
    handler({
      title: payload.notification?.title ?? "CargoNepal",
      body: payload.notification?.body ?? "",
      data: (payload.data as Record<string, unknown>) ?? {},
    });
  });
}
