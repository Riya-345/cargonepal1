// ============================================================
// CargoNepal — App constants
// ============================================================

import type {
  OrderStatus, ParcelCategory, PaymentProvider, TicketCategory, UserRole,
} from "@/models/types";

export const BRAND = {
  name: "CargoNepal",
  tagline: "Fast. Safe. Parcel First.",
  subheading: "Instant bike courier delivery across Nepal.",
  supportEmail: "support@cargonepal.com",
  supportPhone: "+977-1-5555555",
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: "Pending",
  SEARCHING_RIDER: "Finding rider",
  RIDER_ASSIGNED: "Rider assigned",
  RIDER_ACCEPTED: "Rider accepted",
  RIDER_ON_THE_WAY_TO_PICKUP: "Rider on the way",
  ARRIVED_AT_PICKUP: "Arrived at pickup",
  PARCEL_PICKED_UP: "Parcel picked up",
  ON_THE_WAY_TO_DESTINATION: "On the way",
  ARRIVED_AT_DESTINATION: "Arrived at destination",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  FAILED: "Failed",
  RETURNED: "Returned",
};

export const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  "PENDING", "SEARCHING_RIDER", "RIDER_ASSIGNED", "RIDER_ACCEPTED",
  "RIDER_ON_THE_WAY_TO_PICKUP", "ARRIVED_AT_PICKUP", "PARCEL_PICKED_UP",
  "ON_THE_WAY_TO_DESTINATION", "ARRIVED_AT_DESTINATION",
];

export const TERMINAL_ORDER_STATUSES: OrderStatus[] = ["DELIVERED", "CANCELLED", "FAILED", "RETURNED"];

// Status -> Tailwind color token for badges/indicators.
export const STATUS_TONE: Record<OrderStatus, string> = {
  PENDING: "bg-ink-100 text-ink-700",
  SEARCHING_RIDER: "bg-amber-100 text-amber-800",
  RIDER_ASSIGNED: "bg-brand-100 text-brand-800",
  RIDER_ACCEPTED: "bg-brand-100 text-brand-800",
  RIDER_ON_THE_WAY_TO_PICKUP: "bg-brand-100 text-brand-800",
  ARRIVED_AT_PICKUP: "bg-brand-100 text-brand-800",
  PARCEL_PICKED_UP: "bg-blue-100 text-blue-800",
  ON_THE_WAY_TO_DESTINATION: "bg-blue-100 text-blue-800",
  ARRIVED_AT_DESTINATION: "bg-teal-100 text-teal-800",
  DELIVERED: "bg-green-100 text-green-800",
  CANCELLED: "bg-accent-100 text-accent-800",
  FAILED: "bg-accent-100 text-accent-800",
  RETURNED: "bg-ink-200 text-ink-700",
};

export const PARCEL_CATEGORIES: { value: ParcelCategory; label: string; icon: string }[] = [
  { value: "document", label: "Document", icon: "📄" },
  { value: "food", label: "Food", icon: "🍔" },
  { value: "clothing", label: "Clothing", icon: "👕" },
  { value: "electronics", label: "Electronics", icon: "📱" },
  { value: "medicine", label: "Medicine", icon: "💊" },
  { value: "small_package", label: "Small package", icon: "📦" },
  { value: "fragile", label: "Fragile", icon: "🍾" },
  { value: "other", label: "Other", icon: "🎁" },
];

export const PAYMENT_METHODS: { value: PaymentProvider; label: string; description: string }[] = [
  { value: "khalti", label: "Khalti", description: "Pay with Khalti wallet" },
  { value: "esewa", label: "eSewa", description: "Pay with eSewa wallet" },
  { value: "fonepay", label: "Fonepay", description: "Pay via Fonepay QR" },
  { value: "cod", label: "Cash on Delivery", description: "Pay the rider on delivery" },
];

export const CANCELLATION_REASONS = [
  { code: "changed_mind", label: "Changed my mind" },
  { code: "wrong_address", label: "Wrong address" },
  { code: "rider_too_long", label: "Rider taking too long" },
  { code: "duplicate", label: "Duplicate order" },
  { code: "other", label: "Other" },
];

export const TICKET_CATEGORIES: { value: TicketCategory; label: string }[] = [
  { value: "delivery_issue", label: "Delivery issue" },
  { value: "payment_issue", label: "Payment issue" },
  { value: "rider_issue", label: "Rider issue" },
  { value: "refund_request", label: "Refund request" },
  { value: "other", label: "Other" },
];

export const SERVICE_CITIES = ["Kathmandu", "Lalitpur", "Bhaktapur", "Pokhara", "Biratnagar"];

export const ROLE_HOME: Record<UserRole, string> = {
  customer: "/customer",
  rider: "/rider",
  admin: "/admin",
  super_admin: "/admin",
};

export const WEIGHT_PRESETS = [0.5, 1, 2, 5, 10];
export const MAX_UPLOAD_MB = 5;
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
