// ============================================================
// CargoNepal — Orders service (client -> Edge Functions + Supabase)
// ============================================================

import { supabase, invoke } from "@/services/supabaseClient";
import type { FareBreakdown, Order, OrderStatusHistory, OrderTrackingPoint } from "@/models/types";

export interface FareEstimateRequest {
  pickup: { lat: number; lng: number; city?: string };
  dropoff: { lat: number; lng: number };
  weight_kg?: number;
  is_cod?: boolean;
  cod_amount?: number;
  is_fragile?: boolean;
  priority?: "standard" | "priority" | "express";
  promo_code?: string;
}

export interface FareEstimateResponse {
  serviceable: boolean;
  distance_km: number;
  pickup_eta_minutes: number;
  delivery_eta_minutes: number;
  fare: FareBreakdown;
  promo_applied: boolean;
  message?: string;
}

export interface CreateOrderRequest {
  pickup: { lat: number; lng: number; address: string; city?: string; contact_name?: string; contact_phone?: string };
  dropoff: { lat: number; lng: number; address: string; city?: string; receiver_name: string; receiver_phone: string };
  parcel: {
    category: string; description?: string; weight_kg?: number; quantity?: number;
    is_fragile?: boolean; declared_value?: number; special_instructions?: string; parcel_image_url?: string;
  };
  priority?: "standard" | "priority" | "express";
  payment_method?: "khalti" | "esewa" | "fonepay" | "card" | "cod";
  cod_amount?: number;
  promo_code?: string;
}

export async function estimateFare(req: FareEstimateRequest): Promise<FareEstimateResponse> {
  return invoke<FareEstimateResponse>("fare-estimate", { body: req });
}

export async function createOrder(req: CreateOrderRequest): Promise<{
  order_id: string; order_code: string; qr_token: string; fare: FareBreakdown;
}> {
  return invoke("create-order", { body: req });
}

export async function fetchOrders(filter: "all" | "active" | "delivered" | "cancelled" = "all"): Promise<Order[]> {
  let q = supabase.from("orders").select("*").order("created_at", { ascending: false }).limit(100);
  if (filter === "active") {
    q = q.in("status", ["PENDING","SEARCHING_RIDER","RIDER_ASSIGNED","RIDER_ACCEPTED","RIDER_ON_THE_WAY_TO_PICKUP","ARRIVED_AT_PICKUP","PARCEL_PICKED_UP","ON_THE_WAY_TO_DESTINATION","ARRIVED_AT_DESTINATION"]);
  } else if (filter === "delivered") {
    q = q.eq("status", "DELIVERED");
  } else if (filter === "cancelled") {
    q = q.in("status", ["CANCELLED","FAILED","RETURNED"]);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data as Order[]) ?? [];
}

export async function fetchOrder(id: string): Promise<Order | null> {
  const { data, error } = await supabase.from("orders").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Order) ?? null;
}

export async function fetchOrderTracking(orderId: string): Promise<OrderTrackingPoint[]> {
  const { data, error } = await supabase.from("order_tracking").select("*")
    .eq("order_id", orderId).order("recorded_at", { ascending: true }).limit(500);
  if (error) throw new Error(error.message);
  return (data as OrderTrackingPoint[]) ?? [];
}

export async function fetchOrderHistory(orderId: string): Promise<OrderStatusHistory[]> {
  const { data, error } = await supabase.from("order_status_history").select("*")
    .eq("order_id", orderId).order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as OrderStatusHistory[]) ?? [];
}

export async function updateOrderStatus(orderId: string, status: string, loc?: { lat: number; lng: number }, note?: string): Promise<void> {
  await invoke("update-order-status", { body: { order_id: orderId, status, lat: loc?.lat, lng: loc?.lng, note } });
}

export async function cancelOrder(orderId: string, reason: string, reasonCode?: string): Promise<void> {
  await invoke("cancel-order", { body: { order_id: orderId, reason, reason_code: reasonCode } });
}

export async function respondToDispatch(orderId: string, action: "accept" | "reject", reason?: string): Promise<void> {
  await invoke("dispatch-response", { body: { order_id: orderId, action, reason } });
}
