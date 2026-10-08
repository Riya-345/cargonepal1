// ============================================================
// CargoNepal — Supabase client (browser, anon key only)
// ============================================================
// This client is subject to RLS. All privileged operations go through
// Edge Functions invoked via `invoke()` below. The service-role key is
// never imported here (spec §28).
// ============================================================

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env, isConfigured } from "@/core/config/env";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  if (!isConfigured.supabase) {
    // Construct with placeholder values so the app can render setup
    // guidance instead of crashing before env vars are provided.
    client = createClient("https://placeholder.supabase.co", "placeholder-anon-key", {
      auth: { persistSession: true, autoRefreshToken: true },
    });
    return client;
  }
  client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    realtime: { params: { eventsPerSecond: 10 } },
  });
  return client;
}

export const supabase = getSupabase();

/** Invoke a Supabase Edge Function with the current session JWT. */
export async function invoke<T = unknown>(
  name: string,
  options?: { body?: unknown; method?: "GET" | "POST" },
): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, {
    body: options?.body,
    method: options?.method ?? "POST",
  });
  if (error) {
    // Surface the function's own error message when present, else generic.
    const msg = (error as { message?: string }).message ?? "Request failed";
    throw new ApiError(msg, name);
  }
  return data as T;
}

export class ApiError extends Error {
  fn: string;
  constructor(message: string, fn: string) {
    super(message);
    this.fn = fn;
    this.name = "ApiError";
  }
}
