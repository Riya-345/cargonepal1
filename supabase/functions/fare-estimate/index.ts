// ============================================================
// CargoNepal — Edge Function: fare-estimate (spec §7, §42)
// POST /functions/v1/fare-estimate
// ============================================================
// Returns a full fare breakdown WITHOUT creating an order, so the
// customer sees the price on the Fare Estimate screen (spec §16).
// Uses the same authoritative pricing engine as create-order.
// ============================================================

import { adminClient, requireUser, readJson, json, handler, HttpError } from "../_shared/http.ts";
import { calculateFare, PricingRule } from "../_shared/pricing.ts";
import { haversineKm, estimateEtaMinutes } from "../_shared/geo.ts";

interface Body {
  pickup: { lat: number; lng: number; city?: string };
  dropoff: { lat: number; lng: number };
  weight_kg?: number;
  is_cod?: boolean;
  cod_amount?: number;
  is_fragile?: boolean;
  priority?: "standard" | "priority" | "express";
  promo_code?: string;
}

export default handler(async (req: Request): Promise<Response> => {
  await requireUser(req); // any authenticated user can estimate
  const body = await readJson<Body>(req);
  if (!body.pickup || !body.dropoff) throw new HttpError("pickup and dropoff are required");

  const admin = adminClient();
  const rule = await loadRule(admin, body.pickup.city);
  const distance_km = round2(haversineKm(body.pickup.lat, body.pickup.lng, body.dropoff.lat, body.dropoff.lng));

  if (distance_km > rule.max_distance_km) {
    return json({ serviceable: false, distance_km, message: `Beyond maximum serviceable distance (${rule.max_distance_km} km).` }, 200);
  }

  let promo = null as any;
  if (body.promo_code) {
    const { data: p } = await admin.from("promo_codes").select("*").eq("code", body.promo_code.toUpperCase()).eq("is_active", true).maybeSingle();
    if (p && (!p.expires_at || new Date(p.expires_at) > new Date())) {
      promo = {
        discount_type: p.discount_type === "percentage" ? "percentage" : "fixed",
        discount_value: Number(p.discount_value),
        min_order_amount: p.min_order_amount != null ? Number(p.min_order_amount) : undefined,
        max_discount: p.max_discount != null ? Number(p.max_discount) : null,
      };
    }
  }

  const fare = calculateFare(rule as PricingRule, {
    distance_km,
    weight_kg: body.weight_kg ?? 1,
    is_cod: body.is_cod ?? false,
    cod_amount: body.cod_amount ?? 0,
    is_fragile: body.is_fragile ?? false,
    priority: body.priority ?? "standard",
    promo,
  });

  return json({
    serviceable: fare.within_service_limits,
    distance_km,
    pickup_eta_minutes: estimateEtaMinutes(distance_km),
    delivery_eta_minutes: estimateEtaMinutes(distance_km * 2),
    fare,
    promo_applied: !!promo,
  });
});

async function loadRule(admin: ReturnType<typeof adminClient>, city?: string): Promise<any> {
  let rule: any = null;
  if (city) {
    const { data: area } = await admin.from("service_areas").select("id").ilike("city", city).eq("is_active", true).maybeSingle();
    if (area) {
      const { data } = await admin.from("pricing_rules").select("*").eq("service_area_id", area.id).eq("is_active", true).maybeSingle();
      rule = data;
    }
  }
  if (!rule) {
    const { data } = await admin.from("pricing_rules").select("*").eq("is_active", true).is("service_area_id", null).order("created_at").limit(1).maybeSingle();
    rule = data;
  }
  if (!rule) throw new HttpError("No active pricing rule configured", 500);
  return rule;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
