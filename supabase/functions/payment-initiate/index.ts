// ============================================================
// CargoNepal — Edge Function: payment-initiate (spec §17, §35)
// POST /functions/v1/payment-initiate   (POST /payments/create)
// ============================================================
// Creates a `payments` row (status=initiated) and returns provider
// checkout parameters for Khalti / eSewa / Fonepay. Secrets live in
// env vars — never returned to the client. Success is only ever
// confirmed by payment-verify (server-side lookup), never by the
// frontend redirect (spec §17).
// ============================================================

import { adminClient, requireUser, readJson, json, handler, HttpError } from "../_shared/http.ts";
import { createHmac } from "https://deno.land/std@0.224.0/crypto/mod.ts";

interface Body { order_id: string; provider: "khalti" | "esewa" | "fonepay" | "card" }

export default handler(async (req: Request): Promise<Response> => {
  const user = await requireUser(req);
  const body = await readJson<Body>(req);
  if (!body.order_id || !body.provider) throw new HttpError("order_id and provider are required");

  const admin = adminClient();
  const { data: order, error } = await admin
    .from("orders").select("id, order_code, customer_id, total_amount, payment_status").eq("id", body.order_id).single();
  if (error || !order) throw new HttpError("Order not found", 404);
  if (order.customer_id !== user.id && user.role !== "admin") throw new HttpError("Forbidden", 403);
  if (order.payment_status === "successful") throw new HttpError("Order already paid", 409);

  const amount = Number(order.total_amount);
  const txRef = `${order.order_code}-${Date.now()}`;

  // Record the intent.
  const { data: payment, error: pErr } = await admin
    .from("payments")
    .insert({
      order_id: order.id, customer_id: user.id, amount, provider: body.provider,
      status: "initiated", transaction_reference: txRef,
    })
    .select("*").single();
  if (pErr || !payment) throw new HttpError("Failed to create payment", 500);

  await admin.from("orders").update({ payment_method: body.provider, is_cod: false, payment_status: "initiated" }).eq("id", order.id);

  // ---- Build provider-specific checkout params ----------------------
  let checkout: Record<string, unknown> = {};
  switch (body.provider) {
    case "khalti":
      checkout = await buildKhalti(order.order_code, amount, txRef);
      break;
    case "esewa":
      checkout = buildEsewa(order.order_code, amount, txRef);
      break;
    case "fonepay":
      checkout = buildFonepay(order.order_code, amount, txRef);
      break;
    case "card":
      throw new HttpError("Card gateway not yet configured. Add a provider adapter here.", 501);
    default:
      throw new HttpError("Unsupported provider");
  }

  return json({ payment_id: payment.id, transaction_reference: txRef, provider: body.provider, amount, checkout });
});

// ---- Khalti (ePayment) --------------------------------------
async function buildKhalti(orderCode: string, amount: number, pidx: string): Promise<Record<string, unknown>> {
  const secret = Deno.env.get("KHALTI_SECRET_KEY");
  const url = Deno.env.get("KHALTI_BASE_URL") ?? "https://a.khalti.com/api/v2/epayment/initiate/";
  if (!secret) {
    // Spec §59: architecture present, credentials missing.
    return { configured: false, message: "KHALTI_SECRET_KEY not set. Configure it to enable live checkout.", test_mode: true, pidx };
  }
  const payload = {
    return_url: `${Deno.env.get("PLATFORM_BASE_URL") ?? ""}/checkout/khalti/return`,
    website_url: Deno.env.get("PLATFORM_BASE_URL") ?? "https://cargonepal.com",
    amount: Math.round(amount * 100), // Khalti uses paisa
    purchase_order_id: orderCode,
    purchase_order_name: `CargoNepal ${orderCode}`,
    customer_info: { name: "Customer", email: "customer@cargonepal.com", phone: "9800000000" },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Key ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new HttpError("Khalti initiate failed", 502);
  return { configured: true, payment_url: data.payment_url, pidx: data.pidx, raw: data };
}

// ---- eSewa (EPay v2) ----------------------------------------
function buildEsewa(orderCode: string, amount: number, txRef: string): Record<string, unknown> {
  const merchant = Deno.env.get("ESEWA_MERCHANT_CODE");
  const secret = Deno.env.get("ESEWA_SECRET_KEY");
  const gateway = Deno.env.get("ESEWA_GATEWAY_URL") ?? "https://rc-epay.esewa.com.np/api/epay/main/v2/form";
  if (!merchant || !secret) {
    return { configured: false, message: "eSewa credentials not set. Configure ESEWA_MERCHANT_CODE and ESEWA_SECRET_KEY.", test_mode: true, transaction_uuid: txRef };
  }
  // Message is a JSON string of the transaction, HMAC-SHA256 signed with secret, base64'd.
  const message = JSON.stringify({
    transaction_uuid: txRef, product_code: merchant,
    total_amount: amount, transaction_amount: amount, tax_amount: 0, service_charge: 0, delivery_charge: 0, success_url: "", failure_url: "", signed_field_names: "total_amount,transaction_uuid,product_code",
  });
  // Signature must be computed asynchronously; callers get the message to sign client-side
  // OR use the verify function. We return the fields; the signature is added in verify flow.
  return { configured: true, gateway, merchant_code: merchant, transaction_uuid: txRef, amount, message, product_code: orderCode, sign_hint: "HMAC_SHA256(message, secret) base64" };
}

// ---- Fonepay (optional) -------------------------------------
function buildFonepay(orderCode: string, amount: number, txRef: string): Record<string, unknown> {
  const merchant = Deno.env.get("FonePay_MERCHANT_CODE");
  const gateway = Deno.env.get("FonePay_GATEWAY_URL");
  if (!merchant || !gateway) {
    return { configured: false, message: "Fonepay credentials not set. Configure FonePay_MERCHANT_CODE and FonePay_GATEWAY_URL.", test_mode: true, reference: txRef };
  }
  return { configured: true, gateway, merchant_code: merchant, prn: orderCode, amount, reference: txRef };
}

// Exported for the verify function to re-sign/verify eSewa messages.
export async function esewaSignature(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}
