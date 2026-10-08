// ============================================================
// CargoNepal — Rider deliveries list (spec §33)
// ============================================================
// Active / Completed / Cancelled tabs of the rider's own orders.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Badge, Card, EmptyState, ErrorState, SkeletonList, StatusBadge } from "@/components/ui";
import { useAuth } from "@/core/hooks/useAuth";
import { supabase } from "@/services/supabaseClient";
import { isConfigured } from "@/core/config/env";
import { ACTIVE_ORDER_STATUSES } from "@/core/constants";
import { cn, formatNPR, timeAgo } from "@/core/utils";
import type { Order, OrderStatus } from "@/models/types";

type Tab = "active" | "completed" | "cancelled";

const TABS: { id: Tab; label: string; statuses: OrderStatus[] }[] = [
  { id: "active", label: "Active", statuses: ACTIVE_ORDER_STATUSES },
  { id: "completed", label: "Completed", statuses: ["DELIVERED"] },
  { id: "cancelled", label: "Cancelled", statuses: ["CANCELLED", "FAILED", "RETURNED"] },
];

export default function DeliveriesScreen() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("active");
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || !isConfigured.supabase) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    const statuses = TABS.find((t) => t.id === tab)!.statuses;
    const { data, error: qErr } = await supabase
      .from("orders").select("*")
      .eq("rider_id", user.id)
      .in("status", statuses)
      .order("created_at", { ascending: false })
      .limit(100);
    if (qErr) { setError(qErr.message); setLoading(false); return; }
    setOrders((data as Order[]) ?? []);
    setLoading(false);
  }, [user, tab]);

  useEffect(() => { void load(); }, [load]);

  if (!isConfigured.supabase) {
    return (
      <div className="py-8">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Supabase isn't configured yet. <Link className="underline font-semibold" to="/setup">Open the setup guide</Link>.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-ink-900">Deliveries</h1>

      {/* Tabs */}
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-ink-100 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-lg py-2 text-sm font-semibold transition",
              tab === t.id ? "bg-white shadow-sm text-brand-700" : "text-ink-500 hover:text-ink-700",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <SkeletonList rows={3} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : orders.length === 0 ? (
        <EmptyState
          icon="📦"
          title={`No ${tab} deliveries`}
          message={tab === "active" ? "Go online from Home to start receiving parcels." : "Nothing here yet."}
        />
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <Card key={o.id} className="p-4" onClick={() => navigate(`/rider/active/${o.id}`)}>
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-ink-400">{o.order_code ?? o.id.slice(0, 8)}</span>
                <StatusBadge status={o.status} />
              </div>
              <div className="mt-3 flex items-start gap-3 text-sm">
                <div className="mt-1 flex flex-col items-center">
                  <span className="h-2.5 w-2.5 rounded-full bg-brand-600" />
                  <span className="my-1 h-5 w-px bg-ink-200" />
                  <span className="h-2.5 w-2.5 rounded-full bg-accent-600" />
                </div>
                <div className="flex-1 space-y-1.5">
                  <div className="truncate text-ink-700">{o.pickup_address}</div>
                  <div className="truncate text-ink-700">{o.dropoff_address}</div>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge className="bg-green-100 text-green-800">{formatNPR(o.rider_earning)}</Badge>
                  {o.is_cod && <Badge className="bg-amber-100 text-amber-800">COD</Badge>}
                </div>
                <span className="text-xs text-ink-400">{timeAgo(o.created_at)}</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
