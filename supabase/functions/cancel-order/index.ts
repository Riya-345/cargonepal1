// ============================================================
// CargoNepal — Edge Function: cancel-order (spec §41, §35)
// POST /functions/v1/cancel-order   (POST /orders/:id/cancel)
// ============================================================
// Cancels an order per configurable rules. Computes any cancellation
// fee based on how far the order has progressed and the free-cancel
// window from the pricing rule. Records the reason + timestamp,
// releases the rider, and refunds eligible prepaid amounts.
// ============================================================

import { adminClient, requireUser, readJson, json, handler, HttpError } from "../_shared/http.ts";
import { sendNotification } from "../_shared/notify.ts";

const CANCELLABLE = ["PENDING","SEARCHING_RIDER","RIDER_ASSIGNED","RIDER_ACCEPTED","RIDER_ON_THE_WAY_TO_PICKUP"];

interface Body { order_id: string; reason: string; reason_code?: string }

export default handler(async (req: Request): Promise<Response> => {
  const user = await requireUser(req);
  const body = await readJson<Body>(req);
  if (!body.order_id || !body.reason) throw new HttpError("order_id and reason are required");

  const admin = adminClient();
  const { data: order, error } = await admin.from("orders").select("*").eq("id", body.order_id).single();
  if (error || !order) throw new HttpError("Order not found", 404);

  const isAdmin = user.role === "admin" || user.role === "super_admin";
  const isCustomer = user.role === "customer" && order.customer_id === user.id;
  const isRider = user.role === "rider" && order.rider_id === user.id;
  if (!isAdmin && !isCustomer && !isRider) throw new HttpError("Forbidden", 403);

  // Customers may only cancel pre-pickup (spec §41). Admin/rider may cancel further along.
  if (isCustomer && !CANCELLABLE.includes(order.status)) {
    throw new HttpError(`Cannot cancel an order in status ${order.status}. Contact support.`, 422);
  }
  if (["DELIVERED","CANCELLED","FAILED","RETURNED"].includes(order.status)) {
    throw new HttpError(`Order is already ${order.status}`, 409);
  }

  // ---- Cancellation fee (configurable) ------------------------------
  let fee = 0;
  const { data: rule } = await admin.from("pricing_rules").select("cancellation_free_minutes, cancellation_fee").eq("is_active", true).order("created_at").limit(1).maybeSingle();
  if (rule && isCustomer) {
    const minutesSince = (Date.now() - new Date(order.created_at).getTime()) / 60000;
    // Fee applies if beyond free window AND a rider was already engaged.
    const riderEngaged = ["RIDER_ACCEPTED","RIDER_ON_THE_WAY_TO_PICKUP"].includes(order.status);
    fee = minutesSince > rule.cancellation_free_minutes && riderEngaged ? Number(rule.cancellation_fee) : 0;
  }

  // ---- Refund eligible prepaid amount -------------------------------
  let refund = 0;
  if (order.is_paid && order.payment_status === "successful") {
    refund = Math.max(0, Number(order.total_amount) - fee);
  }

  await admin.from("orders").update({ status: "CANCELLED", cancelled_at: new Date().toISOString() }).eq("id", order.id);
  await admin.from("order_cancellations").insert({
    order_id: order.id, cancelled_by: user.id, cancelled_by_role: user.role,
    reason: body.reason, reason_code: body.reason_code ?? null,
    cancellation_fee: fee, refund_amount: refund,
  });

  if (order.rider_id) {
    await admin.from("rider_profiles").update({ availability: "online", active_order_id: null, active_order_count: 0 }).eq("id", order.rider_id);
    await admin.from("rider_dispatches").update({ status: "cancelled" }).eq("order_id", order.id).eq("status", "sent");
    await sendNotification(admin, {
      user_id: order.rider_id, audience: "rider", order_id: order.id,
      title: "Order cancelled", body: `Order ${order.order_code} was cancelled by the ${isCustomer ? "customer" : "team"}.`,
      data: { screen: "deliveries" },
    });
  }

  if (refund > 0) {
    await admin.from("payments").update({ status: "refunded", refunded_amount: refund }).eq("order_id", order.id).eq("status", "successful");
    if (isAdmin) {
      await admin.rpc("write_audit", { p_admin_id: user.id, p_action: "refund_processed", p_target_type: "order", p_target_id: order.id, p_metadata: { refund } });
    }
  }
  if (isAdmin && !refund) {
    await admin.rpc("write_audit", { p_admin_id: user.id, p_action: "order_cancelled", p_target_type: "order", p_target_id: order.id, p_metadata: { reason: body.reason, fee } });
  }

  await sendNotification(admin, {
    user_id: order.customer_id, audience: "customer", order_id: order.id,
    title: "Order cancelled", body: refund > 0 ? `Order ${order.order_code} cancelled. NPR ${refund} will be refunded.` : `Order ${order.order_code} was cancelled.`,
    data: { screen: "orders" },
  });

  return json({ ok: true, order_id: order.id, status: "CANCELLED", cancellation_fee: fee, refund_amount: refund });
});
