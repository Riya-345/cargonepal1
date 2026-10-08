// ============================================================
// CargoNepal — Auth service (spec §2, §35)
// ============================================================
// Wraps Supabase Auth: phone OTP, email/password, and Google.
// On signup the role is passed via user metadata so the DB trigger
// provisions the correct profile (customer/rider).
// ============================================================

import { supabase } from "@/services/supabaseClient";
import type { UserRole } from "@/models/types";
import { toE164Nepal } from "@/core/utils";

export interface SignInResult {
  needsOtp: boolean;
  session?: unknown;
  error?: string;
}

/** Send an OTP to a Nepali mobile number (spec §4). */
export async function sendPhoneOtp(phone: string): Promise<SignInResult> {
  const e164 = toE164Nepal(phone);
  const { error } = await supabase.auth.signInWithOtp({
    phone: e164,
    options: { channel: "sms" },
  });
  if (error) return { needsOtp: false, error: mapAuthError(error.message) };
  return { needsOtp: true };
}

/** Verify the SMS OTP token (spec §4). */
export async function verifyPhoneOtp(phone: string, token: string): Promise<SignInResult> {
  const e164 = toE164Nepal(phone);
  const { data, error } = await supabase.auth.verifyOtp({ phone: e164, token, type: "sms" });
  if (error) return { needsOtp: false, error: mapAuthError(error.message) };
  return { needsOtp: false, session: data.session };
}

/** Email + password sign in. */
export async function signInWithEmail(email: string, password: string): Promise<SignInResult> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { needsOtp: false, error: mapAuthError(error.message) };
  return { needsOtp: false, session: data.session };
}

/** Email + password sign up with a role (spec §1). */
export async function signUpWithEmail(params: {
  email: string;
  password: string;
  role: UserRole;
  fullName: string;
  phone?: string;
  city?: string;
}): Promise<SignInResult> {
  const { data, error } = await supabase.auth.signUp({
    email: params.email,
    password: params.password,
    options: {
      data: {
        role: params.role,
        full_name: params.fullName,
        phone: params.phone ?? null,
        city: params.city ?? null,
      },
    },
  });
  if (error) return { needsOtp: false, error: mapAuthError(error.message) };
  return { needsOtp: !data.session, session: data.session };
}

/** Google OAuth (if enabled on the Supabase project). */
export async function signInWithGoogle(): Promise<void> {
  await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/auth/callback`, queryParams: { access_type: "offline", prompt: "consent" } },
  });
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

export async function updateProfile(fields: { full_name?: string; avatar_url?: string; phone?: string }): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { error } = await supabase.from("users").update(fields).eq("id", user.id);
  if (error) throw new Error(error.message);
}

function mapAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login") || m.includes("invalid credentials")) return "Incorrect email or password.";
  if (m.includes("otp") || m.includes("token")) return "Invalid or expired code. Please request a new one.";
  if (m.includes("already registered") || m.includes("already been registered")) return "An account with these details already exists. Try signing in.";
  if (m.includes("rate limit") || m.includes("too many")) return "Too many attempts. Please wait a moment and try again.";
  if (m.includes("phone")) return "That phone number isn't valid or SMS is not enabled for this project.";
  return message;
}
