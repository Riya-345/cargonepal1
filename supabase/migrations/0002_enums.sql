-- ============================================================
-- CargoNepal — Migration 0002: Enums & Domain Types
-- ============================================================

-- User roles (RBAC). A user has exactly one role.
create type user_role as enum ('customer', 'rider', 'admin', 'super_admin');

-- Account lifecycle status shared by profiles.
create type account_status as enum ('active', 'suspended', 'deleted');

-- Rider approval workflow (spec §10).
create type rider_status as enum ('pending', 'approved', 'rejected', 'suspended');

-- Rider real-time availability (spec §11).
create type rider_availability as enum ('offline', 'online', 'busy');

-- Vehicle classes supported by the platform.
create type vehicle_type as enum ('bike', 'scooter', 'e_bike', 'cargo_bike');

-- Parcel categories (spec §6).
create type parcel_category as enum (
  'document', 'food', 'clothing', 'electronics',
  'medicine', 'small_package', 'fragile', 'other'
);

-- Delivery speed tiers.
create type delivery_priority as enum ('standard', 'priority', 'express');

-- Order lifecycle (spec §13).
create type order_status as enum (
  'PENDING',
  'SEARCHING_RIDER',
  'RIDER_ASSIGNED',
  'RIDER_ACCEPTED',
  'RIDER_ON_THE_WAY_TO_PICKUP',
  'ARRIVED_AT_PICKUP',
  'PARCEL_PICKED_UP',
  'ON_THE_WAY_TO_DESTINATION',
  'ARRIVED_AT_DESTINATION',
  'DELIVERED',
  'CANCELLED',
  'FAILED',
  'RETURNED'
);

-- Payment providers (spec §17).
create type payment_provider as enum ('khalti', 'esewa', 'fonepay', 'card', 'cod');

-- Payment lifecycle (spec §17).
create type payment_status as enum ('pending', 'initiated', 'successful', 'failed', 'refunded');

-- Cash-on-delivery lifecycle (spec §16).
create type cod_status as enum ('pending', 'collected', 'settled');

-- Rider matching request lifecycle (spec §8).
create type dispatch_status as enum ('sent', 'accepted', 'rejected', 'expired', 'cancelled');

-- Support ticket lifecycle (spec §30).
create type ticket_status as enum ('open', 'in_progress', 'resolved', 'closed');
create type ticket_category as enum ('delivery_issue', 'payment_issue', 'rider_issue', 'refund_request', 'other');

-- Notification audience + channel (spec §29).
create type notification_audience as enum ('customer', 'rider', 'admin');
create type notification_channel as enum ('push', 'in_app', 'sms', 'email');

-- Rating direction (spec §31).
create type rating_direction as enum ('customer_to_rider', 'rider_to_customer');

-- Wallet ledger entry type (spec §27).
create type wallet_entry_type as enum ('earning', 'commission', 'withdrawal', 'cod_settlement', 'adjustment', 'refund');

-- Pricing rule keys are open-ended text; service-area zone type:
create type zone_type as enum ('standard', 'metro', 'remote');

-- Audit action taxonomy (spec §45).
create type audit_action as enum (
  'rider_approved', 'rider_rejected', 'rider_suspended', 'rider_activated',
  'pricing_changed', 'commission_changed', 'order_manually_assigned',
  'order_cancelled', 'refund_processed', 'user_suspended', 'user_restored',
  'promo_created', 'promo_disabled', 'service_area_changed', 'settings_changed',
  'login', 'manual_status_change'
);
