// ============================================================
// CargoNepal — Admin Order detail (spec §20)
// ============================================================
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase, invoke } from "@/services/supabaseClient";
import { fetchOrder, fetchOrderHistory, fetchOrderTracking } from "@/services/orders/ordersService";
import { fetchPaymentsForOrder } from "@/services/payments/paymentsService";
import { getSignedUrl } from "@/services/storage/storageService";
import { useOrderRealtime } from "@/core/hooks/useRealtime";
import { isConfigured } from "@/core/config/env";
import { MapView } from "@/components/MapView";
import { ORDER_STATUS_LABELS, CANCELLATION_REASONS } from "@/core/constants";
import {
  Button, Card, Badge, StatusBadge, Modal, Select, Textarea, Input,
  Skeleton, EmptyState, ErrorState, useToast,
} from "@/components/ui";
import { cn, formatNPR, formatKm, formatDateTime } from "@/core/utils";
import type {
  Order, OrderStatus, OrderStatusHistory, OrderTrackingPoint, Payment, RiderProfile, User,
} from "@/models/types";

type OrderRow = Order & {
  base_fare?: number; distance_fee?: number; weight_fee?: number; service_fees?: number;
  dropoff_city?: string | null; cancelled_at?: string | null;
};

interface PodRow {
  id: string; photo_url: string | null; signature_url: string | null;
  receiver_name: string | null; receiver_phone: string | null;
  otp_verified: boolean; qr_verified: boolean; note: string | null; created_at: string;
}

interface CancellationRow {
  id: string; reason: string; reason_code: string | null;
  cancellation_fee: number; refund_amount: number; cancelled_by_role: string | null; created_at: string;
}

interface RiderOption { profile: RiderProfile; user: Pick<User, "id" | "full_name" | "phone"> | null }

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
      <p className="mt-0.5 text-sm text-ink-800">{value ?? "—"}</p>
    </div>
  );
}

export default function OrderDetailScreen() {
  const { orderId = "" } = useParams<{ orderId: string }>();
  const toast = useToast();

  const [order, setOrder] = useState<OrderRow | null>(null);
  const [history, setHistory] = useState<OrderStatusHistory[]>([]);
  const [tracking, setTracking] = useState<OrderTrackingPoint[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [pod, setPod] = useState<PodRow | null>(null);
  const [podPhotoUrl, setPodPhotoUrl] = useState<string | null>(null);
  const [cancellation, setCancellation] = useState<CancellationRow | null>(null);
  const [customer, setCustomer] = useState<Pick<User, "id" | "full_name" | "phone" | "email"> | null>(null);
  const [rider, setRider] = useState<(Pick<User, "id" | "full_name" | "phone"> & { profile: RiderProfile | null }) | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusDraft, setStatusDraft] = useState<string>("");
  const [statusNote, setStatusNote] = useState("");
  const [savingStatus, setSavingStatus] = useState(false);

  const [assignOpen, setAssignOpen] = useState(false);
  const [riderOptions, setRiderOptions] = useState<RiderOption[]>([]);
  const [loadingRiders, setLoadingRiders] = useState(false);
  const [selectedRider, setSelectedRider] = useState("");
  const [assigning, setAssigning] = useState(false);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelCode, setCancelCode] = useState("other");
  const [cancelling, setCancelling] = useState(false);

  // Live status updates merge into the loaded order.
  const liveOrder = useOrderRealtime(isConfigured.supabase ? orderId : null);
  useEffect(() => {
    if (liveOrder) setOrder((prev) => ({ ...(prev as OrderRow), ...liveOrder } as OrderRow));
  }, [liveOrder]);

  const load = useCallback(async () => {
    if (!isConfigured.supabase || !orderId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const o = await fetchOrder(orderId);
      if (!o) { setError("Order not found."); setLoading(false); return; }
      setOrder(o as OrderRow);
      setStatusDraft(o.status);

      const [hist, track, pays, podRes, cancRes, custRes] = await Promise.all([
        fetchOrderHistory(orderId).catch(() => [] as OrderStatusHistory[]),
        fetchOrderTracking(orderId).catch(() => [] as OrderTrackingPoint[]),
        fetchPaymentsForOrder(orderId).catch(() => [] as Payment[]),
        supabase.from("proof_of_delivery").select("*").eq("order_id", orderId).limit(1).maybeSingle(),
        supabase.from("order_cancellations").select("*").eq("order_id", orderId).limit(1).maybeSingle(),
        supabase.from("users").select("id, full_name, phone, email").eq("id", o.customer_id).maybeSingle(),
      ]);
      setHistory(hist);
      setTracking(track);
      setPayments(pays);
      setCustomer((custRes.data as Pick<User, "id" | "full_name" | "phone" | "email">) ?? null);
      const podRow = (podRes.data as PodRow) ?? null;
      setPod(podRow);
      setCancellation((cancRes.data as CancellationRow) ?? null);
      if (podRow?.photo_url) {
        const url = await getSignedUrl("proof-of-delivery", podRow.photo_url);
        setPodPhotoUrl(url);
      }

      if (o.rider_id) {
        const [rUser, rProf] = await Promise.all([
          supabase.from("users").select("id, full_name, phone").eq("id", o.rider_id).maybeSingle(),
          supabase.from("rider_profiles").select("*").eq("id", o.rider_id).maybeSingle(),
        ]);
        setRider({
          ...(rUser.data as Pick<User, "id" | "full_name" | "phone">) ?? { id: o.rider_id, full_name: null, phone: null },
          profile: (rProf.data as RiderProfile) ?? null,
        });
      } else {
        setRider(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load order");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { void load(); }, [load]);

  async function openAssignModal() {
    setAssignOpen(true);
    setSelectedRider("");
    setLoadingRiders(true);
    try {
      const { data, error: e } = await supabase.from("rider_profiles")
        .select("*").eq("status", "approved").eq("availability", "online").limit(50);
      if (e) throw new Error(e.message);
      const profiles = (data as RiderProfile[]) ?? [];
      const ids = profiles.map((p) => p.id);
      const { data: users } = ids.length
        ? await supabase.from("users").select("id, full_name, phone").in("id", ids)
        : { data: [] as Pick<User, "id" | "full_name" | "phone">[] };
      const uMap = new Map((users ?? []).map((u) => [u.id as string, u as Pick<User, "id" | "full_name" | "phone">]));
      setRiderOptions(profiles.map((p) => ({ profile: p, user: uMap.get(p.id) ?? null })));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to load riders", "error");
    } finally {
      setLoadingRiders(false);
    }
  }

  async function assignRider() {
    if (!selectedRider || !order) return;
    setAssigning(true);
    try {
      const { error: e } = await supabase.from("orders")
        .update({ rider_id: selectedRider, status: "RIDER_ASSIGNED", updated_at: new Date().toISOString() })
        .eq("id", order.id);
      if (e) throw new Error(e.message);
      toast("Rider assigned to order", "success");
      setAssignOpen(false);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to assign rider", "error");
    } finally {
      setAssigning(false);
    }
  }

  async function changeStatus() {
    if (!order || !statusDraft || statusDraft === order.status) return;
    setSavingStatus(true);
    try {
      await invoke("update-order-status", {
        body: { order_id: order.id, status: statusDraft, note: statusNote || undefined },
      });
      toast(`Status changed to ${ORDER_STATUS_LABELS[statusDraft as OrderStatus]}`, "success");
      setStatusNote("");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to change status", "error");
    } finally {
      setSavingStatus(false);
    }
  }

  async function cancelOrderNow() {
    if (!order || !cancelReason.trim()) { toast("A cancellation reason is required", "error"); return; }
    setCancelling(true);
    try {
      await invoke("cancel-order", { body: { order_id: order.id, reason: cancelReason.trim(), reason_code: cancelCode } });
      toast("Order cancelled", "success");
      setCancelOpen(false);
      setCancelReason("");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to cancel order", "error");
    } finally {
      setCancelling(false);
    }
  }

  if (!isConfigured.supabase) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Supabase is not configured. <Link to="/setup" className="font-semibold underline">Run setup</Link>.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64 rounded-xl" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Skeleton className="h-64 rounded-2xl lg:col-span-2" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (error || !order) {
    return <ErrorState title="Order unavailable" message={error ?? undefined} onRetry={() => void load()} />;
  }

  const isTerminal = ["DELIVERED", "CANCELLED", "FAILED", "RETURNED"].includes(order.status);
  const route = tracking.map((t) => ({ lat: t.lat, lng: t.lng }));

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-ink-500"><Link to="/admin/orders" className="hover:text-brand-600">← Orders</Link></p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-2xl font-bold text-ink-900">{order.order_code ?? order.id}</h1>
            <StatusBadge status={order.status} />
            {order.priority !== "standard" && <Badge className="bg-amber-100 text-amber-800 capitalize">{order.priority}</Badge>}
          </div>
          <p className="mt-1 text-sm text-ink-500">Placed {formatDateTime(order.created_at)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isTerminal && (
            <>
              <Button variant="outline" size="sm" onClick={() => void openAssignModal()}>🛵 Assign rider</Button>
              <Button variant="accent" size="sm" onClick={() => setCancelOpen(true)}>Cancel order</Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* People */}
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-semibold text-ink-800">Customer</h3>
          <div className="space-y-3">
            <Field label="Name" value={customer?.full_name ?? "—"} />
            <Field label="Phone" value={customer?.phone ? <a className="text-brand-600 hover:underline" href={`tel:${customer.phone}`}>{customer.phone}</a> : "—"} />
            <Field label="Email" value={customer?.email ?? "—"} />
          </div>
          <h3 className="mt-6 mb-4 text-sm font-semibold text-ink-800">Rider</h3>
          {rider ? (
            <div className="space-y-3">
              <Field label="Name" value={rider.full_name ? <Link className="text-brand-600 hover:underline" to="/admin/riders">{rider.full_name}</Link> : "—"} />
              <Field label="Phone" value={rider.phone ? <a className="text-brand-600 hover:underline" href={`tel:${rider.phone}`}>{rider.phone}</a> : "—"} />
              <Field label="Availability" value={<Badge className="bg-blue-100 text-blue-800 capitalize">{rider.profile?.availability ?? "unknown"}</Badge>} />
            </div>
          ) : (
            <p className="text-sm text-ink-500">No rider assigned yet.</p>
          )}
        </Card>

        {/* Addresses + parcel */}
        <Card className="p-5 lg:col-span-2">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <h3 className="mb-3 text-sm font-semibold text-ink-800">📍 Pickup</h3>
              <p className="text-sm text-ink-700">{order.pickup_address}</p>
              <p className="mt-1 text-xs text-ink-500">{order.pickup_city ?? ""} · {order.pickup_lat.toFixed(5)}, {order.pickup_lng.toFixed(5)}</p>
              {order.pickup_contact_name && <p className="mt-2 text-xs text-ink-600">{order.pickup_contact_name} · {order.pickup_contact_phone}</p>}
            </div>
            <div>
              <h3 className="mb-3 text-sm font-semibold text-ink-800">🏁 Drop-off</h3>
              <p className="text-sm text-ink-700">{order.dropoff_address}</p>
              <p className="mt-1 text-xs text-ink-500">{order.dropoff_city ?? ""} · {order.dropoff_lat.toFixed(5)}, {order.dropoff_lng.toFixed(5)}</p>
              <p className="mt-2 text-xs text-ink-600">{order.receiver_name} · {order.receiver_phone}</p>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-ink-100 pt-4 sm:grid-cols-4">
            <Field label="Parcel" value={<span className="capitalize">{order.parcel_category.replace("_", " ")}</span>} />
            <Field label="Weight" value={`${Number(order.weight_kg)} kg × ${order.quantity}`} />
            <Field label="Distance" value={formatKm(order.distance_km != null ? Number(order.distance_km) : null)} />
            <Field label="Fragile" value={order.is_fragile ? "Yes" : "No"} />
            {order.parcel_description && <Field label="Description" value={order.parcel_description} />}
            {order.special_instructions && <Field label="Instructions" value={order.special_instructions} />}
          </div>
        </Card>

        {/* Fare + payment */}
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-semibold text-ink-800">Fare breakdown</h3>
          <dl className="space-y-2 text-sm">
            {[
              ["Base fare", order.base_fare], ["Distance fee", order.distance_fee], ["Weight fee", order.weight_fee],
              ["Service fees", order.service_fees], ["COD fee", order.cod_fee],
            ].filter(([, v]) => v != null).map(([label, v]) => (
              <div key={label as string} className="flex justify-between"><dt className="text-ink-500">{label}</dt><dd className="text-ink-800">{formatNPR(Number(v))}</dd></div>
            ))}
            {Number(order.discount_amount) > 0 && (
              <div className="flex justify-between text-green-700"><dt>Discount</dt><dd>−{formatNPR(order.discount_amount)}</dd></div>
            )}
            <div className="flex justify-between border-t border-ink-100 pt-2 font-semibold"><dt>Total</dt><dd>{formatNPR(order.total_amount)}</dd></div>
            <div className="flex justify-between text-ink-500"><dt>Rider earning</dt><dd>{formatNPR(order.rider_earning)}</dd></div>
            <div className="flex justify-between text-ink-500"><dt>Platform commission</dt><dd>{formatNPR(order.platform_commission)}</dd></div>
          </dl>
          <div className="mt-4 border-t border-ink-100 pt-4">
            <Field label="Payment" value={
              <span className="capitalize">{order.payment_method} · <Badge className={cn(order.is_paid ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800")}>{order.payment_status}</Badge></span>
            } />
            {order.is_cod && (
              <p className="mt-2 text-xs text-ink-500">COD to collect: <span className="font-semibold text-ink-700">{formatNPR(order.cod_amount)}</span></p>
            )}
            {payments.length > 0 && (
              <ul className="mt-3 space-y-2">
                {payments.map((p) => (
                  <li key={p.id} className="rounded-lg bg-ink-50 px-3 py-2 text-xs">
                    <span className="font-mono">{p.transaction_reference ?? p.id.slice(0, 8)}</span> · {formatNPR(p.amount)} ·{" "}
                    <span className="capitalize">{p.provider}</span> · <Badge className={cn("ml-1", p.status === "successful" ? "bg-green-100 text-green-800" : "bg-ink-200 text-ink-700")}>{p.status}</Badge>
                    <span className="block text-ink-400">{formatDateTime(p.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
            {order.is_paid && !isTerminal && (
              <p className="mt-3 text-xs text-ink-500">💡 Cancelling a paid order triggers an automatic refund via cancel-order.</p>
            )}
          </div>
          {order.qr_token && (
            <div className="mt-4 border-t border-ink-100 pt-4">
              <Field label="QR verification token" value={<span className="font-mono text-xs">{order.qr_token}</span>} />
              {order.requires_otp && <p className="mt-1 text-xs text-ink-500">OTP verification required at delivery.</p>}
            </div>
          )}
        </Card>

        {/* Map + tracking */}
        <Card className="overflow-hidden p-0 lg:col-span-2">
          <div className="flex items-center justify-between px-5 pt-4">
            <h3 className="text-sm font-semibold text-ink-800">Route & live tracking</h3>
            <span className="text-xs text-ink-500">{tracking.length} GPS points</span>
          </div>
          <MapView
            className="mt-3 h-72 w-full"
            center={{ lat: order.pickup_lat, lng: order.pickup_lng }}
            fitMarkers
            route={route}
            markers={[
              { point: { lat: order.pickup_lat, lng: order.pickup_lng }, type: "pickup", label: "Pickup" },
              { point: { lat: order.dropoff_lat, lng: order.dropoff_lng }, type: "dropoff", label: "Drop-off" },
              ...(tracking.at(-1) ? [{ point: { lat: tracking.at(-1)!.lat, lng: tracking.at(-1)!.lng }, type: "rider" as const, label: "Rider (last seen)" }] : []),
            ]}
          />
        </Card>

        {/* Status history */}
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-semibold text-ink-800">Status history</h3>
          {history.length === 0 ? (
            <p className="text-sm text-ink-500">No status changes recorded yet.</p>
          ) : (
            <ol className="relative space-y-4 border-l border-ink-200 pl-4">
              {history.map((h) => (
                <li key={h.id} className="relative">
                  <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-brand-500 ring-4 ring-brand-100" />
                  <p className="text-sm font-medium text-ink-800">{ORDER_STATUS_LABELS[h.status] ?? h.status}</p>
                  <p className="text-xs text-ink-500">{formatDateTime(h.created_at)}</p>
                  {h.note && <p className="mt-0.5 text-xs italic text-ink-500">“{h.note}”</p>}
                </li>
              ))}
            </ol>
          )}
        </Card>

        {/* Proof of delivery */}
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-semibold text-ink-800">Proof of delivery</h3>
          {!pod ? (
            <EmptyState icon="📷" title="No proof yet" message="Delivery photo and signature will appear here once the rider completes the drop-off." />
          ) : (
            <div className="space-y-3">
              {podPhotoUrl ? (
                <a href={podPhotoUrl} target="_blank" rel="noreferrer">
                  <img src={podPhotoUrl} alt="Proof of delivery" className="h-44 w-full rounded-xl object-cover" />
                </a>
              ) : pod.photo_url ? (
                <Button variant="outline" size="sm" onClick={async () => setPodPhotoUrl(await getSignedUrl("proof-of-delivery", pod.photo_url!))}>
                  Load delivery photo
                </Button>
              ) : null}
              <Field label="Received by" value={`${pod.receiver_name ?? "—"} · ${pod.receiver_phone ?? "—"}`} />
              <div className="flex gap-2">
                {pod.otp_verified && <Badge className="bg-green-100 text-green-800">OTP verified</Badge>}
                {pod.qr_verified && <Badge className="bg-green-100 text-green-800">QR verified</Badge>}
              </div>
              {pod.note && <p className="text-xs italic text-ink-500">“{pod.note}”</p>}
              <p className="text-xs text-ink-400">{formatDateTime(pod.created_at)}</p>
            </div>
          )}
          {cancellation && (
            <div className="mt-5 border-t border-ink-100 pt-4">
              <h4 className="mb-2 text-sm font-semibold text-accent-700">Cancellation</h4>
              <p className="text-sm text-ink-700">{cancellation.reason}</p>
              <p className="mt-1 text-xs text-ink-500">
                By {cancellation.cancelled_by_role ?? "user"} · fee {formatNPR(cancellation.cancellation_fee)} · refund {formatNPR(cancellation.refund_amount)} · {formatDateTime(cancellation.created_at)}
              </p>
            </div>
          )}
        </Card>

        {/* Admin status control */}
        {!isTerminal && (
          <Card className="p-5">
            <h3 className="mb-4 text-sm font-semibold text-ink-800">Change status manually</h3>
            <Select label="New status" value={statusDraft} onChange={(e) => setStatusDraft(e.target.value)}>
              {(Object.keys(ORDER_STATUS_LABELS) as OrderStatus[])
                .filter((s) => s !== "CANCELLED")
                .map((s) => <option key={s} value={s}>{ORDER_STATUS_LABELS[s]}</option>)}
            </Select>
            <div className="mt-3">
              <Input label="Note (optional)" value={statusNote} onChange={(e) => setStatusNote(e.target.value)} placeholder="Reason for manual change…" />
            </div>
            <Button className="mt-4 w-full" loading={savingStatus}
              disabled={statusDraft === order.status}
              onClick={() => void changeStatus()}>
              Apply status change
            </Button>
            <p className="mt-2 text-xs text-ink-500">Runs through the update-order-status function so history, notifications and side effects stay consistent.</p>
          </Card>
        )}
      </div>

      {/* Assign rider modal */}
      <Modal open={assignOpen} onClose={() => setAssignOpen(false)} title="Assign rider"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAssignOpen(false)}>Close</Button>
            <Button loading={assigning} disabled={!selectedRider} onClick={() => void assignRider()}>Assign</Button>
          </div>
        }>
        {loadingRiders ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>
        ) : riderOptions.length === 0 ? (
          <EmptyState icon="🛵" title="No riders available" message="No approved riders are currently online." />
        ) : (
          <div className="space-y-2">
            {riderOptions.map(({ profile, user }) => (
              <button key={profile.id} onClick={() => setSelectedRider(profile.id)}
                className={cn("flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition",
                  selectedRider === profile.id ? "border-brand-400 bg-brand-50" : "border-ink-100 hover:border-brand-200")}>
                <div>
                  <p className="text-sm font-medium text-ink-800">{user?.full_name ?? profile.id.slice(0, 8)}</p>
                  <p className="text-xs text-ink-500">
                    {user?.phone} · ⭐ {Number(profile.rating_avg).toFixed(1)} · {profile.total_deliveries} deliveries · {profile.primary_city ?? "—"}
                  </p>
                </div>
                <Badge className="bg-green-100 text-green-800 capitalize">{profile.availability}</Badge>
              </button>
            ))}
          </div>
        )}
      </Modal>

      {/* Cancel modal */}
      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancel order"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>Keep order</Button>
            <Button variant="accent" loading={cancelling} onClick={() => void cancelOrderNow()}>Cancel order</Button>
          </div>
        }>
        <p className="mb-4 text-sm text-ink-600">
          Cancelling <span className="font-mono font-semibold">{order.order_code ?? order.id}</span>.
          {order.is_paid && " Paid amounts are refunded automatically."} This cannot be undone.
        </p>
        <Select label="Reason code" value={cancelCode} onChange={(e) => setCancelCode(e.target.value)}>
          {CANCELLATION_REASONS.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
        </Select>
        <div className="mt-3">
          <Textarea label="Reason (required)" rows={3} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Explain why this order is being cancelled by admin…" />
        </div>
      </Modal>
    </div>
  );
}
