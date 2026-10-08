// ============================================================
// CargoNepal — Edge Function: qr-verify (spec §14, §35)
// POST /functions/v1/qr-verify   (POST /qr/verify)
// ============================================================
// Rider scans the order QR (contains order_id + opaque token, NO PII).
// Server verifies the token matches the order and that the caller is
// the assigned rider, then advances the lifecycle (pickup/delivery).
// ============================================================

import { adminClient, requireUser, requireRole, readJson, json, handler, HttpError } from "../_shared/http.ts";

interface Body { qr_token: string; event: "pickup" | "delivery" }

export default handler(async (req: Request): Promise<Response> => {
  const user = await requireUser(req);
  requireRole(user, ["rider", "admin"]);
  const body = await readJson<Body>(req);
  if (!body.qr_token || !["pickup", "delivery"].includes(body.event)) {
    throw new HttpError("qr_token and event(pickup|delivery) are required");
  }

  const admin = adminClient();
  const { data: order, error } = await admin
    .from("orders").select("id, order_code, qr_token, rider_id, status, requires_otp")
    .eq("qr_token", body.qr_token).maybeSingle();
  if (error || !order) throw new HttpError("Invalid QR code", 404);
  if (user.role === "rider" && order.rider_id !== user.id) throw new HttpError("This order is not assigned to you", 403);

  // Enforce state preconditions.
  if (body.event === "pickup" && !["ARRIVED_AT_PICKUP", "RIDER_ON_THE_WAY_TO_PICKUP"].includes(order.status)) {
    throw new HttpError(`Cannot verify pickup in status ${order.status}`, 422);
  }
  if (body.event === "delivery" && order.status !== "ARRIVED_AT_DESTINATION") {
    throw new HttpError(`Cannot verify delivery in status ${order.status}`, 422);
  }

  // Record the verification event.
  const next = body.event === "pickup" ? "PARCEL_PICKED_UP" : "ARRIVED_AT_DESTINATION";
  await admin.from("order_status_history").insert({
    order_id: order.id, status: order.status as any, updated_by: user.id,
    note: `QR verified (${body.event})`,
  });

  if (body.event === "pickup") {
    await admin.from("orders").update({ status: "PARCEL_PICKED_UP", picked_up_at: new Date().toISOString() }).eq("id", order.id);
  }

  return json({ ok: true, order_id: order.id, order_code: order.order_code, event: body.event, qr_verified: true, requires_otp: order.requires_otp });
});
