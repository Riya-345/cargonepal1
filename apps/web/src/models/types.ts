// ============================================================
// CargoNepal — Domain types (mirrors the PostgreSQL schema)
// ============================================================

export type UserRole = "customer" | "rider" | "admin" | "super_admin";
export type AccountStatus = "active" | "suspended" | "deleted";
export type RiderStatus = "pending" | "approved" | "rejected" | "suspended";
export type RiderAvailability = "offline" | "online" | "busy";
export type VehicleType = "bike" | "scooter" | "e_bike" | "cargo_bike";

export type ParcelCategory =
  | "document" | "food" | "clothing" | "electronics"
  | "medicine" | "small_package" | "fragile" | "other";

export type DeliveryPriority = "standard" | "priority" | "express";

export type OrderStatus =
  | "PENDING" | "SEARCHING_RIDER" | "RIDER_ASSIGNED" | "RIDER_ACCEPTED"
  | "RIDER_ON_THE_WAY_TO_PICKUP" | "ARRIVED_AT_PICKUP" | "PARCEL_PICKED_UP"
  | "ON_THE_WAY_TO_DESTINATION" | "ARRIVED_AT_DESTINATION" | "DELIVERED"
  | "CANCELLED" | "FAILED" | "RETURNED";

export type PaymentProvider = "khalti" | "esewa" | "fonepay" | "card" | "cod";
export type PaymentStatus = "pending" | "initiated" | "successful" | "failed" | "refunded";
export type CodStatus = "pending" | "collected" | "settled";
export type DispatchStatus = "sent" | "accepted" | "rejected" | "expired" | "cancelled";
export type TicketStatus = "open" | "in_progress" | "resolved" | "closed";
export type TicketCategory = "delivery_issue" | "payment_issue" | "rider_issue" | "refund_request" | "other";

export interface User {
  id: string;
  role: UserRole;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  status: AccountStatus;
  created_at: string;
}

export interface CustomerProfile {
  id: string;
  is_business: boolean;
  business_name: string | null;
  total_orders: number;
  total_spent: number;
  loyalty_points: number;
  referral_code: string | null;
}

export interface RiderProfile {
  id: string;
  status: RiderStatus;
  availability: RiderAvailability;
  current_lat: number | null;
  current_lng: number | null;
  heading: number | null;
  speed: number | null;
  location_updated_at: string | null;
  primary_city: string | null;
  active_order_id: string | null;
  active_order_count: number;
  rating_avg: number;
  rating_count: number;
  total_deliveries: number;
  cod_balance: number;
  wallet_balance: number;
}

export interface Vehicle {
  id: string;
  rider_id: string;
  vehicle_type: VehicleType;
  make_model: string | null;
  license_plate: string;
  color: string | null;
  year: number | null;
  photo_url: string | null;
  is_verified: boolean;
}

export interface RiderDocument {
  id: string;
  rider_id: string;
  doc_type: string;
  doc_number: string | null;
  file_url: string;
  status: RiderStatus;
  expiry_date: string | null;
}

export interface Address {
  id: string;
  user_id: string;
  label: string;
  contact_name: string | null;
  contact_phone: string | null;
  address_line1: string | null;
  city: string | null;
  lat: number;
  lng: number;
  is_default: boolean;
}

export interface Order {
  id: string;
  order_code: string | null;
  customer_id: string;
  rider_id: string | null;
  status: OrderStatus;
  priority: DeliveryPriority;
  pickup_lat: number;
  pickup_lng: number;
  pickup_address: string;
  pickup_city: string | null;
  pickup_contact_name: string | null;
  pickup_contact_phone: string | null;
  dropoff_lat: number;
  dropoff_lng: number;
  dropoff_address: string;
  receiver_name: string;
  receiver_phone: string;
  parcel_category: ParcelCategory;
  parcel_description: string | null;
  weight_kg: number;
  quantity: number;
  is_fragile: boolean;
  declared_value: number;
  special_instructions: string | null;
  distance_km: number | null;
  pickup_eta_minutes: number | null;
  delivery_eta_minutes: number | null;
  total_amount: number;
  cod_amount: number;
  cod_fee: number;
  discount_amount: number;
  platform_commission: number;
  rider_earning: number;
  payment_method: PaymentProvider;
  is_cod: boolean;
  payment_status: PaymentStatus;
  is_paid: boolean;
  qr_token: string | null;
  requires_otp: boolean;
  picked_up_at: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderTrackingPoint {
  id: string;
  order_id: string;
  rider_id: string | null;
  lat: number;
  lng: number;
  heading: number | null;
  speed: number | null;
  recorded_at: string;
}

export interface OrderStatusHistory {
  id: string;
  order_id: string;
  status: OrderStatus;
  lat: number | null;
  lng: number | null;
  updated_by: string | null;
  note: string | null;
  created_at: string;
}

export interface RiderDispatch {
  id: string;
  order_id: string;
  rider_id: string;
  status: DispatchStatus;
  distance_km: number | null;
  offered_earning: number | null;
  sent_at: string;
  expires_at: string;
}

export interface Payment {
  id: string;
  order_id: string;
  customer_id: string;
  amount: number;
  provider: PaymentProvider;
  status: PaymentStatus;
  transaction_reference: string | null;
  created_at: string;
}

export interface CodTransaction {
  id: string;
  order_id: string;
  rider_id: string;
  customer_id: string;
  amount: number;
  status: CodStatus;
  collected_at: string | null;
  settled_at: string | null;
}

export interface RiderEarning {
  id: string;
  rider_id: string;
  order_id: string;
  gross_fare: number;
  platform_commission: number;
  net_earning: number;
  cod_collected: number;
  earned_at: string;
}

export interface Notification {
  id: string;
  user_id: string | null;
  audience: "customer" | "rider" | "admin";
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  order_id: string | null;
  is_read: boolean;
  created_at: string;
}

export interface PromoCode {
  id: string;
  code: string;
  description: string | null;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  min_order_amount: number;
  max_discount: number | null;
  usage_limit: number | null;
  per_user_limit: number;
  used_count: number;
  is_active: boolean;
  expires_at: string | null;
}

export interface PricingRule {
  id: string;
  service_area_id: string | null;
  name: string;
  is_active: boolean;
  base_fare: number;
  per_km_rate: number;
  per_kg_rate: number;
  minimum_fare: number;
  cod_fee: number;
  cod_percent: number;
  waiting_fee_per_min: number;
  free_waiting_minutes: number;
  priority_fee: number;
  express_fee: number;
  fragile_fee: number;
  peak_multiplier: number;
  peak_hours: { start: string; end: string }[];
  platform_commission_percent: number;
  min_distance_km: number;
  max_distance_km: number;
  rider_matching_radius_km: number;
  cancellation_free_minutes: number;
  cancellation_fee: number;
}

export interface ServiceArea {
  id: string;
  city: string;
  district: string | null;
  province: string | null;
  zone: "standard" | "metro" | "remote";
  is_active: boolean;
  center_lat: number | null;
  center_lng: number | null;
  radius_km: number;
  pricing_multiplier: number;
}

export interface SupportTicket {
  id: string;
  ticket_no: string | null;
  user_id: string;
  order_id: string | null;
  category: TicketCategory;
  subject: string;
  message: string;
  status: TicketStatus;
  priority: string;
  assigned_to: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  admin_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface FareBreakdown {
  base_fare: number;
  distance_fee: number;
  weight_fee: number;
  service_fees: number;
  cod_fee: number;
  waiting_fee: number;
  peak_surcharge: number;
  priority_fee: number;
  fragile_fee: number;
  subtotal: number;
  discount_amount: number;
  total_amount: number;
  platform_commission: number;
  rider_earning: number;
  within_service_limits: boolean;
}

export interface GeoPoint {
  lat: number;
  lng: number;
}
