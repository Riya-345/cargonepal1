// ============================================================
// CargoNepal — Customer Home (spec §5)
// ============================================================
import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Button, Card, SkeletonList, EmptyState, ErrorState, Modal,
  Input, StatusBadge, Badge,
} from "@/components/ui";
import { MapView } from "@/components/MapView";
import { useAuth } from "@/core/hooks/useAuth";
import { useGeolocation } from "@/core/hooks/useGeolocation";
import { fetchOrders } from "@/services/orders/ordersService";
import { supabase } from "@/services/supabaseClient";
import { isConfigured, NEPAL_CENTER } from "@/core/config/env";
import { cn, formatNPR, timeAgo } from "@/core/utils";
import type { Address, Order } from "@/models/types";

function SetupBanner() {
  return (
    <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      Supabase is not configured yet, so live data is unavailable.{" "}
      <Link to="/setup" className="font-semibold underline">Open the setup guide</Link>
    </div>
  );
}

export default function HomeScreen() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const geo = useGeolocation();

  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [trackOpen, setTrackOpen] = useState(false);
  const [trackCode, setTrackCode] = useState("");
  const [trackError, setTrackError] = useState<string | null>(null);
  const [trackBusy, setTrackBusy] = useState(false);
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);

  const load = useCallback(async () => {
    if (!isConfigured.supabase || !user?.id) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const [addrRes, ords] = await Promise.all([
        supabase.from("addresses").select("*").eq("user_id", user.id)
          .order("is_default", { ascending: false }).order("label").limit(3),
        fetchOrders("all"),
      ]);
      if (addrRes.error) throw new Error(addrRes.error.message);
      setAddresses((addrRes.data as Address[]) ?? []);
      setOrders(ords.slice(0, 3));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load your dashboard.");
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    let mounted = true;
    void geo.request(true).then((p) => { if (mounted && p) setLocation(p); });
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openTrackModal() {
    setTrackOpen(true);
    setTrackError(null);
    setTrackCode("");
    if (isConfigured.supabase) {
      fetchOrders("active").then(setActiveOrders).catch(() => setActiveOrders([]));
    }
  }

  async function handleTrackByCode() {
    const code = trackCode.trim();
    if (!code) { setTrackError("Enter an order code, e.g. CN-XXXXXX."); return; }
    setTrackBusy(true);
    setTrackError(null);
    try {
      const all = await fetchOrders("all");
      const match = all.find((o) => (o.order_code ?? "").toLowerCase() === code.toLowerCase());
      if (!match) { setTrackError(`No order found with code "${code}".`); return; }
      navigate(`/customer/track/${match.id}`);
    } catch (e) {
      setTrackError(e instanceof Error ? e.message : "Could not look up that order.");
    } finally {
      setTrackBusy(false);
    }
  }

  const firstName = user?.full_name?.split(" ")[0] ?? "there";

  return (
    <div className="pb-4 space-y-6 animate-fade-in">
      {!isConfigured.supabase && <SetupBanner />}

      {/* Greeting */}
      <header>
        <p className="text-sm text-ink-500">Namaste, {firstName} 👋</p>
        <h1 className="mt-1 font-display text-2xl font-bold leading-tight text-ink-900">
          Where should we deliver your parcel?
        </h1>
      </header>

      {/* Primary actions */}
      <div className="grid grid-cols-3 gap-3">
        <button onClick={() => navigate("/customer/book")}
          className="cn-card flex flex-col items-center gap-2 p-4 text-brand-700 hover:shadow-pop transition">
          <span className="text-3xl">📦</span>
          <span className="text-sm font-semibold">Send Parcel</span>
        </button>
        <button onClick={openTrackModal}
          className="cn-card flex flex-col items-center gap-2 p-4 text-accent-600 hover:shadow-pop transition">
          <span className="text-3xl">🛰️</span>
          <span className="text-sm font-semibold">Track Parcel</span>
        </button>
        <button onClick={() => navigate("/customer/orders")}
          className="cn-card flex flex-col items-center gap-2 p-4 text-ink-700 hover:shadow-pop transition">
          <span className="text-3xl">🗂️</span>
          <span className="text-sm font-semibold">My Orders</span>
        </button>
      </div>

      {/* Promo strip */}
      <div className="rounded-2xl bg-gradient-to-r from-brand-600 to-brand-800 p-4 text-white shadow-card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">New to CargoNepal?</p>
            <p className="text-xs text-brand-100 mt-0.5">
              Use code <span className="rounded bg-white/20 px-1.5 py-0.5 font-mono font-bold">WELCOME20</span> for 20% off your first delivery.
            </p>
          </div>
          <span className="text-3xl">🎉</span>
        </div>
      </div>

      {/* Current location + map preview */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-bold text-ink-900">Your location</h2>
          <Button variant="ghost" size="sm" loading={geo.status === "locating"}
            onClick={async () => { const p = await geo.request(true); if (p) setLocation(p); }}>
            Refresh
          </Button>
        </div>
        <p className="text-sm text-ink-500">
          {geo.status === "granted" && location
            ? `Located near ${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}${geo.accuracy ? ` (±${Math.round(geo.accuracy)} m)` : ""}`
            : geo.error ?? "Locating you…"}
        </p>
        <div className="h-44 w-full rounded-2xl overflow-hidden border border-ink-100">
          <MapView center={location ?? NEPAL_CENTER} zoom={14}
            markers={location ? [{ point: location, type: "generic", label: "You are here" }] : []} />
        </div>
        <p className="text-xs text-ink-400">
          ⚡ Typical delivery within the valley takes 45–90 minutes once a rider picks up your parcel.
        </p>
      </section>

      {/* Saved addresses */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-bold text-ink-900">Saved addresses</h2>
          <Link to="/customer/addresses" className="text-sm font-medium text-brand-600 hover:underline">Manage</Link>
        </div>
        {loading ? (
          <SkeletonList rows={2} />
        ) : addresses.length === 0 ? (
          <Card className="p-4 text-sm text-ink-500">
            No saved addresses yet.{" "}
            <Link to="/customer/addresses" className="font-medium text-brand-600 hover:underline">Add one</Link>{" "}
            to book deliveries faster.
          </Card>
        ) : (
          <div className="space-y-2">
            {addresses.map((a) => (
              <Card key={a.id} className="flex items-center gap-3 p-3"
                onClick={() => navigate("/customer/book", { state: { address: a } })}>
                <span className="text-xl">{a.label.toLowerCase().includes("home") ? "🏠" : a.label.toLowerCase().includes("work") || a.label.toLowerCase().includes("office") ? "🏢" : "📍"}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink-800">{a.label}</p>
                  <p className="truncate text-xs text-ink-500">{a.address_line1 ?? `${a.lat.toFixed(4)}, ${a.lng.toFixed(4)}`}{a.city ? `, ${a.city}` : ""}</p>
                </div>
                {a.is_default && <Badge className="bg-brand-100 text-brand-800">Default</Badge>}
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Recent orders */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-bold text-ink-900">Recent orders</h2>
          <Link to="/customer/orders" className="text-sm font-medium text-brand-600 hover:underline">See all</Link>
        </div>
        {loading ? (
          <SkeletonList rows={3} />
        ) : error ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : orders.length === 0 ? (
          <EmptyState icon="📦" title="No orders yet"
            message="Book your first parcel delivery in under a minute."
            action={<Button onClick={() => navigate("/customer/book")}>Send a parcel</Button>} />
        ) : (
          <div className="space-y-2">
            {orders.map((o) => (
              <Card key={o.id} className="p-4" onClick={() => navigate(`/customer/orders/${o.id}`)}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink-900">
                      {o.order_code ?? "Order"} <span className="font-normal text-ink-400">· {timeAgo(o.created_at)}</span>
                    </p>
                    <p className="mt-0.5 truncate text-xs text-ink-500">
                      {o.pickup_address} → {o.dropoff_address}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <StatusBadge status={o.status} />
                    <span className="text-sm font-bold text-ink-800">{formatNPR(o.total_amount)}</span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Track parcel modal */}
      <Modal open={trackOpen} onClose={() => setTrackOpen(false)} title="Track a parcel" size="sm">
        <div className="space-y-4">
          <div>
            <Input label="Order code" placeholder="e.g. CN-4F9K2A" value={trackCode}
              onChange={(e) => setTrackCode(e.target.value)} error={trackError ?? undefined}
              onKeyDown={(e) => e.key === "Enter" && void handleTrackByCode()} />
            <Button className="mt-3 w-full" loading={trackBusy} onClick={() => void handleTrackByCode()}>
              Find my parcel
            </Button>
          </div>
          {activeOrders.length > 0 && (
            <div className="border-t border-ink-100 pt-3">
              <p className="cn-label">Active deliveries</p>
              <div className="space-y-2">
                {activeOrders.map((o) => (
                  <button key={o.id}
                    onClick={() => navigate(`/customer/track/${o.id}`)}
                    className={cn("flex w-full items-center justify-between rounded-xl border border-ink-200 px-3 py-2.5 text-left hover:bg-ink-50")}>
                    <span className="text-sm font-medium text-ink-800">{o.order_code ?? "Order"}</span>
                    <StatusBadge status={o.status} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
