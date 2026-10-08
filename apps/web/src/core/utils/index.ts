// ============================================================
// CargoNepal — Core utilities
// ============================================================

import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

/** Format a number as Nepali Rupees. */
export function formatNPR(amount: number | string | null | undefined): string {
  const n = typeof amount === "string" ? parseFloat(amount) : (amount ?? 0);
  if (Number.isNaN(n)) return "NPR 0";
  return `NPR ${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/** Format a number of km. */
export function formatKm(km: number | null | undefined): string {
  if (km == null || Number.isNaN(km)) return "—";
  return `${km.toFixed(1)} km`;
}

/** Relative time, e.g. "5m ago". */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/** Format an ISO date to a readable local date/time. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/** Haversine distance in km (client-side estimate for display only). */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Normalize a Nepali phone number to a comparable form. */
export function normalizePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, "");
}

/** Basic Nepali mobile validation (97/98 prefixes, 10 digits). */
export function isValidNepaliMobile(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  const local = digits.startsWith("977") ? digits.slice(3) : digits;
  return /^9\d{9}$/.test(local);
}

export function toE164Nepal(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const local = digits.startsWith("977") ? digits.slice(3) : digits;
  return `+977${local}`;
}

/** Debounce a function. */
export function debounce<T extends (...args: never[]) => void>(fn: T, ms: number): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/** Sleep helper for retries/simulations. */
export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Safe JSON parse. */
export function safeJson<T>(value: unknown, fallback: T): T {
  try {
    if (typeof value === "string") return JSON.parse(value) as T;
    return (value as T) ?? fallback;
  } catch {
    return fallback;
  }
}

/** Clamp a number between min and max. */
export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
