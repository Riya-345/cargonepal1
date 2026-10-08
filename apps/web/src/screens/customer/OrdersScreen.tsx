// ============================================================
// CargoNepal — Orders list (spec §33)
// ============================================================
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Card, Button, SkeletonList, EmptyState, ErrorState, StatusBadge,
} from "@/components/ui";
import { fetchOrders } from "@/services/orders/ordersService";
import { isConfigured } from "@/core/config/env";
import { cn, formatNPR, timeAgo } from "@/core/utils";
import type { Order } from "@/models/types";

type Filter = "all" | "active" | "delivered" | "cancelled";

const TABS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
];

const EMPTY_COPY: Record<Filter, { icon: string; title: string; message: string }> = {
  all: { icon: "📦", title: "No orders yet", message: "Your deliveries will show up here once you book your first parcel." },
  active: { icon: "🛵", title: "Nothing on the move", message: "You have no active deliveries right now." },
  delivered: { icon: "✅", title: "No deliveries yet", message: "Completed deliveries will appear here." },
  cancelled: { icon: "🚫", title: "No cancelled orders", message: "Orders you cancel will be listed here." },
};

export default function OrdersScreen() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>("all");
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (f: Filter) => {
    setLoading(true);
    setError(null);
    try {
      setOrders(await fetchOrders(f));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your orders.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isConfigured.supabase) { setLoading(false); return; }
    void load(filter);
  }, [filter, load]);

  const empty = EMPTY_COPY[filter];

  return (
    <div className="pb-4 space-y-4 animate-fade-in">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-xl font-bold text-ink-900">My orders</h1>
        <Button size="sm" onClick={() => navigate("/customer/book")}>+ New parcel</Button>
      </header>

      {!isConfigured.supabase && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Supabase is not configured, so orders can't be loaded.{" "}
          <Link to="/setup" className="font-semibold underline">Open the setup guide</Link>.
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 rounded-full bg-ink-100 p-1">
        {TABS.map((t) => (
          <button key={t.value} onClick={() => setFilter(t.value)}
            className={cn("flex-1 rounded-full px-3 py-1.5 text-sm font-medium transition",
              filter === t.value ? "bg-white text-brand-700 shadow-sm" : "text-ink-500 hover:text-ink-800")}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <SkeletonList rows={4} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load(filter)} />
      ) : orders.length === 0 ? (
        <EmptyState icon={empty.icon} title={empty.title} message={empty.message}
          action={filter !== "cancelled" ? <Button onClick={() => navigate("/customer/book")}>Send a parcel</Button> : undefined} />
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <Card key={o.id} className="p-4" onClick={() => navigate(`/customer/orders/${o.id}`)}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink-900">
                    {o.order_code ?? "Order"}
                    <span className="ml-2 font-normal text-ink-400">{timeAgo(o.created_at)}</span>
                  </p>
                  <div className="mt-1.5 space-y-1 text-xs text-ink-600">
                    <p className="truncate"><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-brand-600" />{o.pickup_city ? `${o.pickup_city} · ` : ""}{o.pickup_address}</p>
                    <p className="truncate"><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-accent-500" />{o.dropoff_address}</p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <StatusBadge status={o.status} />
                  <span className="text-sm font-bold text-ink-900">{formatNPR(o.total_amount)}</span>
                  {o.is_cod && <span className="text-[10px] font-medium text-ink-400">COD{o.cod_amount > 0 ? ` ${formatNPR(o.cod_amount)}` : ""}</span>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
