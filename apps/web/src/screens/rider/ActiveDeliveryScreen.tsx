// ============================================================
// CargoNepal — Active delivery workflow (spec §9, §14, §15, §16)
// ============================================================
// The rider's live job: map, status-driven next action, QR pickup,
// proof-of-delivery, COD, contacts and status history.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import {
  Button, Card, Badge, Input, Spinner, ErrorState, Skeleton,
  Modal, StatusBadge, Toggle, useToast,
} from "@/components/ui";
import { MapView } from "@/components/MapView";
import { useAuth } from "@/core/hooks/useAuth";
import { useGeolocation } from "@/core/hooks/useGeolocation";
import { useOrderRealtime, useOrderTracking } from "@/core/hooks/useRealtime";
import { fetchOrder, fetchOrderHistory, updateOrderStatus } from "@/services/orders/ordersService";
import { getRoute } from "@/services/maps/mapsService";
import { compressImage, uploadFile } from "@/services/storage/storageService";
import { invoke } from "@/services/supabaseClient";
import { isConfigured } from "@/core/config/env";
import { ORDER_STATUS_LABELS, PARCEL_CATEGORIES } from "@/core/constants";
import { cn, formatDateTime, formatKm, formatNPR } from "@/core/utils";
import type { GeoPoint, Order, OrderStatus, OrderStatusHistory } from "@/models/types";

const PARCEL_LABEL: Record<string, string> = Object.fromEntries(
  PARCEL_CATEGORIES.map((c) => [c.value, `${c.icon} ${c.label}`]),
);

type NextAction =
  | { kind: "status"; label: string; next: OrderStatus; captureGps: boolean }
  | { kind: "qr"; label: string }
  | { kind: "pod"; label: string }
  | null;

function nextActionFor(status: OrderStatus): NextAction {
  switch (status) {
    case "RIDER_ASSIGNED":
    case "RIDER_ACCEPTED":
      return { kind: "status", label: "Start trip to pickup", next: "RIDER_ON_THE_WAY_TO_PICKUP", captureGps: false };
    case "RIDER_ON_THE_WAY_TO_PICKUP":
      return { kind: "status", label: "Arrived at pickup", next: "ARRIVED_AT_PICKUP", captureGps: true };
    case "ARRIVED_AT_PICKUP":
      return { kind: "qr", label: "Scan QR to pick up" };
    case "PARCEL_PICKED_UP":
      return { kind: "status", label: "Start delivery", next: "ON_THE_WAY_TO_DESTINATION", captureGps: false };
    case "ON_THE_WAY_TO_DESTINATION":
      return { kind: "status", label: "Arrived at destination", next: "ARRIVED_AT_DESTINATION", captureGps: true };
    case "ARRIVED_AT_DESTINATION":
      return { kind: "pod", label: "Complete delivery" };
    default:
      return null;
  }
}

export default function ActiveDeliveryScreen() {
  const { orderId } = useParams<{ orderId: string }>();
  const { user, riderProfile } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const geo = useGeolocation();

  const [order, setOrder] = useState<Order | null>(null);
  const [history, setHistory] = useState<OrderStatusHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [route, setRoute] = useState<GeoPoint[]>([]);
  const [actionLoading, setActionLoading] = useState(false);

  const loadHistory = useCallback(async () => {
    if (!orderId || !isConfigured.supabase) return;
    try { setHistory(await fetchOrderHistory(orderId)); } catch { /* ignore */ }
  }, [orderId]);

  // Live order updates.
  useOrderRealtime(orderId ?? null, (o) => { setOrder(o); void loadHistory(); });
  const { latest } = useOrderTracking(orderId ?? null);

  const loadOrder = useCallback(async () => {
    if (!orderId || !isConfigured.supabase) { setLoading(false); return; }
    setLoading(true);
    try {
      const o = await fetchOrder(orderId);
      if (!o) { setNotFound(true); setLoading(false); return; }
      setOrder(o);
      await loadHistory();
      const r = await getRoute({ lat: o.pickup_lat, lng: o.pickup_lng }, { lat: o.dropoff_lat, lng: o.dropoff_lng });
      if (r) setRoute(r.path);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [orderId, loadHistory]);

  useEffect(() => { void loadOrder(); }, [loadOrder]);

  // Rider marker position: live tracking point, else profile, else null.
  const riderPos: GeoPoint | null =
    latest ? { lat: latest.lat, lng: latest.lng }
    : riderProfile?.current_lat != null && riderProfile?.current_lng != null
      ? { lat: riderProfile.current_lat, lng: riderProfile.current_lng }
      : null;

  // ---- QR scanning ----
  const [qrOpen, setQrOpen] = useState(false);
  const [qrBusy, setQrBusy] = useState(false);
  const [manualToken, setManualToken] = useState("");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [pickupVerified, setPickupVerified] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    if (!qrOpen) return;
    let cancelled = false;
    setCameraError(null);
    const scanner = new Html5Qrcode("cn-qr-reader");
    scannerRef.current = scanner;
    scanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: 250 },
      (decoded) => { if (!cancelled) void handleToken(decoded); },
      () => { /* per-frame scan errors are expected; ignore */ },
    ).catch(() => {
      if (!cancelled) setCameraError("Camera unavailable. Enter the token manually below.");
    });
    return () => {
      cancelled = true;
      const s = scannerRef.current;
      if (s) { s.stop().then(() => s.clear()).catch(() => { /* already stopped */ }); scannerRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrOpen]);

  function parseToken(raw: string): string {
    try {
      const parsed = JSON.parse(raw) as { t?: string };
      if (parsed && typeof parsed.t === "string") return parsed.t;
    } catch { /* not JSON — treat raw as token */ }
    return raw.trim();
  }

  async function handleToken(raw: string) {
    const token = parseToken(raw);
    if (!token) { toast("Empty QR code.", "error"); return; }
    setQrBusy(true);
    try {
      await invoke("qr-verify", { body: { qr_token: token, event: "pickup" } });
      setPickupVerified(true);
      setQrOpen(false);
      setManualToken("");
      await advance("PARCEL_PICKED_UP", true);
      toast("Parcel picked up!", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "QR verification failed.", "error");
    } finally {
      setQrBusy(false);
    }
  }

  // ---- Proof of delivery ----
  const [podOpen, setPodOpen] = useState(false);
  const [podName, setPodName] = useState("");
  const [podPhone, setPodPhone] = useState("");
  const [podOtp, setPodOtp] = useState("");
  const [podPhoto, setPodPhoto] = useState<File | null>(null);
  const [podAttest, setPodAttest] = useState(false);
  const [podBusy, setPodBusy] = useState(false);
  const [podError, setPodError] = useState<string | null>(null);

  function openPod() {
    if (!order) return;
    setPodName(order.receiver_name ?? "");
    setPodPhone(order.receiver_phone ?? "");
    setPodOtp("");
    setPodPhoto(null);
    setPodAttest(false);
    setPodError(null);
    setPodOpen(true);
  }

  async function submitPod() {
    if (!order || !user) return;
    setPodError(null);
    if (!podName.trim()) return setPodError("Receiver name is required.");
    if (!podPhoto) return setPodError("Please capture a delivery photo.");
    if (!podAttest) return setPodError("Please confirm the delivery attestation.");
    if (order.requires_otp && !podOtp.trim()) return setPodError("OTP is required for this high-value delivery.");

    setPodBusy(true);
    try {
      const compressed = await compressImage(podPhoto);
      const { path, error: upErr } = await uploadFile("proof-of-delivery", user.id, compressed, "pod");
      if (upErr) throw new Error(upErr);
      const pos = await geo.request(false);
      await invoke("proof-of-delivery", {
        body: {
          order_id: order.id,
          photo_path: path,
          receiver_name: podName.trim(),
          receiver_phone: podPhone.trim() || null,
          otp: order.requires_otp ? podOtp.trim() : undefined,
          qr_verified: pickupVerified,
          lat: pos?.lat,
          lng: pos?.lng,
        },
      });
      setPodOpen(false);
      toast("Delivery completed! 🎉", "success");
      navigate("/rider/deliveries");
    } catch (err) {
      setPodError(err instanceof Error ? err.message : "Could not submit proof of delivery.");
    } finally {
      setPodBusy(false);
    }
  }

  async function advance(status: OrderStatus, captureGps: boolean) {
    if (!order) return;
    setActionLoading(true);
    try {
      let loc: GeoPoint | undefined;
      if (captureGps) {
        const pos = await geo.request(false);
        if (pos) loc = pos;
      }
      await updateOrderStatus(order.id, status, loc);
      const fresh = await fetchOrder(order.id);
      if (fresh) setOrder(fresh);
      await loadHistory();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not update status.", "error");
    } finally {
      setActionLoading(false);
    }
  }

  function onNextAction(a: NonNullable<NextAction>) {
    if (a.kind === "status") void advance(a.next, a.captureGps);
    else if (a.kind === "qr") setQrOpen(true);
    else if (a.kind === "pod") openPod();
  }

  // ---- render guards ----
  if (!isConfigured.supabase) {
    return (
      <div className="py-8">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Supabase isn't configured yet. <Link className="underline font-semibold" to="/setup">Open the setup guide</Link>.
        </div>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="space-y-4 py-2">
        <Skeleton className="h-48 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </div>
    );
  }
  if (notFound || !order) {
    return <ErrorState title="Order not found" message="This delivery doesn't exist or was removed." onRetry={() => void loadOrder()} />;
  }
  if (order.rider_id !== user?.id) {
    return <ErrorState title="Not your delivery" message="You are not the assigned rider for this order." />;
  }

  const pickup: GeoPoint = { lat: order.pickup_lat, lng: order.pickup_lng };
  const dropoff: GeoPoint = { lat: order.dropoff_lat, lng: order.dropoff_lng };
  const markers = [
    { point: pickup, type: "pickup" as const, label: "Pickup" },
    { point: dropoff, type: "dropoff" as const, label: "Drop-off" },
    ...(riderPos ? [{ point: riderPos, type: "rider" as const, label: "You" }] : []),
  ];
  const isCancelled = order.status === "CANCELLED" || order.status === "FAILED" || order.status === "RETURNED";
  const isDelivered = order.status === "DELIVERED";
  const action = isCancelled || isDelivered ? null : nextActionFor(order.status);
  const dirBase = "https://www.google.com/maps/dir/?api=1";
  const originParam = riderPos ? `&origin=${riderPos.lat},${riderPos.lng}` : "";

  return (
    <div className="space-y-4">
      {/* Cancelled banner */}
      {isCancelled && (
        <div className="rounded-xl border border-accent-200 bg-accent-50 p-4 text-sm text-accent-800">
          <div className="font-semibold">This order was {ORDER_STATUS_LABELS[order.status].toLowerCase()}.</div>
          <p className="mt-1">No further action is needed.</p>
          <Link to="/rider/deliveries" className="mt-2 inline-block font-semibold underline">Back to deliveries</Link>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="font-mono text-xs text-ink-400">{order.order_code ?? order.id.slice(0, 8)}</div>
          <h1 className="text-lg font-bold text-ink-900">Active delivery</h1>
        </div>
        <StatusBadge status={order.status} />
      </div>

      {/* Map */}
      <div className="h-52 overflow-hidden rounded-2xl border border-ink-100">
        <MapView markers={markers} route={route} fitMarkers center={pickup} zoom={13} className="h-full w-full" />
      </div>

      {/* COD / collect panel (spec §16) */}
      {order.is_cod && (
        <Card className={cn("p-4", isDelivered ? "border-green-200 bg-green-50/60" : "border-amber-200 bg-amber-50/60")}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wide text-ink-500">Cash on delivery</div>
              <div className="text-2xl font-bold text-amber-700">{isDelivered ? "Collected" : `Collect ${formatNPR(order.cod_amount)}`}</div>
            </div>
            <span className="text-3xl">{isDelivered ? "✅" : "💵"}</span>
          </div>
          {isDelivered && (
            <p className="mt-2 text-xs text-ink-500">COD amount recorded and added to your settlement balance.</p>
          )}
        </Card>
      )}

      {/* Contacts + addresses */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <Badge className="bg-brand-100 text-brand-800">Pickup</Badge>
            <a
              href={`${dirBase}&destination=${pickup.lat},${pickup.lng}${originParam}`}
              target="_blank" rel="noreferrer"
              className="cn-btn-outline px-3 py-1.5 text-xs"
            >Navigate</a>
          </div>
          <p className="mt-2 text-sm text-ink-700">{order.pickup_address}</p>
          {order.pickup_contact_name && (
            <div className="mt-2 text-sm">
              <span className="text-ink-500">{order.pickup_contact_name}</span>
              {order.pickup_contact_phone && (
                <a href={`tel:${order.pickup_contact_phone}`} className="ml-2 font-semibold text-brand-600">
                  📞 {order.pickup_contact_phone}
                </a>
              )}
            </div>
          )}
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <Badge className="bg-accent-100 text-accent-800">Drop-off</Badge>
            <a
              href={`${dirBase}&destination=${dropoff.lat},${dropoff.lng}${originParam}`}
              target="_blank" rel="noreferrer"
              className="cn-btn-outline px-3 py-1.5 text-xs"
            >Navigate</a>
          </div>
          <p className="mt-2 text-sm text-ink-700">{order.dropoff_address}</p>
          <div className="mt-2 text-sm">
            <span className="text-ink-500">{order.receiver_name}</span>
            {order.receiver_phone && (
              <a href={`tel:${order.receiver_phone}`} className="ml-2 font-semibold text-brand-600">
                📞 {order.receiver_phone}
              </a>
            )}
          </div>
        </Card>
      </div>

      {/* Parcel summary */}
      <Card className="p-4">
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div><div className="text-[11px] uppercase text-ink-400">Parcel</div><div className="text-ink-700">{PARCEL_LABEL[order.parcel_category] ?? order.parcel_category}</div></div>
          <div><div className="text-[11px] uppercase text-ink-400">Weight</div><div className="text-ink-700">{order.weight_kg} kg</div></div>
          <div><div className="text-[11px] uppercase text-ink-400">Distance</div><div className="text-ink-700">{formatKm(order.distance_km)}</div></div>
          <div><div className="text-[11px] uppercase text-ink-400">You earn</div><div className="font-semibold text-green-600">{formatNPR(order.rider_earning)}</div></div>
        </div>
        {order.special_instructions && (
          <p className="mt-3 rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-600">📝 {order.special_instructions}</p>
        )}
        {order.requires_otp && (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">🔒 High-value order — receiver OTP required at delivery.</p>
        )}
      </Card>

      {/* Next action */}
      {!isCancelled && !isDelivered && (
        <div className="sticky bottom-20 z-10">
          {action ? (
            <Button size="lg" className="w-full shadow-pop" loading={actionLoading} onClick={() => onNextAction(action)}>
              {action.label} →
            </Button>
          ) : (
            <div className="rounded-xl bg-ink-100 px-4 py-3 text-center text-sm text-ink-500">
              Waiting for the next step…
            </div>
          )}
        </div>
      )}
      {isDelivered && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-center">
          <div className="text-2xl">🎉</div>
          <div className="mt-1 font-semibold text-green-700">Delivered</div>
          <Link to="/rider/deliveries" className="mt-2 inline-block text-sm font-semibold text-green-700 underline">View all deliveries</Link>
        </div>
      )}

      {/* Status history */}
      <Card className="p-4">
        <h3 className="mb-3 font-semibold text-ink-800">Tracking history</h3>
        {history.length === 0 ? (
          <p className="text-sm text-ink-500">No status updates yet.</p>
        ) : (
          <ol className="relative space-y-4 border-l border-ink-200 pl-5">
            {[...history].reverse().map((h) => (
              <li key={h.id} className="relative">
                <span className="absolute -left-[26px] top-1 h-3 w-3 rounded-full bg-brand-600 ring-2 ring-white" />
                <div className="text-sm font-medium text-ink-800">{ORDER_STATUS_LABELS[h.status] ?? h.status}</div>
                <div className="text-xs text-ink-400">{formatDateTime(h.created_at)}</div>
                {h.note && <div className="mt-0.5 text-xs text-ink-500">{h.note}</div>}
              </li>
            ))}
          </ol>
        )}
      </Card>

      {/* QR modal */}
      <Modal open={qrOpen} onClose={() => { if (!qrBusy) setQrOpen(false); }} title="Scan pickup QR">
        <p className="text-sm text-ink-600">Point the camera at the sender's QR code to confirm parcel pickup.</p>
        <div id="cn-qr-reader" className="mt-3 overflow-hidden rounded-xl" />
        {cameraError && <p className="mt-2 text-xs text-accent-600">{cameraError}</p>}
        <div className="mt-4 border-t border-ink-100 pt-4">
          <Input
            label="Or enter token manually"
            value={manualToken}
            onChange={(e) => setManualToken(e.target.value)}
            placeholder="QR token"
          />
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setQrOpen(false)} disabled={qrBusy}>Cancel</Button>
            <Button loading={qrBusy} disabled={!manualToken.trim()} onClick={() => void handleToken(manualToken)}>
              Verify
            </Button>
          </div>
        </div>
        {qrBusy && <div className="mt-3 flex justify-center"><Spinner className="h-5 w-5 text-brand-600" /></div>}
      </Modal>

      {/* Proof of delivery modal (spec §15) */}
      <Modal open={podOpen} onClose={() => { if (!podBusy) setPodOpen(false); }} title="Proof of delivery" size="lg">
        <div className="space-y-4">
          {podError && <div className="rounded-lg border border-accent-200 bg-accent-50 px-3 py-2 text-sm text-accent-700">{podError}</div>}

          <div>
            <span className="cn-label">Delivery photo *</span>
            <label className="flex w-full cursor-pointer items-center justify-between rounded-xl border border-dashed border-ink-300 bg-ink-50 px-4 py-3 text-sm text-ink-600">
              <span className="truncate">{podPhoto ? podPhoto.name : "Tap to capture / choose photo"}</span>
              <span className="ml-2 text-lg">{podPhoto ? "✅" : "📷"}</span>
              <input type="file" accept="image/*" capture="environment" className="hidden"
                onChange={(e) => setPodPhoto(e.target.files?.[0] ?? null)} />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Receiver name *" value={podName} onChange={(e) => setPodName(e.target.value)} />
            <Input label="Receiver phone" type="tel" value={podPhone} onChange={(e) => setPodPhone(e.target.value)} />
          </div>

          {order.requires_otp && (
            <Input
              label="Receiver OTP *"
              value={podOtp}
              onChange={(e) => setPodOtp(e.target.value)}
              inputMode="numeric"
              hint="Ask the receiver for the 4–6 digit OTP shown in their app."
            />
          )}

          <label className="flex items-start gap-3 rounded-xl bg-ink-50 p-3">
            <span className="mt-0.5"><Toggle checked={podAttest} onChange={setPodAttest} label="Attest delivery" /></span>
            <span className="text-xs text-ink-600">
              I confirm the parcel was handed to the receiver in good condition and, where applicable, the
              COD amount of <strong>{formatNPR(order.cod_amount)}</strong> was collected.
            </span>
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setPodOpen(false)} disabled={podBusy}>Cancel</Button>
          <Button loading={podBusy} onClick={() => void submitPod()}>Submit & complete</Button>
        </div>
      </Modal>
    </div>
  );
}
