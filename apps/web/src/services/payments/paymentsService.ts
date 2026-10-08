// ============================================================
// CargoNepal — Payments service (spec §17, §35)
// ============================================================

import { supabase, invoke } from "@/services/supabaseClient";
import type { Payment } from "@/models/types";

export interface InitiateResponse {
  payment_id: string;
  transaction_reference: string;
  provider: string;
  amount: number;
  checkout: {
    configured: boolean;
    message?: string;
    test_mode?: boolean;
    payment_url?: string;   // Khalti
    gateway?: string;       // eSewa / Fonepay
    merchant_code?: string;
    transaction_uuid?: string;
    amount?: number;
    product_code?: string;
    [k: string]: unknown;
  };
}

/** Start a digital payment. Returns provider checkout params. */
export async function initiatePayment(orderId: string, provider: "khalti" | "esewa" | "fonepay" | "card"): Promise<InitiateResponse> {
  return invoke<InitiateResponse>("payment-initiate", { body: { order_id: orderId, provider } });
}

/** Server-side verify (spec §17 — never trust the frontend). */
export async function verifyPayment(params: {
  payment_id?: string; order_id?: string; provider: "khalti" | "esewa" | "fonepay"; pidx?: string; data?: string;
}): Promise<{ ok: boolean; status: string; transaction_reference?: string }> {
  return invoke("payment-verify", { body: params });
}

export async function fetchPaymentsForOrder(orderId: string): Promise<Payment[]> {
  const { data, error } = await supabase.from("payments").select("*").eq("order_id", orderId).order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as Payment[]) ?? [];
}

export async function fetchCustomerPayments(limit = 50): Promise<Payment[]> {
  const { data, error } = await supabase.from("payments").select("*").order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data as Payment[]) ?? [];
}
