// ============================================================
// CargoNepal — Admin Live Map (spec §21)
// ============================================================
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/services/supabaseClient";
import { useLiveRiders } from "@/core/hooks/useRealtime";
import { isConfigured, NEPAL_CENTER, DEFAULT_ZOOM } from "@/core/config/env";
import { ACTIVE_ORDER_STATUSES, ORDER_STATUS_LABELS } from "@/core/constants";
import { MapView, type MapMarker } from "@/components/MapView";
import { Button, Card, Badge, StatusBadge, Skeleton, EmptyState, useToast } from "@/components/ui";
import { cn, formatNPR, timeAgo, formatKm } from "@/core/utils";
import type { Order, RiderProfile, User } from "@/models/types";

interface RiderExtra {
  user: Pick<User, "id" | "full_name" | "phone"> | null;
  todayDeliveries: number;
  todayEarnings: number;
}

const LEGEND = [
  { color: "#0f9d58", label: "Rider (online / busy)" },
  { color: "#1f42eb", label: "Pickup point" },
  { color: "#f83232", label: "Drop-off point" },
];

export default function LiveMapScreen() {
  const toast = useToast();
  const enabled = isConfigured.supabase;
  const riders = useLiveRiders(enabled);

  const [activeOrders, setActiveOrders] = useState<Order[]>([]);
  const [riderNames, setRiderNames] = useState<Map<string, Pick<User, "id" | "full_name" | "phone">>>(new Map());
  const [selected, setSelected] = useState<RiderProfile | null>(null);
  const [selectedExtra, setSelectedExtra] = useState<RiderExtra | null>(null);
  const [loadingExtra, setLoadingExtra] = useState(false);
  const [loadingOrders, setLoadingOrders] = useState(true);

  const loadOrders = useCallback(async () => {
    if (!enabled) { setLoadingOrders(false); return; }
    const { data, error } = await supabase.from("orders")
      .select("id, order_code, status, pickup_lat, pickup_lng, pickup_address, dropoff_lat, dropoff_lng, dropoff_address, rider_id, created_at, total_amount")
      .in("status", ACTIVE_ORDER_STATUSES)
      .limit(200);
    if (error) { toast(error.message, "error"); }
    else setActiveOrders((data as Order[]) ?? []);
    setLoadingOrders(false);
  }, [enabled, toast]);

  useEffect(() => {
    void loadOrders();
    const t = setInterval(() => void loadOrders(), 30000);
    return () => clearInterval(t);
  }, [loadOrders]);

  // Resolve rider display names whenever the live rider set changes.
  useEffect(() => {
    if (!enabled || riders.length === 0) return;
    const ids = riders.map((r) => r.id);
    void supabase.from("users").select("id, full_name, phone").in("id", ids).then(({ data }) => {
      if (data) setRiderNames(new Map(data.map((u) => [u.id as string, u as Pick<User, "id" | "full_name" | "phone">])));
    });
  }, [riders, enabled]);

  // When a rider marker is picked, load today's stats for the side panel.
  useEffect(() => {
    if (!selected || !enabled) { setSelectedExtra(null); return; }
    let mounted = true;
    setLoadingExtra(true);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    (async () => {
      const [ordersRes, earnRes, userRes] = await Promise.all([
        supabase.from("orders").select("id", { count: "exact", head: true })
          .eq("rider_id", selected.id).eq("status", "DELIVERED")
          .gte("delivered_at", startOfDay.toISOString()),
        supabase.from("rider_earnings").select("net_earning")
          .eq("rider_id", selected.id).gte("earned_at", startOfDay.toISOString()),
        supabase.from("users").select("id, full_name, phone").eq("id", selected.id).maybeSingle(),
      ]);
      if (!mounted) return;
      const earnings = ((earnRes.data ?? []) as { net_earning: number }[])
        .reduce((s, r) => s + Number(r.net_earning ?? 0), 0);
      setSelectedExtra({
        user: (userRes.data as Pick<User, "id" | "full_name" | "phone">) ?? null,
        todayDeliveries: ordersRes.count ?? 0,
        todayEarnings: earnings,
      });
      setLoadingExtra(false);
    })();
    return () => { mounted = false; };
  }, [selected, enabled]);

  const locatedRiders = riders.filter((r) => r.current_lat != null && r.current_lng != null);

  const markers: MapMarker[] = [
    ...locatedRiders.map((r) => ({
      point: { lat: r.current_lat!, lng: r.current_lng! },
      type: "rider" as const,
      label: riderNames.get(r.id)?.full_name ?? `Rider ${r.id.slice(0, 6)}`,
    })),
    ...activeOrders.map((o) => ({
      point: { lat: o.pickup_lat, lng: o.pickup_lng },
      type: "pickup" as const,
      label: `Pickup · ${o.order_code ?? o.id.slice(0, 6)}`,
    })),
    ...activeOrders.map((o) => ({
      point: { lat: o.dropoff_lat, lng: o.dropoff_lng },
      type: "dropoff" as const,
      label: `Drop · ${o.order_code ?? o.id.slice(0, 6)}`,
    })),
  ];

  if (!isConfigured.supabase) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold text-ink-900">Live Map</h1>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Supabase is not configured. <Link to="/setup" className="font-semibold underline">Run setup</Link> to enable the live map.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Live Map</h1>
          <p className="text-sm text-ink-500">
            {locatedRiders.length} riders on the road · {activeOrders.length} active orders · auto-refreshes every 15s
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {LEGEND.map((l) => (
            <span key={l.label} className="flex items-center gap-1.5 text-xs text-ink-600">
              <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: l.color }} />
              {l.label}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="overflow-hidden p-0 lg:col-span-2">
          {locatedRiders.length === 0 && activeOrders.length === 0 && !loadingOrders ? (
            <div className="h-[70vh]">
              <EmptyState icon="🗺️" title="Nothing live right now"
                message="No online riders or active deliveries at the moment. The map updates automatically as riders come online."
                action={<Button variant="outline" onClick={() => void loadOrders()}>Refresh now</Button>} />
            </div>
          ) : (
            <MapView
              className="h-[70vh] w-full"
              center={NEPAL_CENTER}
              zoom={DEFAULT_ZOOM}
              markers={markers}
              fitMarkers={markers.length > 1}
            />
          )}
        </Card>

        <div className="space-y-4">
          {/* Rider panel — Google Maps markers don't expose click events through
              MapView, so riders are selected from this live list instead. */}
          <Card className="p-5">
            <h3 className="mb-3 text-sm font-semibold text-ink-800">Riders on the road</h3>
            {riders.length === 0 ? (
              <p className="text-sm text-ink-500">No approved riders are online or busy right now.</p>
            ) : (
              <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {riders.map((r) => (
                  <button key={r.id} onClick={() => setSelected(r)}
                    className={cn("flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left transition",
                      selected?.id === r.id ? "border-brand-400 bg-brand-50" : "border-ink-100 hover:border-brand-200")}>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink-800">{riderNames.get(r.id)?.full_name ?? r.id.slice(0, 8)}</p>
                      <p className="text-xs text-ink-500">
                        {r.primary_city ?? "—"} · updated {timeAgo(r.location_updated_at)}
                      </p>
                    </div>
                    <Badge className={r.availability === "busy" ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"}>
                      {r.availability}
                    </Badge>
                  </button>
                ))}
              </div>
            )}
          </Card>

          {selected && (
            <Card className="p-5">
              <div className="mb-3 flex items-start justify-between">
                <h3 className="text-sm font-semibold text-ink-800">
                  {selectedExtra?.user?.full_name ?? riderNames.get(selected.id)?.full_name ?? "Rider"}
                </h3>
                <button onClick={() => setSelected(null)} className="text-ink-400 hover:text-ink-700">×</button>
              </div>
              {loadingExtra || !selectedExtra ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full rounded" />
                  <Skeleton className="h-4 w-3/4 rounded" />
                  <Skeleton className="h-4 w-2/3 rounded" />
                </div>
              ) : (
                <div className="space-y-2 text-sm">
                  <p className="text-ink-600">📞 {selectedExtra.user?.phone ?? "—"}</p>
                  <p className="text-ink-600">
                    Status: <Badge className={selected.availability === "busy" ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"}>{selected.availability}</Badge>
                    <span className="ml-2 text-xs text-ink-500">⭐ {Number(selected.rating_avg).toFixed(1)}</span>
                  </p>
                  <p className="text-ink-600">
                    📍 {selected.current_lat != null && selected.current_lng != null
                      ? `${selected.current_lat.toFixed(5)}, ${selected.current_lng.toFixed(5)} · ${timeAgo(selected.location_updated_at)}`
                      : "Location unavailable"}
                    {selected.speed != null && ` · ${formatKm(selected.speed * 3.6)}/h`}
                  </p>
                  <p className="text-ink-600">📦 Today: <span className="font-semibold">{selectedExtra.todayDeliveries}</span> deliveries · <span className="font-semibold">{formatNPR(selectedExtra.todayEarnings)}</span> earned</p>
                  <p className="text-ink-600">💵 COD balance: {formatNPR(selected.cod_balance)}</p>
                  {selected.active_order_id ? (
                    <Link to={`/admin/orders/${selected.active_order_id}`} className="inline-flex items-center gap-1 text-brand-600 hover:underline">
                      Current order <StatusBadge status={activeOrders.find((o) => o.id === selected.active_order_id)?.status ?? "RIDER_ACCEPTED"} /> →
                    </Link>
                  ) : (
                    <p className="text-xs text-ink-500">No active order.</p>
                  )}
                  <p className="text-xs text-ink-400">
                    Active orders shown on map:{" "}
                    {activeOrders.filter((o) => o.rider_id === selected.id).map((o) => ORDER_STATUS_LABELS[o.status]).join(", ") || "none"}
                  </p>
                </div>
              )}
            </Card>
          )}

          <Card className="p-5">
            <h3 className="mb-3 text-sm font-semibold text-ink-800">Active orders ({activeOrders.length})</h3>
            {loadingOrders ? (
              <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>
            ) : activeOrders.length === 0 ? (
              <p className="text-sm text-ink-500">No active deliveries.</p>
            ) : (
              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {activeOrders.slice(0, 30).map((o) => (
                  <Link key={o.id} to={`/admin/orders/${o.id}`}
                    className="block rounded-xl border border-ink-100 px-3 py-2 transition hover:border-brand-200 hover:bg-brand-50/40">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-semibold text-brand-700">{o.order_code ?? o.id.slice(0, 8)}</span>
                      <StatusBadge status={o.status} />
                    </div>
                    <p className="mt-1 truncate text-xs text-ink-500">{o.pickup_address} → {o.dropoff_address}</p>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
