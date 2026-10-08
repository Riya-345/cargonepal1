// ============================================================
// CargoNepal — Live tracking (spec §12, §21)
// Realtime order status, rider GPS trail, rider card, cancel
// (pre-pickup), and post-delivery rider rating.
// ============================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Button, Card, Spinner, ErrorState, Modal, Textarea,
  StatusBadge, Badge, useToast,
} from "@/components/ui";
import { MapView } from "@/components/MapView";
import { useAuth } from "@/core/hooks/useAuth";
import { useOrderRealtime, useOrderTracking } from "@/core/hooks/useRealtime";
import { fetchOrder, cancelOrder } from "@/services/orders/ordersService";
import { getRoute } from "@/services/maps/mapsService";
import { supabase } from "@/services/supabaseClient";
import { isConfigured } from "@/core/config/env";
import { CANCELLATION_REASONS, ORDER_STATUS_LABELS } from "@/core/constants";
import { cn, formatNPR, formatKm, timeAgo } from "@/core/utils";
import type { Order, OrderStatus, RiderProfile } from "@/models/types";

const LIFECYCLE: OrderStatus[] = [
  "PENDING", "SEARCHING_RIDER", "RIDER_ASSIGNED", "RIDER_ACCEPTED",
  "RIDER_ON_THE_WAY_TO_PICKUP", "ARRIVED_AT_PICKUP", "PARCEL_PICKED_UP",
  "ON_THE_WAY_TO_DESTINATION", "ARRIVED_AT_DESTINATION", "DELIVERED",
];
const TERMINALS: OrderStatus[] = ["CANCELLED", "FAILED", "RETURNED"];

interface RiderInfo { profile: RiderProfile | null; name: string | null; phone: string | null }

export default function LiveTrackingScreen() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [routePath, setRoutePath] = useState<{ lat: number; lng: number }[]>([]);
  const [rider, setRider] = useState<RiderInfo | null>(null);

  const liveOrder = useOrderRealtime(orderId ?? null, (o) => setOrder(o));
  const { latest } = useOrderTracking(orderId ?? null);
  const current: Order | null = liveOrder ?? order;

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    setError(null);
    try {
      const o = await fetchOrder(orderId);
      if (!o) { setError("This order does not exist or is not yours."); return; }
      setOrder(o);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load tracking.");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { void load(); }, [load]);

  // Route polyline: driving route when Maps is available, else straight line.
  useEffect(() => {
    if (!order) return;
    let mounted = true;
    const pickup = { lat: order.pickup_lat, lng: order.pickup_lng };
    const dropoff = { lat: order.dropoff_lat, lng: order.dropoff_lng };
    void getRoute(pickup, dropoff).then((r) => {
      if (!mounted) return;
      setRoutePath(r?.path && r.path.length >= 2 ? r.path : [pickup, dropoff]);
    });
    return () => { mounted = false; };
  }, [order?.id, order?.pickup_lat, order?.pickup_lng, order?.dropoff_lat, order?.dropoff_lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // Rider card data.
  useEffect(() => {
    const rid = order?.rider_id;
    if (!rid) { setRider(null); return; }
    let mounted = true;
    void Promise.all([
      supabase.from("rider_profiles").select("*").eq("id", rid).maybeSingle(),
      supabase.from("users").select("full_name, phone").eq("id", rid).maybeSingle(),
    ]).then(([rp, u]) => {
      if (!mounted) return;
      setRider({
        profile: (rp.data as RiderProfile) ?? null,
        name: (u.data as { full_name: string | null } | null)?.full_name ?? null,
        phone: (u.data as { phone: string | null } | null)?.phone ?? null,
      });
    });
    return () => { mounted = false; };
  }, [order?.rider_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cancel modal.
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState(CANCELLATION_REASONS[0]);
  const [cancelNote, setCancelNote] = useState("");
  const [cancelling, setCancelling] = useState(false);

  // Rating modal.
  const [rateOpen, setRateOpen] = useState(false);
  const [stars, setStars] = useState(5);
  const [review, setReview] = useState("");
  const [rating, setRating] = useState(false);

  const isCancellable = useMemo(() => {
    if (!current) return false;
    const idx = LIFECYCLE.indexOf(current.status);
    return idx >= 0 && idx < LIFECYCLE.indexOf("ARRIVED_AT_PICKUP");
  }, [current]);

  const prePickup = current ? LIFECYCLE.indexOf(current.status) < LIFECYCLE.indexOf("PARCEL_PICKED_UP") : false;
  const etaMinutes = current ? (prePickup ? current.pickup_eta_minutes : current.delivery_eta_minutes) : null;

  async function doCancel() {
    if (!current || cancelling) return;
    setCancelling(true);
    try {
      await cancelOrder(current.id, cancelNote.trim() || cancelReason.label, cancelReason.code);
      toast("Order cancelled", "info");
      setCancelOpen(false);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not cancel the order", "error");
    } finally {
      setCancelling(false);
    }
  }

  async function submitRating() {
    if (!current || !user?.id || rating) return;
    if (!current.rider_id) { toast("No rider was assigned to this order", "error"); return; }
    setRating(true);
    try {
      const { error: e } = await supabase.from("ratings").insert({
        direction: "customer_to_rider",
        from_user_id: user.id,
        to_rider_id: current.rider_id,
        order_id: current.id,
        stars,
        review: review.trim() || null,
      });
      if (e) {
        if (e.code === "23505" || /duplicate|unique/i.test(e.message)) toast("Already rated", "info");
        else throw new Error(e.message);
        setRateOpen(false);
        return;
      }
      toast("Thanks for rating your rider! ⭐", "success");
      setRateOpen(false);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not save your rating", "error");
    } finally {
      setRating(false);
    }
  }

  if (!isConfigured.supabase) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        Live tracking requires a configured Supabase backend.{" "}
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

  if (error || !current) {
    return <ErrorState title="Tracking unavailable" message={error ?? undefined} onRetry={() => void load()} />;
  }

  const riderPoint = latest ? { lat: latest.lat, lng: latest.lng } : null;
  const markers = [
    { point: { lat: current.pickup_lat, lng: current.pickup_lng }, type: "pickup" as const, label: "Pickup" },
    { point: { lat: current.dropoff_lat, lng: current.dropoff_lng }, type: "dropoff" as const, label: "Drop-off" },
    ...(riderPoint ? [{ point: riderPoint, type: "rider" as const, label: "Rider" }] : []),
  ];
  const currentIdx = LIFECYCLE.indexOf(current.status);
  const isTerminal = TERMINALS.includes(current.status);

  return (
    <div className="pb-4 space-y-4 animate-fade-in">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/customer/orders" className="text-ink-400 hover:text-ink-700 text-xl leading-none">←</Link>
          <div className="min-w-0">
            <h1 className="font-display text-lg font-bold text-ink-900 truncate">
              {current.order_code ?? "Live tracking"}
            </h1>
            <p className="text-xs text-ink-500">{formatNPR(current.total_amount)} · {formatKm(current.distance_km)}</p>
          </div>
        </div>
        <StatusBadge status={current.status} />
      </header>

      {/* Map */}
      <div className="h-64 w-full overflow-hidden rounded-2xl border border-ink-100">
        <MapView markers={markers} route={routePath} fitMarkers
          center={{ lat: current.pickup_lat, lng: current.pickup_lng }} zoom={13} />
      </div>

      {/* ETA + status headline */}
      <Card className="p-4">
        {isTerminal ? (
          <div className="flex items-center gap-3">
            <span className="text-3xl">{current.status === "DELIVERED" ? "🎉" : current.status === "CANCELLED" ? "🚫" : "⚠️"}</span>
            <div>
              <p className="font-display text-base font-bold text-ink-900">{ORDER_STATUS_LABELS[current.status]}</p>
              <p className="text-xs text-ink-500">
                {current.status === "DELIVERED" && current.delivered_at
                  ? `Delivered ${timeAgo(current.delivered_at)}`
                  : `Updated ${timeAgo(current.updated_at)}`}
              </p>
            </div>
          </div>
        ) : (
          <>
            <p className="font-display text-base font-bold text-ink-900">
              {current.status === "DELIVERED" ? "Delivered" :
                prePickup
                  ? etaMinutes ? `Rider arriving in ~${etaMinutes} min` : "Rider is heading to your pickup"
                  : etaMinutes ? `Delivery in ~${etaMinutes} min` : "Your parcel is on the way"}
            </p>
            <p className="mt-0.5 text-xs text-ink-500">
              {ORDER_STATUS_LABELS[current.status]} · updated {timeAgo(current.updated_at)}
              {riderPoint && latest ? ` · GPS ${timeAgo(latest.recorded_at)}` : ""}
            </p>
          </>
        )}
      </Card>

      {/* Status timeline */}
      <Card className="p-4">
        <h2 className="mb-3 font-display text-base font-bold text-ink-900">Progress</h2>
        {isTerminal && current.status !== "DELIVERED" ? (
          <div className="rounded-xl bg-accent-50 p-3 text-sm text-accent-800">
            This order ended as <strong>{ORDER_STATUS_LABELS[current.status]}</strong>.
          </div>
        ) : (
          <ol className="relative space-y-0">
            {LIFECYCLE.map((s, i) => {
              const done = !isTerminal && currentIdx >= i;
              const isNow = current.status === s;
              return (
                <li key={s} className="relative flex items-start gap-3 pb-4 last:pb-0">
                  {i < LIFECYCLE.length - 1 && (
                    <span className={cn("absolute left-[9px] top-5 h-full w-0.5",
                      done && !isNow ? "bg-brand-500" : "bg-ink-200")} />
                  )}
                  <span className={cn("relative z-10 mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 text-[10px]",
                    done ? "border-brand-600 bg-brand-600 text-white"
                      : isNow ? "border-brand-600 bg-white"
                      : "border-ink-200 bg-white text-transparent")}>
                    {done ? "✓" : "•"}
                  </span>
                  <div>
                    <p className={cn("text-sm", isNow ? "font-bold text-brand-700" : done ? "font-medium text-ink-800" : "text-ink-400")}>
                      {ORDER_STATUS_LABELS[s]}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      {/* Rider card */}
      {current.rider_id && (
        <Card className="flex items-center gap-3 p-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-xl">🛵</div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink-900">{rider?.name ?? "Your rider"}</p>
            <p className="text-xs text-ink-500">
              {rider?.profile
                ? <>⭐ {rider.profile.rating_avg ? rider.profile.rating_avg.toFixed(1) : "New"} · {rider.profile.total_deliveries} deliveries</>
                : "Assigned to your order"}
            </p>
          </div>
          {rider?.phone && (
            <a href={`tel:${rider.phone}`}
              className="rounded-full bg-green-50 px-4 py-2 text-sm font-semibold text-green-700 hover:bg-green-100">
              📞 Call
            </a>
          )}
        </Card>
      )}
      {!current.rider_id && !isTerminal && (
        <Card className="flex items-center gap-3 p-4 text-sm text-ink-500">
          <Spinner className="h-4 w-4 text-brand-600" />
          Matching you with a nearby rider…
        </Card>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {current.status === "DELIVERED" && (
          <Button onClick={() => { setStars(5); setReview(""); setRateOpen(true); }}>⭐ Rate your rider</Button>
        )}
        {!isTerminal && current.payment_method !== "cod" && !current.is_paid && (
          <Button variant="outline" onClick={() => navigate(`/customer/checkout/${current.id}`)}>Pay now</Button>
        )}
        {isCancellable && (
          <Button variant="accent" onClick={() => setCancelOpen(true)}>Cancel order</Button>
        )}
        <Button variant="ghost" onClick={() => navigate(`/customer/orders/${current.id}`)}>Order details</Button>
      </div>

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

      {/* Rating modal */}
      <Modal open={rateOpen} onClose={() => setRateOpen(false)} title="Rate your rider" size="sm"
        footer={
          <Button className="w-full" loading={rating} onClick={() => void submitRating()}>Submit rating</Button>
        }>
        <div className="space-y-4">
          <div className="flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" onClick={() => setStars(n)} aria-label={`${n} star${n > 1 ? "s" : ""}`}
                className={cn("text-4xl transition-transform", n <= stars ? "scale-110" : "opacity-30 grayscale")}>
                ⭐
              </button>
            ))}
          </div>
          <Badge className="mx-auto block w-fit bg-brand-50 text-brand-700">{rider?.name ?? "Your rider"}</Badge>
          <Textarea rows={3} label="Review (optional)" placeholder="How was the delivery?"
            value={review} onChange={(e) => setReview(e.target.value)} />
        </div>
      </Modal>
    </div>
  );
}
