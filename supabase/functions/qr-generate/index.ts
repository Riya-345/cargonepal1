// ============================================================
// CargoNepal — Edge Function: qr-generate (spec §14, §35)
// POST /functions/v1/qr-generate   (POST /qr/generate)
// ============================================================
// Returns the QR payload for an order. The QR encodes ONLY the
// order_id and an opaque token — no customer PII (spec §14). The
// customer app renders this as a scannable code; the rider verifies
// it server-side via qr-verify.
// ============================================================

import { adminClient, requireUser, readJson, json, handler, HttpError } from "../_shared/http.ts";

interface Body { order_id: string }

export default handler(async (req: Request): Promise<Response> => {
  const user = await requireUser(req);
  const body = await readJson<Body>(req);
  if (!body.order_id) throw new HttpError("order_id is required");

  const admin = adminClient();
  const { data: order, error } = await admin
    .from("orders").select("id, order_code, qr_token, customer_id, rider_id")
    .eq("id", body.order_id).single();
  if (error || !order) throw new HttpError("Order not found", 404);

  const isAdmin = user.role === "admin" || user.role === "super_admin";
  if (!isAdmin && order.customer_id !== user.id && order.rider_id !== user.id) {
    throw new HttpError("Forbidden", 403);
  }

  // Canonical, minimal payload. Deliberately excludes names, phones,
  // addresses, and amounts (spec §14: no sensitive info in QR).
  const payload = JSON.stringify({ v: 1, oid: order.id, t: order.qr_token, c: order.order_code });
  return json({
    order_id: order.id,
    order_code: order.order_code,
    qr_token: order.qr_token,
    qr_payload: payload,
    // The web/mobile client renders this string as a QR image locally.
    render_hint: "Encode qr_payload as a QR code (e.g. qrcode library).",
  });
});
