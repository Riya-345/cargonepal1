// ============================================================
// CargoNepal — Edge Function: nearby-riders (spec §8, §21, §35)
// GET /functions/v1/nearby-riders?lat=..&lng=..&radius_km=5   (GET /riders/nearby)
// ============================================================
// Returns online/approved riders near a point, ranked by distance.
// Used by the admin live map and rider-matching preview. Restricted
// to admins and to riders viewing peers (limited fields).
// ============================================================

import { adminClient, requireUser, requireRole, json, handler, HttpError } from "../_shared/http.ts";
import { haversineKm } from "../_shared/geo.ts";

export default handler(async (req: Request): Promise<Response> => {
  const user = await requireUser(req);
  requireRole(user, ["admin", "super_admin", "rider"]);
  const url = new URL(req.url);
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  const radius = Math.min(50, Number(url.searchParams.get("radius_km") ?? 5));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new HttpError("lat and lng are required");

  const admin = adminClient();
  const { data: riders, error } = await admin
    .from("rider_profiles")
    .select("id, availability, current_lat, current_lng, rating_avg, active_order_count, primary_city, location_updated_at")
    .eq("status", "approved")
    .in("availability", ["online", "busy"])
    .not("current_lat", "is", null);
  if (error) throw new HttpError("Failed to load riders", 500);

  const isAdmin = user.role === "admin" || user.role === "super_admin";
  const now = Date.now();

  const result = (riders ?? [])
    .map((r) => ({
      rider_id: r.id,
      lat: r.current_lat, lng: r.current_lng,
      distance_km: round2(haversineKm(lat, lng, r.current_lat!, r.current_lng!)),
      availability: r.availability,
      rating_avg: Number(r.rating_avg ?? 0),
      active_order_count: r.active_order_count ?? 0,
      primary_city: r.primary_city,
      // Stale if no ping in > 2 minutes.
      is_stale: r.location_updated_at ? now - new Date(r.location_updated_at).getTime() > 120000 : true,
    }))
    .filter((r) => r.distance_km <= radius)
    .sort((a, b) => a.distance_km - b.distance_km);

  // Admins additionally get contact + live order for the map popup (spec §21).
  if (isAdmin && result.length) {
    const ids = result.map((r) => r.rider_id);
    const { data: users } = await admin.from("users").select("id, full_name, phone, avatar_url").in("id", ids);
    const { data: activeOrders } = await admin.from("rider_profiles").select("id, active_order_id").in("id", ids);
    const uMap = Object.fromEntries((users ?? []).map((u) => [u.id, u]));
    const oMap = Object.fromEntries((activeOrders ?? []).map((o) => [o.id, o.active_order_id]));
    return json({ count: result.length, riders: result.map((r) => ({ ...r, name: uMap[r.rider_id]?.full_name, phone: uMap[r.rider_id]?.phone, avatar_url: uMap[r.rider_id]?.avatar_url, active_order_id: oMap[r.rider_id] ?? null })) });
  }

  return json({ count: result.length, riders: result });
});

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
