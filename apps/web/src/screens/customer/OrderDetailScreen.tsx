// ============================================================
// CargoNepal — Order detail (spec §24)
// Full order info, QR handover code, status history, payments,
// and actions (track / cancel / help).
// ============================================================
import QRCode from "qrcode";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Button, Card, Spinner, ErrorState, Modal, Textarea,
  StatusBadge, Badge, useToast,
} from "@/components/ui";
import {
  fetchOrder, fetchOrderHistory, cancelOrder,
} from "@/services/orders/ordersService";
import { fetchPaymentsForOrder } from "@/services/payments/paymentsService";
import { isConfigured } from "@/core/config/env";
import { ACTIVE_ORDER_STATUSES, CANCELLATION_REASONS, ORDER_STATUS_LABELS, PARCEL_CATEGORIES } from "@/core/constants";
import { cn, formatDateTime, formatKm, formatNPR, timeAgo } from "@/core/utils";
import type { Order, OrderStatus, OrderStatusHistory, Payment } from "@/models/types";

const PAYMENT_TONE: Record<string, string> = {
  successful: "bg-green-100 text-green-800",
  pending: "bg-amber-100 text-amber-800",
  initiated: "bg-amber-100 text-amber-800",
  failed: "bg-accent-100 text-accent-800",
  refunded: "bg-ink-200 text-ink-700",
};

export default function OrderDetailScreen() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const [order, setOrder] = useState<Order | null>(null);
  const [history, setHistory] = useState<OrderStatusHistory[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState(CANCELLATION_REASONS[0]);
  const [cancelNote, setCancelNote] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    setError(null);
    try {
      const [o, h, p] = await Promise.all([
        fetchOrder(orderId),
        fetchOrderHistory(orderId).catch(() => [] as OrderStatusHistory[]),
        fetchPaymentsForOrder(orderId).catch(() => [] as Payment[]),
      ]);
      if (!o) { setError("Order not found."); return; }
      setOrder(o);
      setHistory(h);
      setPayments(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load this order.");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { void load(); }, [load]);

  // QR handover payload for the rider scanner (spec §23).
  useEffect(() => {
    if (!order?.qr_token) { setQrDataUrl(null); return; }
    let mounted = true;
    const payload = JSON.stringify({ v: 1, oid: order.id, t: order.qr_token, c: order.order_code });
    QRCode.toDataURL(payload, { width: 320, margin: 1 })
      .then((url) => { if (mounted) setQrDataUrl(url); })
      .catch(() => { if (mounted) setQrDataUrl(null); });
    return () => { mounted = false; };
  }, [order?.id, order?.qr_token, order?.order_code]);

  const isCancellable = useMemo(() => {
    if (!order || !ACTIVE_ORDER_STATUSES.includes(order.status)) return false;
    const pre: OrderStatus[] = ["PENDING", "SEARCHING_RIDER", "RIDER_ASSIGNED", "RIDER_ACCEPTED", "RIDER_ON_THE_WAY_TO_PICKUP"];
    return pre.includes(order.status);
  }, [order]);

  async function doCancel() {
    if (!order || cancelling) return;
    setCancelling(true);
    try {
      await cancelOrder(order.id, cancelNote.trim() || cancelReason.label, cancelReason.code);
      toast("Order cancelled", "info");
      setCancelOpen(false);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not cancel the order", "error");
    } finally {
      setCancelling(false);
    }
  }

  if (!isConfigured.supabase) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        Supabase is not configured.{" "}
        <Link to="/setup" className="font-semibold underline">Open the setup guide</Link>.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner className="h-8 w-8 text-brand-600" />
      </div>
    );
  }

  if (error || !order) {
    return <ErrorState title="Order unavailable" message={error ?? undefined} onRetry={() => void load()} />;
  }

  const category = PARCEL_CATEGORIES.find((c) => c.value === order.parcel_category);
  const isActive = ACTIVE_ORDER_STATUSES.includes(order.status);

  return (
    <div className="pb-4 space-y-4 animate-fade-in">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/customer/orders" className="text-ink-400 hover:text-ink-700 text-xl leading-none">←</Link>
          <div className="min-w-0">
            <h1 className="font-display text-lg font-bold text-ink-900 truncate">{order.order_code ?? "Order"}</h1>
            <p className="text-xs text-ink-500">Placed {formatDateTime(order.created_at)}</p>
          </div>
        </div>
        <StatusBadge status={order.status} />
      </header>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {isActive && (
          <Button size="sm" onClick={() => navigate(`/customer/track/${order.id}`)}>🛰️ Track live</Button>
        )}
        {isActive && !order.is_paid && order.payment_method !== "cod" && (
          <Button size="sm" variant="outline" onClick={() => navigate(`/customer/checkout/${order.id}`)}>Pay now</Button>
        )}
        {isCancellable && (
          <Button size="sm" variant="accent" onClick={() => setCancelOpen(true)}>Cancel order</Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => navigate("/customer/support")}>Get help</Button>
      </div>

      {/* QR handover code */}
      {qrDataUrl && isActive && (
        <Card className="flex flex-col items-center gap-2 p-4">
          <p className="text-sm font-semibold text-ink-800">Handover QR code</p>
          <img src={qrDataUrl} alt="Order QR code" className="h-44 w-44 rounded-xl border border-ink-100" />
          <p className="text-center text-xs text-ink-500">
            Show this to the rider at {order.requires_otp ? "pickup/delivery (OTP protected)" : "pickup"} to verify the parcel handover.
          </p>
        </Card>
      )}

      {/* Route */}
      <Card className="space-y-3 p-4">
        <h2 className="font-display text-base font-bold text-ink-900">Delivery route</h2>
        <div className="space-y-2 text-sm">
          <div className="rounded-xl bg-ink-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Pickup</p>
            <p className="text-ink-800">{order.pickup_address}{order.pickup_city ? `, ${order.pickup_city}` : ""}</p>
            {order.pickup_contact_name && (
              <p className="text-xs text-ink-500">{order.pickup_contact_name}{order.pickup_contact_phone ? ` · ${order.pickup_contact_phone}` : ""}</p>
            )}
          </div>
          <div className="rounded-xl bg-ink-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-accent-600">Drop-off</p>
            <p className="text-ink-800">{order.dropoff_address}</p>
            <p className="text-xs text-ink-500">{order.receiver_name} · {order.receiver_phone}</p>
          </div>
          {order.distance_km != null && (
            <p className="text-xs text-ink-400">📏 {formatKm(order.distance_km)}{order.delivery_eta_minutes ? ` · ~${order.delivery_eta_minutes} min delivery` : ""}</p>
          )}
        </div>
      </Card>

      {/* Parcel */}
      <Card className="p-4 space-y-1.5 text-sm">
        <h2 className="font-display text-base font-bold text-ink-900">Parcel</h2>
        <DetailRow label="Category" value={`${category?.icon ?? "📦"} ${category?.label ?? order.parcel_category}`} />
        {order.parcel_description && <DetailRow label="Description" value={order.parcel_description} />}
        <DetailRow label="Weight" value={`${order.weight_kg} kg`} />
        <DetailRow label="Quantity" value={String(order.quantity)} />
        <DetailRow label="Fragile" value={order.is_fragile ? "Yes — handle with care" : "No"} />
        {order.declared_value > 0 && <DetailRow label="Declared value" value={formatNPR(order.declared_value)} />}
        {order.special_instructions && <DetailRow label="Instructions" value={order.special_instructions} />}
        <DetailRow label="Priority" value={order.priority} />
      </Card>

      {/* Fare & payment */}
      <Card className="p-4 space-y-1.5 text-sm">
        <h2 className="font-display text-base font-bold text-ink-900">Fare & payment</h2>
        <DetailRow label="Payment method" value={order.payment_method.toUpperCase()} />
        <div className="flex items-center justify-between">
          <span className="text-ink-500">Payment status</span>
          <Badge className={PAYMENT_TONE[order.payment_status] ?? "bg-ink-100 text-ink-700"}>{order.payment_status}</Badge>
        </div>
        {order.is_cod && <DetailRow label="COD to collect" value={formatNPR(order.cod_amount)} />}
        {order.cod_fee > 0 && <DetailRow label="COD fee" value={formatNPR(order.cod_fee)} />}
        {order.discount_amount > 0 && <DetailRow label="Discount" value={`− ${formatNPR(order.discount_amount)}`} />}
        <div className="flex items-center justify-between border-t border-ink-100 pt-2">
          <span className="font-display font-bold text-ink-900">Total</span>
          <span className="font-display text-lg font-bold text-brand-700">{formatNPR(order.total_amount)}</span>
        </div>
      </Card>

      {/* Payment attempts */}
      {payments.length > 0 && (
        <Card className="p-4 space-y-2">
          <h2 className="font-display text-base font-bold text-ink-900">Payment history</h2>
          {payments.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-xl bg-ink-50 px-3 py-2 text-sm">
              <div>
                <p className="font-medium text-ink-800">{formatNPR(p.amount)} <span className="text-xs text-ink-400">via {p.provider}</span></p>
                <p className="text-xs text-ink-400">{formatDateTime(p.created_at)}{p.transaction_reference ? ` · ${p.transaction_reference}` : ""}</p>
              </div>
              <Badge className={PAYMENT_TONE[p.status] ?? "bg-ink-100 text-ink-700"}>{p.status}</Badge>
            </div>
          ))}
        </Card>
      )}

      {/* Status history */}
      <Card className="p-4">
        <h2 className="mb-3 font-display text-base font-bold text-ink-900">Status history</h2>
        {history.length === 0 ? (
          <p className="text-sm text-ink-500">No status events recorded yet.</p>
        ) : (
          <ol className="space-y-0">
            {[...history].reverse().map((h, i) => (
              <li key={h.id} className="relative flex items-start gap-3 pb-4 last:pb-0">
                {i < history.length - 1 && <span className="absolute left-[7px] top-4 h-full w-0.5 bg-ink-200" />}
                <span className={cn("relative z-10 mt-1 h-4 w-4 shrink-0 rounded-full border-2",
                  i === 0 ? "border-brand-600 bg-brand-600" : "border-ink-300 bg-white")} />
                <div className="min-w-0">
                  <p className={cn("text-sm", i === 0 ? "font-bold text-brand-700" : "font-medium text-ink-800")}>
                    {ORDER_STATUS_LABELS[h.status] ?? h.status}
                  </p>
                  <p className="text-xs text-ink-400">{formatDateTime(h.created_at)} · {timeAgo(h.created_at)}</p>
                  {h.note && <p className="mt-0.5 text-xs text-ink-500">{h.note}</p>}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>

      {/* Cancel modal */}
      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancel this order?" size="sm"
        footer={
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setCancelOpen(false)}>Keep order</Button>
            <Button variant="accent" className="flex-1" loading={cancelling} onClick={() => void doCancel()}>
              Cancel order
            </Button>
          </div>
        }>
        <div className="space-y-3">
          <p className="text-sm text-ink-500">Why are you cancelling?</p>
          {CANCELLATION_REASONS.map((r) => (
            <button key={r.code} type="button" onClick={() => setCancelReason(r)}
              className={cn("flex w-full items-center gap-3 rounded-xl border px-4 py-2.5 text-left text-sm transition",
                cancelReason.code === r.code ? "border-accent-400 bg-accent-50 text-accent-800" : "border-ink-200 hover:bg-ink-50")}>
              <span className={cn("flex h-4 w-4 items-center justify-center rounded-full border-2",
                cancelReason.code === r.code ? "border-accent-600" : "border-ink-300")}>
                {cancelReason.code === r.code && <span className="h-2 w-2 rounded-full bg-accent-600" />}
              </span>
              {r.label}
            </button>
          ))}
          <Textarea rows={2} label="Anything else? (optional)" value={cancelNote}
            onChange={(e) => setCancelNote(e.target.value)} />
        </div>
      </Modal>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-ink-500">{label}</span>
      <span className="text-right font-medium capitalize text-ink-800">{value}</span>
    </div>
  );
}
