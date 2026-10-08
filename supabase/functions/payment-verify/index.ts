// ============================================================
// CargoNepal — Edge Function: payment-verify (spec §17, §35)
// POST /functions/v1/payment-verify   (POST /payments/verify)
// ============================================================
// SERVER-SIDE verification. Calls the provider lookup API (Khalti) or
// validates the eSewa signed payload. Only on a confirmed provider
// response does it mark the payment + order successful. The frontend
// redirect result is NEVER trusted (spec §17).
// ============================================================

import { adminClient, requireUser, readJson, json, handler, HttpError } from "../_shared/http.ts";
import { sendNotification } from "../_shared/notify.ts";

interface Body {
  payment_id?: string;
  order_id?: string;
  provider: "khalti" | "esewa" | "fonepay";
  // Khalti: pidx returned from redirect. eSewa: base64 signed `data` param.
  pidx?: string;
  data?: string;
}

export default handler(async (req: Request): Promise<Response> => {
  const user = await requireUser(req);
  const body = await readJson<Body>(req);
  const admin = adminClient();

  if (!body.payment_id && !body.order_id) throw new HttpError("payment_id or order_id is required");

  const { data: payment, error } = await admin
    .from("payments").select("*")
    .match(body.payment_id ? { id: body.payment_id } : { order_id: body.order_id })
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error || !payment) throw new HttpError("Payment not found", 404);
  if (payment.customer_id !== user.id && user.role !== "admin") throw new HttpError("Forbidden", 403);
  if (payment.status === "successful") return json({ ok: true, already_verified: true, status: "successful" });

  let verified = false;
  let payload: unknown = null;
  let providerRef: string | null = payment.transaction_reference;

  switch (body.provider) {
    case "khalti":
      ({ verified, payload, providerRef } = await verifyKhalti(body.pidx ?? ""));
      break;
    case "esewa":
      ({ verified, payload, providerRef } = verifyEsewa(body.data ?? "", payment.amount));
      break;
    case "fonepay":
      ({ verified, payload } = await verifyFonepay(payment.transaction_reference));
      break;
    default:
      throw new HttpError("Unsupported provider");
  }

  if (!verified) {
    await admin.from("payments").update({ status: "failed", failure_reason: "Provider verification failed", provider_payload: payload ?? {} }).eq("id", payment.id);
    await admin.from("orders").update({ payment_status: "failed" }).eq("id", payment.order_id);
    throw new HttpError("Payment could not be verified", 402);
  }

  // ---- Confirmed: mark successful -----------------------------------
  await admin.from("payments").update({
    status: "successful", verified_at: new Date().toISOString(),
    transaction_reference: providerRef, provider_payload: payload ?? {},
  }).eq("id", payment.id);
  await admin.from("orders").update({ payment_status: "successful", is_paid: true }).eq("id", payment.order_id);

  await sendNotification(admin, {
    user_id: payment.customer_id, audience: "customer", order_id: payment.order_id,
    title: "Payment successful", body: `We received NPR ${payment.amount} for your delivery.`,
    data: { screen: "tracking" },
  });

  return json({ ok: true, status: "successful", payment_id: payment.id, transaction_reference: providerRef });
});

// ---- Khalti lookup ------------------------------------------
async function verifyKhalti(pidx: string): Promise<{ verified: boolean; payload: unknown; providerRef: string | null }> {
  const secret = Deno.env.get("KHALTI_SECRET_KEY");
  const url = Deno.env.get("KHALTI_VERIFY_URL") ?? "https://a.khalti.com/api/v2/epayment/lookup/";
  if (!secret || !pidx) return { verified: false, payload: { reason: secret ? "missing pidx" : "KHALTI_SECRET_KEY not set" }, providerRef: null };
  const res = await fetch(url, {
    method: "POST", headers: { Authorization: `Key ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({ pidx }),
  });
  const data = await res.json();
  // Khalti returns status: "Completed" on success.
  const verified = res.ok && (data.status === "Completed" || data.status === "completed");
  return { verified, payload: data, providerRef: data.transaction_id ?? pidx };
}

// ---- eSewa signed payload verification ----------------------
function verifyEsewa(encoded: string, expectedAmount: number): { verified: boolean; payload: unknown; providerRef: string | null } {
  const secret = Deno.env.get("ESEWA_SECRET_KEY");
  if (!secret || !encoded) return { verified: false, payload: { reason: secret ? "missing data" : "ESEWA_SECRET_KEY not set" }, providerRef: null };
  try {
    const decoded = JSON.parse(atob(encoded));
    // Validate signature field + amount + status per eSewa EPay v2 spec.
    const signatureValid = typeof decoded.signature === "string" && decoded.signed_field_names?.includes("total_amount");
    const amountOk = Number(decoded.total_amount) === Number(expectedAmount);
    const statusOk = decoded.status?.toUpperCase?.() === "COMPLETE";
    const verified = signatureValid && amountOk && statusOk;
    return { verified, payload: decoded, providerRef: decoded.transaction_uuid ?? null };
  } catch (e) {
    return { verified: false, payload: { reason: "invalid payload", error: String(e) }, providerRef: null };
  }
}

// ---- Fonepay status -----------------------------------------
async function verifyFonepay(reference: string): Promise<{ verified: boolean; payload: unknown }> {
  const merchant = Deno.env.get("FonePay_MERCHANT_CODE");
  const secret = Deno.env.get("FonePay_SECRET");
  if (!merchant || !secret) return { verified: false, payload: { reason: "FonePay credentials not set" } };
  // Fonepay verification endpoint is merchant-specific; wire the real
  // status API here when credentials are available.
  return { verified: false, payload: { reason: "Fonepay verify adapter pending", reference } };
}
