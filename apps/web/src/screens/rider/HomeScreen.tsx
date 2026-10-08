// ============================================================
// CargoNepal — Rider home / dashboard (spec §11, §12)
// ============================================================
// Online toggle + GPS broadcast, active delivery, live incoming
// dispatch requests, and today's earning stats.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Button, Card, Toggle, Spinner, Badge, EmptyState, ErrorState,
  SkeletonList, Modal, useToast,
} from "@/components/ui";
import { MapView } from "@/components/MapView";
import { useAuth } from "@/core/hooks/useAuth";
import { useGeolocation, makePositionGetter } from "@/core/hooks/useGeolocation";
import { useRiderLocationSender } from "@/core/hooks/useRealtime";
import { supabase, invoke } from "@/services/supabaseClient";
import { respondToDispatch } from "@/services/orders/ordersService";
import { isConfigured } from "@/core/config/env";
import { formatNPR, formatKm, haversineKm, cn } from "@/core/utils";
import { PARCEL_CATEGORIES } from "@/core/constants";
import type { Order, RiderDispatch } from "@/models/types";

type DispatchRow = RiderDispatch & { orders: Order | Order[] | null };

interface TodayStats { net: number; deliveries: number }
interface WeekStats { net: number }

const PARCEL_ICON: Record<string, string> = Object.fromEntries(
  PARCEL_CATEGORIES.map((c) => [c.value, c.icon]),
);

function firstOrder(d: DispatchRow): Order | null {
  if (!d.orders) return null;
  return Array.isArray(d.orders) ? d.orders[0] ?? null : d.orders;
}

function StatTile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="cn-card p-4 text-center">
      <div className={cn("text-xl font-bold", accent ? "text-green-600" : "text-ink-900")}>{value}</div>
      <div className="mt-0.5 text-[11px] uppercase tracking-wide text-ink-400">{label}</div>
    </div>
  );
}

export default function HomeScreen() {
  const { user, riderProfile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const geo = useGeolocation();

  const getPosition = useMemo(() => makePositionGetter(), []);
  const [online, setOnline] = useState(riderProfile?.availability === "online");
  const [geoHelpOpen, setGeoHelpOpen] = useState(false);
  const [toggling, setToggling] = useState(false);

  const [dispatches, setDispatches] = useState<DispatchRow[]>([]);
  const [loadingDispatch, setLoadingDispatch] = useState(true);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const [today, setToday] = useState<TodayStats | null>(null);
  const [week, setWeek] = useState<WeekStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  const isBusy = riderProfile?.availability === "busy";
  const broadcasting = online || isBusy;

  // GPS broadcast loop while online/busy (spec §12).
  useRiderLocationSender(broadcasting && isConfigured.supabase, getPosition);

  // Keep local toggle in sync with profile changes.
  useEffect(() => {
    if (riderProfile) setOnline(riderProfile.availability === "online");
  }, [riderProfile?.availability, riderProfile]);

  // 1s ticker for countdowns.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const loadDispatches = useCallback(async () => {
    if (!user || !isConfigured.supabase) { setLoadingDispatch(false); return; }
    const { data, error } = await supabase
      .from("rider_dispatches").select("*, orders(*)")
      .eq("rider_id", user.id).eq("status", "sent")
      .order("sent_at", { ascending: false });
    if (error) { setDispatchError(error.message); setLoadingDispatch(false); return; }
    const rows = (data as DispatchRow[]) ?? [];
    const live = rows.filter((r) => new Date(r.expires_at).getTime() > Date.now());
    setDispatches(live);
    setDispatchError(null);
    setLoadingDispatch(false);
  }, [user]);

  const loadStats = useCallback(async () => {
    if (!isConfigured.supabase) { setLoadingStats(false); return; }
    try {
      const res = await invoke<{ today: TodayStats; week: WeekStats }>("rider-earnings", { method: "GET" });
      setToday(res.today ?? null);
      setWeek(res.week ?? null);
    } catch {
      setToday(null); setWeek(null);
    } finally {
      setLoadingStats(false);
    }
  }, []);

  useEffect(() => { void loadDispatches(); }, [loadDispatches]);
  useEffect(() => { void loadStats(); }, [loadStats]);

  // Realtime: new dispatch requests for this rider.
  useEffect(() => {
    if (!user || !isConfigured.supabase) return;
    const channel = supabase
      .channel(`rider-dispatch:${user.id}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "rider_dispatches", filter: `rider_id=eq.${user.id}` },
        () => { void loadDispatches(); toast("New delivery request!", "info"); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loadDispatches]);

  async function handleToggle(next: boolean) {
    if (!user) return;
    if (isBusy) { toast("Finish your active delivery before going offline.", "info"); return; }
    setToggling(true);
    try {
      if (next) {
        const pos = await geo.request(false); // no Kathmandu fallback — real GPS required
        if (!pos) {
          setGeoHelpOpen(true);
          setToggling(false);
          return;
        }
        await supabase.from("rider_profiles").update({
          availability: "online",
          current_lat: pos.lat,
          current_lng: pos.lng,
          location_updated_at: new Date().toISOString(),
        }).eq("id", user.id);
        setOnline(true);
        toast("You're online. Request away!", "success");
      } else {
        await supabase.from("rider_profiles").update({ availability: "offline" }).eq("id", user.id);
        setOnline(false);
        toast("You're offline.", "info");
      }
      await refreshProfile();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not change availability.", "error");
    } finally {
      setToggling(false);
    }
  }

  async function respond(d: DispatchRow, action: "accept" | "reject") {
    const order = firstOrder(d);
    if (!order) return;
    setActingId(d.id);
    try {
      await respondToDispatch(d.order_id, action);
      setDispatches((prev) => prev.filter((x) => x.id !== d.id));
      if (action === "accept") {
        toast("Delivery accepted!", "success");
        await refreshProfile();
        navigate(`/rider/active/${d.order_id}`);
      } else {
        toast("Request rejected.", "info");
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not respond.", "error");
    } finally {
      setActingId(null);
    }
  }

  if (!isConfigured.supabase) {
    return (
      <div className="py-8">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Supabase isn't configured yet. <Link className="underline font-semibold" to="/setup">Open the setup guide</Link>.
        </div>
      </div>
    );
  }

  const activeOrderId = riderProfile?.active_order_id ?? null;

  return (
    <div className="space-y-5">
      {/* Online / Offline toggle */}
      <Card className={cn("p-5 transition", online || isBusy ? "bg-gradient-to-br from-green-50 to-white border-green-200" : "")}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-ink-500">You are</div>
            <div className={cn("text-2xl font-bold", isBusy ? "text-amber-600" : online ? "text-green-600" : "text-ink-800")}>
              {isBusy ? "On a delivery" : online ? "Online" : "Offline"}
            </div>
            <div className="mt-0.5 text-xs text-ink-400">
              {isBusy ? "Complete your active order first." : online ? "Receiving delivery requests." : "Go online to receive requests."}
            </div>
          </div>
          <div className="flex flex-col items-center gap-2">
            <Toggle checked={online} onChange={handleToggle} disabled={toggling || isBusy} label="Go online" />
            {toggling && <Spinner className="h-4 w-4 text-brand-600" />}
          </div>
        </div>
        {online && !isBusy && (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-white/70 px-3 py-2 text-xs text-ink-500">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
            </span>
            Broadcasting your live location every 5s.
          </div>
        )}
      </Card>

      {/* Active delivery (busy) */}
      {isBusy && activeOrderId && (
        <Card className="border-brand-200 bg-brand-50/50 p-5">
          <div className="flex items-center justify-between">
            <div>
              <Badge className="bg-amber-100 text-amber-800">Active delivery</Badge>
              <div className="mt-2 text-sm text-ink-600">You have a parcel in progress.</div>
            </div>
            <span className="text-3xl">🛵</span>
          </div>
          <Button className="mt-4 w-full" onClick={() => navigate(`/rider/active/${activeOrderId}`)}>
            Continue delivery →
          </Button>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {loadingStats ? (
          <>
            <div className="cn-skeleton h-[76px] rounded-2xl" />
            <div className="cn-skeleton h-[76px] rounded-2xl" />
            <div className="cn-skeleton h-[76px] rounded-2xl" />
            <div className="cn-skeleton h-[76px] rounded-2xl" />
          </>
        ) : (
          <>
            <StatTile label="Today" value={formatNPR(today?.net ?? 0)} accent />
            <StatTile label="Deliveries today" value={String(today?.deliveries ?? 0)} />
            <StatTile label="This week" value={formatNPR(week?.net ?? 0)} />
            <StatTile label="Rating" value={riderProfile ? riderProfile.rating_avg.toFixed(1) + " ★" : "—"} />
          </>
        )}
      </div>
      {!loadingStats && (
        <div className="grid grid-cols-2 gap-3">
          <StatTile label="Completed trips" value={String(riderProfile?.total_deliveries ?? 0)} />
          <StatTile label="Wallet" value={formatNPR(riderProfile?.wallet_balance ?? 0)} accent />
        </div>
      )}

      {/* Incoming requests */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold text-ink-800">Delivery requests</h2>
          {online && !isBusy && <Spinner className="h-4 w-4 text-brand-500" />}
        </div>

        {dispatchError ? (
          <ErrorState message={dispatchError} onRetry={() => void loadDispatches()} />
        ) : loadingDispatch ? (
          <SkeletonList rows={2} />
        ) : dispatches.length === 0 ? (
          <EmptyState
            icon={online ? "📡" : "💤"}
            title={online ? "You're online. Waiting for requests…" : "You're offline"}
            message={online ? "New parcel requests will appear here the moment they're dispatched to you." : "Go online to start receiving delivery requests near you."}
          />
        ) : (
          <div className="space-y-3">
            {dispatches.map((d) => {
              const order = firstOrder(d);
              if (!order) return null;
              const secsLeft = Math.max(0, Math.floor((new Date(d.expires_at).getTime() - now) / 1000));
              const pickupKm = d.distance_km
                ?? (riderProfile?.current_lat != null && riderProfile?.current_lng != null
                  ? haversineKm(riderProfile.current_lat, riderProfile.current_lng, order.pickup_lat, order.pickup_lng)
                  : order.distance_km ?? null);
              const catIcon = PARCEL_ICON[order.parcel_category] ?? "📦";
              return (
                <Card key={d.id} className="overflow-hidden">
                  <div className="flex items-center justify-between border-b border-ink-100 bg-ink-50 px-4 py-2">
                    <Badge className="bg-brand-100 text-brand-800">{catIcon} {order.parcel_category.replace("_", " ")}</Badge>
                    <span className={cn("text-xs font-semibold tabular-nums", secsLeft <= 5 ? "text-accent-600" : "text-ink-500")}>
                      ⏱ {secsLeft}s
                    </span>
                  </div>
                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-1 flex flex-col items-center">
                        <span className="h-2.5 w-2.5 rounded-full bg-brand-600" />
                        <span className="my-1 h-6 w-px bg-ink-200" />
                        <span className="h-2.5 w-2.5 rounded-full bg-accent-600" />
                      </div>
                      <div className="flex-1 space-y-2 text-sm">
                        <div>
                          <div className="text-[11px] uppercase text-ink-400">Pickup · {formatKm(pickupKm)} away</div>
                          <div className="truncate text-ink-700">{order.pickup_address}</div>
                        </div>
                        <div>
                          <div className="text-[11px] uppercase text-ink-400">Drop-off</div>
                          <div className="truncate text-ink-700">{order.dropoff_address}</div>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                      <Badge className="bg-green-100 text-green-800">Earn {formatNPR(d.offered_earning ?? order.rider_earning)}</Badge>
                      <Badge className="bg-ink-100 text-ink-700">{order.weight_kg} kg</Badge>
                      {order.is_cod && <Badge className="bg-amber-100 text-amber-800">COD {formatNPR(order.cod_amount)}</Badge>}
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <Button variant="outline" loading={actingId === d.id} disabled={actingId !== null}
                        onClick={() => void respond(d, "reject")}>Reject</Button>
                      <Button loading={actingId === d.id} disabled={actingId !== null}
                        onClick={() => void respond(d, "accept")}>Accept</Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Geolocation help modal (spec §40) */}
      <Modal open={geoHelpOpen} onClose={() => setGeoHelpOpen(false)} title="Location access needed">
        <p className="text-sm text-ink-600">
          CargoNepal needs your precise location to match you with nearby parcels and to track deliveries.
          We couldn't get a GPS fix just now.
        </p>
        <ul className="mt-3 space-y-2 text-sm text-ink-600">
          <li>• Allow location permission for this site in your browser settings.</li>
          <li>• Make sure your device GPS / location services are turned on.</li>
          <li>• Use a browser that supports geolocation (Chrome, Safari, Edge).</li>
          <li>• Move to an area with a clear signal, then try again.</li>
        </ul>
        {geo.error && <p className="mt-3 rounded-lg bg-accent-50 px-3 py-2 text-xs text-accent-700">{geo.error}</p>}
        <div className="mt-5 flex justify-end gap-3">
          <Button variant="outline" onClick={() => setGeoHelpOpen(false)}>Close</Button>
          <Button onClick={async () => { setGeoHelpOpen(false); await handleToggle(true); }}>Try again</Button>
        </div>
      </Modal>

      {/* Mini map when online */}
      {(online || isBusy) && riderProfile?.current_lat != null && riderProfile?.current_lng != null && (
        <div className="h-40 overflow-hidden rounded-2xl border border-ink-100">
          <MapView
            center={{ lat: riderProfile.current_lat, lng: riderProfile.current_lng }}
            zoom={14}
            markers={[{ point: { lat: riderProfile.current_lat, lng: riderProfile.current_lng }, type: "rider", label: "You" }]}
            className="h-full w-full"
          />
        </div>
      )}
    </div>
  );
}
