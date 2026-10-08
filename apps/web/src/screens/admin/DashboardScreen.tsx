// ============================================================
// CargoNepal — Admin Dashboard (spec §19)
// ============================================================
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { invoke } from "@/services/supabaseClient";
import { isConfigured } from "@/core/config/env";
import { Card, Skeleton, ErrorState, Badge } from "@/components/ui";
import { cn, formatNPR, formatDate } from "@/core/utils";

interface DailyPoint {
  date: string;
  total: number;
  completed: number;
  cancelled: number;
  revenue: number;
}

interface AnalyticsResponse {
  kpis: {
    todays_orders: number;
    active_deliveries: number;
    completed_today: number;
    cancelled_today: number;
    total_revenue: number;
    rider_earnings: number;
    platform_commission: number;
    cod_pending: number;
    total_riders: number;
    online_riders: number;
    pending_riders: number;
    total_customers: number;
  };
  charts: {
    daily_series: DailyPoint[];
    status_distribution: Record<string, number>;
  };
  generated_at: string;
}

const RANGES = [7, 30, 90] as const;
const PIE_COLORS = ["#16a34a", "#f83232", "#1f42eb", "#f59e0b"];

function KpiCard({ icon, label, value, tone }: { icon: string; label: string; value: string; tone?: string }) {
  return (
    <Card className="flex items-center gap-4 p-4">
      <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl", tone ?? "bg-brand-50")}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
        <p className="truncate text-lg font-bold text-ink-900">{value}</p>
      </div>
    </Card>
  );
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="p-5">
      <h3 className="mb-4 text-sm font-semibold text-ink-800">{title}</h3>
      <div className="h-64">{children}</div>
    </Card>
  );
}

export default function DashboardScreen() {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<number>(30);

  async function load() {
    if (!isConfigured.supabase) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await invoke<AnalyticsResponse>("admin-analytics", { method: "GET" });
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  // Client-side range filter over the returned daily_series (default 30d fetch).
  const series = useMemo(() => {
    const s = data?.charts.daily_series ?? [];
    return s.slice(-range).map((d) => ({ ...d, label: formatDate(d.date).slice(0, 6) }));
  }, [data, range]);

  const pieData = useMemo(() => {
    const dist = data?.charts.status_distribution ?? {};
    const completed = dist["DELIVERED"] ?? 0;
    const cancelled = (dist["CANCELLED"] ?? 0) + (dist["FAILED"] ?? 0) + (dist["RETURNED"] ?? 0);
    const active = Object.entries(dist)
      .filter(([k]) => !["DELIVERED", "CANCELLED", "FAILED", "RETURNED"].includes(k))
      .reduce((sum, [, v]) => sum + v, 0);
    return [
      { name: "Completed", value: completed },
      { name: "Cancelled", value: cancelled },
      { name: "Active", value: active },
    ].filter((d) => d.value > 0);
  }, [data]);

  if (!isConfigured.supabase) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold text-ink-900">Dashboard</h1>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Supabase is not configured, so live analytics are unavailable.{" "}
          <Link to="/setup" className="font-semibold underline">Run setup</Link> to connect the backend.
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold text-ink-900">Dashboard</h1>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}
        </div>
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Skeleton className="h-80 w-full rounded-2xl" />
          <Skeleton className="h-80 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold text-ink-900">Dashboard</h1>
        <ErrorState title="Could not load analytics" message={error ?? undefined} onRetry={() => void load()} />
      </div>
    );
  }

  const k = data.kpis;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Dashboard</h1>
          <p className="text-sm text-ink-500">Platform overview · generated {formatDate(data.generated_at)}</p>
        </div>
        <Badge className="bg-green-100 text-green-800">● Live data</Badge>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon="📦" label="Today's orders" value={String(k.todays_orders)} tone="bg-brand-50" />
        <KpiCard icon="🛵" label="Active deliveries" value={String(k.active_deliveries)} tone="bg-blue-50" />
        <KpiCard icon="✅" label="Completed today" value={String(k.completed_today)} tone="bg-green-50" />
        <KpiCard icon="❌" label="Cancelled today" value={String(k.cancelled_today)} tone="bg-accent-50" />
        <KpiCard icon="💰" label="Total revenue" value={formatNPR(k.total_revenue)} tone="bg-green-50" />
        <KpiCard icon="🪙" label="Rider earnings" value={formatNPR(k.rider_earnings)} tone="bg-amber-50" />
        <KpiCard icon="🏦" label="Platform commission" value={formatNPR(k.platform_commission)} tone="bg-brand-50" />
        <KpiCard icon="💵" label="COD pending" value={formatNPR(k.cod_pending)} tone="bg-amber-50" />
        <KpiCard icon="🛵" label="Riders (online / total)" value={`${k.online_riders} / ${k.total_riders}`} tone="bg-blue-50" />
        <KpiCard icon="⏳" label="Pending rider approvals" value={String(k.pending_riders)} tone="bg-amber-50" />
        <KpiCard icon="👥" label="Customers" value={String(k.total_customers)} tone="bg-brand-50" />
      </div>

      {/* Range selector */}
      <div className="mt-8 mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink-900">Trends</h2>
        <div className="flex gap-1 rounded-lg bg-ink-100 p-1">
          {RANGES.map((r) => (
            <button key={r} onClick={() => setRange(r)}
              className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition",
                range === r ? "bg-white text-ink-900 shadow-sm" : "text-ink-500 hover:text-ink-800")}>
              {r}d
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title={`Daily orders — last ${range} days`}>
          {series.length === 0 ? (
            <p className="py-16 text-center text-sm text-ink-500">No order activity in this range yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e9f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="total" name="Orders" stroke="#1f42eb" fill="#1f42eb" fillOpacity={0.15} />
                <Area type="monotone" dataKey="completed" name="Completed" stroke="#16a34a" fill="#16a34a" fillOpacity={0.15} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title={`Revenue per day — last ${range} days`}>
          {series.length === 0 ? (
            <p className="py-16 text-center text-sm text-ink-500">No revenue recorded in this range yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e9f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => formatNPR(Number(v))} />
                <Bar dataKey="revenue" name="Revenue (NPR)" fill="#1f42eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Order status distribution">
          {pieData.length === 0 ? (
            <p className="py-16 text-center text-sm text-ink-500">No orders yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={3}>
                  {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <Card className="p-5">
          <h3 className="mb-4 text-sm font-semibold text-ink-800">Quick links</h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              { to: "/admin/live-map", label: "🗺️ Live Map", sub: `${k.online_riders} riders online` },
              { to: "/admin/orders", label: "📦 Orders", sub: `${k.active_deliveries} active` },
              { to: "/admin/riders", label: "🛵 Riders", sub: `${k.pending_riders} pending approval` },
              { to: "/admin/cod", label: "💵 COD", sub: `${formatNPR(k.cod_pending)} to settle` },
            ].map((l) => (
              <Link key={l.to} to={l.to}
                className="rounded-xl border border-ink-100 p-4 transition hover:border-brand-200 hover:bg-brand-50/40">
                <p className="text-sm font-semibold text-ink-800">{l.label}</p>
                <p className="mt-1 text-xs text-ink-500">{l.sub}</p>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
