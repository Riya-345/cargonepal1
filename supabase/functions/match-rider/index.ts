// ============================================================
// CargoNepal — Edge Function: match-rider (spec §8)
// POST /functions/v1/match-rider
// ============================================================
// Finds the nearest eligible rider using an expanding radius ladder
// (1km -> 2km -> 5km), sends a dispatch request, notifies the rider,
// and schedules re-dispatch on reject/expire. Invoked with the
// service role (from create-order or a scheduled retry).
// ============================================================

import { adminClient, readJson, json, handler, HttpError } from "../_shared/http.ts";
import { haversineKm } from "../_shared/geo.ts";
import { sendNotification } from "../_shared/notify.ts";

const RADIUS_LADDER_KM = [1, 2, 5];
const DISPATCH_TTL_SECONDS = 30;

interface MatchBody { order_id: string; attempt?: number }

export default handler(async (req: Request): Promise<Response> => {
  const body = await readJson<MatchBody>(req);
  if (!body.order_id) throw new HttpError("order_id is required");
  const attempt = body.attempt ?? 0;

  const admin = adminClient();
  const { data: order, error: oErr } = await admin
    .from("orders")
    .select("id, order_code, status, pickup_lat, pickup_lng, pickup_city, dropoff_city, parcel_category, weight_kg, cod_amount, rider_earning, distance_km")
    .eq("id", body.order_id)
    .single();

  if (oErr || !order) throw new HttpError("Order not found", 404);
  if (!["SEARCHING_RIDER", "PENDING"].includes(order.status)) {
    return json({ skipped: true, reason: `order already ${order.status}` });
  }

  // ---- Expanding radius search (spec §8) ----------------------------
  // Already-dispatched riders for this order are excluded so retries
  // move to the NEXT suitable rider.
  const { data: dispatched } = await admin
    .from("rider_dispatches")
    .select("rider_id")
    .eq("order_id", order.id);
  const excluded = (dispatched ?? []).map((d) => d.rider_id);

  let chosen: { id: string; distance_km: number } | null = null;
  const maxRadius = RADIUS_LADDER_KM[RADIUS_LADDER_KM.length - 1];

  const { data: riders, error: rErr } = await admin
    .from("rider_profiles")
    .select("id, current_lat, current_lng, rating_avg, active_order_count, primary_city")
    .eq("status", "approved")
    .eq("availability", "online")
    .is("active_order_id", null)
    .not("current_lat", "is", null)
    .not("current_lng", "is", null)
    .not("id", "in", excluded.length ? `(${excluded.join(",")})` : "(null)");

  if (rErr) throw new HttpError("Rider query failed", 500);

  const candidates = (riders ?? [])
    .map((r) => ({
      id: r.id,
      distance_km: haversineKm(order.pickup_lat, order.pickup_lng, r.current_lat!, r.current_lng!),
      rating_avg: r.rating_avg ?? 0,
      active_order_count: r.active_order_count ?? 0,
      primary_city: r.primary_city,
    }))
    // Prefer same-city riders, then nearest, then least busy, then rating.
    .sort((a, b) => {
      const aCity = a.primary_city === order.pickup_city ? 0 : 1;
      const bCity = b.primary_city === order.pickup_city ? 0 : 1;
      return (
        aCity - bCity ||
        a.distance_km - b.distance_km ||
        a.active_order_count - b.active_order_count ||
        b.rating_avg - a.rating_avg
      );
    });

  // Walk the ladder: pick the first candidate within the current ring.
  for (const radius of RADIUS_LADDER_KM) {
    const inRing = candidates.find((c) => c.distance_km <= radius);
    if (inRing) { chosen = { id: inRing.id, distance_km: round2(inRing.distance_km) }; break; }
  }
  // If nothing within ladder but someone exists within maxRadius, take nearest.
  if (!chosen) {
    const nearest = candidates.find((c) => c.distance_km <= maxRadius);
    if (nearest) chosen = { id: nearest.id, distance_km: round2(nearest.distance_km) };
  }

  // ---- No rider available -------------------------------------------
  if (!chosen) {
    // Keep the order searching; a scheduled retry / next rider-online event
    // will re-trigger matching. Cap attempts to avoid infinite fan-out.
    if (attempt < 10) {
      void scheduleRetry(admin, order.id, attempt + 1);
    }
    return json({ matched: false, attempt, reason: "no_eligible_rider" });
  }

  // ---- Assign + create dispatch -------------------------------------
  const expires_at = new Date(Date.now() + DISPATCH_TTL_SECONDS * 1000).toISOString();
  const { error: dErr } = await admin.from("rider_dispatches").insert({
    order_id: order.id,
    rider_id: chosen.id,
    status: "sent",
    distance_km: chosen.distance_km,
    offered_earning: order.rider_earning,
    expires_at,
  });
  if (dErr) throw new HttpError("Failed to create dispatch", 500);

  await admin.from("orders").update({ status: "SEARCHING_RIDER", rider_id: chosen.id }).eq("id", order.id);

  // ---- Notify rider (spec §8 "New Delivery Request") ----------------
  await sendNotification(admin, {
    user_id: chosen.id,
    audience: "rider",
    order_id: order.id,
    title: "New Delivery Request",
    body: `${chosen.distance_km} km pickup • ${order.parcel_category} • Earn NPR ${order.rider_earning}${order.cod_amount > 0 ? ` • Collect NPR ${order.cod_amount}` : ""}`,
    data: { order_id: order.id, order_code: order.order_code, screen: "dispatch", expires_at },
  });

  return json({ matched: true, rider_id: chosen.id, distance_km: chosen.distance_km, attempt, expires_at });
});

async function scheduleRetry(admin: ReturnType<typeof adminClient>, orderId: string, attempt: number): Promise<void> {
  // Re-invoke match-rider after a short delay. In production prefer a
  // scheduled queue (pg_cron / Supabase Queues); this keeps the ladder
  // advancing without external infra.
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/match-rider`;
  setTimeout(() => {
    void fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ order_id: orderId, attempt }),
    }).catch((e) => console.error("match retry failed:", e));
  }, 5000);
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
