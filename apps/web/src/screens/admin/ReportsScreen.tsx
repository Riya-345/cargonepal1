// ============================================================
// CargoNepal — Admin Reports (spec §44)
// ============================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { supabase, invoke } from "@/services/supabaseClient";
import { isConfigured } from "@/core/config/env";
import {
  Button, Card, Badge, Select, Skeleton, EmptyState, ErrorState, useToast,
} from "@/components/ui";
import { cn, formatNPR, formatDateTime } from "@/core/utils";
import type { Payment, RiderEarning, User } from "@/models/types";

interface DailyPoint { date: string; total: number; completed: number; cancelled: number; revenue: number }

interface AnalyticsResponse {
  kpis: Record<string, number>;
  charts: { daily_series: DailyPoint[]; status_distribution: Record<string, number> };
  generated_at: string;
}

interface CancellationRow {
  id: string; order_id: string; reason: string; reason_code: string | null;
  cancelled_by_role: string | null; cancellation_fee: number; refund_amount: number; created_at: string;
  order_code?: string | null;
}

interface RiderPerf {
  rider_id: string;
  name: string;
  deliveries: number;
  gross: number;
  commission: number;
  net: number;
  cod: number;
}

type Granularity = "daily" | "weekly" | "monthly";

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((cell) => {
    const s = String(cell ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function bucketKey(dateIso: string, g: Granularity): string {
  const d = new Date(dateIso);
  if (g === "daily") return d.toISOString().slice(0, 10);
  if (g === "weekly") {
    const copy = new Date(d);
    copy.setUTCDate(copy.getUTCDate() - ((copy.getUTCDay() + 6) % 7)); // Monday
    return `w/c ${copy.toISOString().slice(0, 10)}`;
  }
  return d.toISOString().slice(0, 7);
}

export default function ReportsScreen() {
  const toast = useToast();
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [earnings, setEarnings] = useState<RiderEarning[]>([]);
  const [riderNames, setRiderNames] = useState<Map<string, string>>(new Map());
  const [payments, setPayments] = useState<Payment[]>([]);
  const [cancellations, setCancellations] = useState<CancellationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [granularity, setGranularity] = useState<Granularity>("daily");

  const load = useCallback(async () => {
    if (!isConfigured.supabase) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const since = new Date();
      since.setDate(since.getDate() - 90);
      const [analyticsRes, earnRes, payRes, cancRes] = await Promise.all([
        invoke<AnalyticsResponse>("admin-analytics", { method: "GET" }),
        supabase.from("rider_earnings").select("*").gte("earned_at", since.toISOString()).limit(1000),
        supabase.from("payments").select("*").gte("created_at", since.toISOString()).limit(1000),
        supabase.from("order_cancellations")
          .select("id, order_id, reason, reason_code, cancelled_by_role, cancellation_fee, refund_amount, created_at, orders(order_code)")
          .gte("created_at", since.toISOString()).order("created_at", { ascending: false }).limit(300),
      ]);
      setAnalytics(analyticsRes);
      setEarnings((earnRes.data as RiderEarning[]) ?? []);
      setPayments((payRes.data as Payment[]) ?? []);
      setCancellations((((cancRes.data as (CancellationRow & { orders: { order_code: string | null } | null })[]) ?? [])
        .map((c) => ({ ...c, order_code: c.orders?.order_code ?? null })) as CancellationRow[]);

      const riderIds = [...new Set(((earnRes.data as RiderEarning[]) ?? []).map((e) => e.rider_id))];
      if (riderIds.length > 0) {
        const { data: users } = await supabase.from("users").select("id, full_name").in("id", riderIds);
        setRiderNames(new Map((users ?? []).map((u) => [u.id as string, (u as Pick<User, "id" | "full_name">).full_name ?? u.id.slice(0, 8)])));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to build reports");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const series = useMemo(() => {
    const daily = analytics?.charts.daily_series ?? [];
    const map = new Map<string, DailyPoint & { date: string }>();
    for (const d of daily) {
      const key = bucketKey(d.date, granularity);
      const cur = map.get(key) ?? { date: key, total: 0, completed: 0, cancelled: 0, revenue: 0 };
      cur.total += d.total;
      cur.completed += d.completed;
      cur.cancelled += d.cancelled;
      cur.revenue += Number(d.revenue);
      map.set(key, cur);
    }
    return [...map.values()].map((r) => ({ ...r, label: r.date.slice(granularity === "monthly" ? 0 : 5) }));
  }, [analytics, granularity]);

  const riderPerf = useMemo(() => {
    const map = new Map<string, RiderPerf>();
    for (const e of earnings) {
      const cur = map.get(e.rider_id) ?? {
        rider_id: e.rider_id, name: riderNames.get(e.rider_id) ?? e.rider_id.slice(0, 8),
        deliveries: 0, gross: 0, commission: 0, net: 0, cod: 0,
      };
      cur.deliveries += 1;
      cur.gross += Number(e.gross_fare);
      cur.commission += Number(e.platform_commission);
      cur.net += Number(e.net_earning);
      cur.cod += Number(e.cod_collected ?? 0);
      map.set(e.rider_id, cur);
    }
    return [...map.values()].sort((a, b) => b.deliveries - a.deliveries).slice(0, 15);
  }, [earnings, riderNames]);

  const paymentSummary = useMemo(() => {
    const byProvider = new Map<string, { count: number; sum: number }>();
    for (const p of payments.filter((x) => x.status === "successful")) {
      const cur = byProvider.get(p.provider) ?? { count: 0, sum: 0 };
      cur.count += 1;
      cur.sum += Number(p.amount);
      byProvider.set(p.provider, cur);
    }
    const byStatus = new Map<string, number>();
    for (const p of payments) byStatus.set(p.status, (byStatus.get(p.status) ?? 0) + 1);
    return { byProvider: [...byProvider.entries()], byStatus: [...byStatus.entries()] };
  }, [payments]);

  const codSummary = useMemo(() => {
    const collected = earnings.reduce((s, e) => s + Number(e.cod_collected ?? 0), 0);
    const cancelledRefunds = cancellations.reduce((s, c) => s + Number(c.refund_amount ?? 0), 0);
    return { collected, cancelledRefunds };
  }, [earnings, cancellations]);

  function exportOrdersCsv() {
    downloadCsv(`cargonepal-orders-${granularity}-${new Date().toISOString().slice(0, 10)}.csv`, [
      ["period", "orders", "completed", "cancelled", "revenue_npr"],
      ...series.map((s) => [s.date, s.total, s.completed, s.cancelled, Number(s.revenue).toFixed(2)]),
    ]);
    toast("Orders/revenue report exported", "success");
  }

  function exportRidersCsv() {
    downloadCsv(`cargonepal-rider-performance-${new Date().toISOString().slice(0, 10)}.csv`, [
      ["rider_id", "name", "deliveries", "gross_npr", "commission_npr", "net_npr", "cod_collected_npr"],
      ...riderPerf.map((r) => [r.rider_id, r.name, r.deliveries, r.gross.toFixed(2), r.commission.toFixed(2), r.net.toFixed(2), r.cod.toFixed(2)]),
    ]);
    toast("Rider performance report exported", "success");
  }

  if (!isConfigured.supabase) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold text-ink-900">Reports</h1>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Supabase is not configured. <Link to="/setup" className="font-semibold underline">Run setup</Link>.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Reports</h1>
          <p className="text-sm text-ink-500">Orders, revenue, rider performance, COD, payments & cancellations — last 90 days</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Select value={granularity} onChange={(e) => setGranularity(e.target.value as Granularity)}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </Select>
          <Button variant="outline" size="md" onClick={exportOrdersCsv}>⬇ CSV</Button>
          <Button variant="outline" size="md" onClick={() => window.print()}>🖨 Export PDF (print)</Button>
        </div>
      </div>

      {error ? (
        <ErrorState title="Could not build reports" message={error} onRetry={() => void load()} />
      ) : loading ? (
        <div className="space-y-4">
          <Skeleton className="h-72 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Orders & revenue */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <h3 className="mb-4 text-sm font-semibold text-ink-800">Orders ({granularity})</h3>
              {series.length === 0 ? <EmptyState icon="📈" title="No data" message="No orders in the last 90 days." /> : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={series}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e9f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="total" name="Orders" stroke="#1f42eb" strokeWidth={2} />
                      <Line type="monotone" dataKey="completed" name="Completed" stroke="#16a34a" strokeWidth={2} />
                      <Line type="monotone" dataKey="cancelled" name="Cancelled" stroke="#f83232" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
            <Card className="p-5">
              <h3 className="mb-4 text-sm font-semibold text-ink-800">Revenue ({granularity})</h3>
              {series.length === 0 ? <EmptyState icon="💰" title="No data" message="No revenue in the last 90 days." /> : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={series}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e9f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v) => formatNPR(Number(v))} />
                      <Bar dataKey="revenue" name="Revenue (NPR)" fill="#16a34a" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          </div>

          {/* Rider performance */}
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ink-800">Rider performance — top {riderPerf.length} by deliveries</h3>
              <Button variant="outline" size="sm" disabled={riderPerf.length === 0} onClick={exportRidersCsv}>⬇ Export riders CSV</Button>
            </div>
            {riderPerf.length === 0 ? (
              <p className="text-sm text-ink-500">No completed deliveries in the period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-ink-100 text-sm">
                  <thead>
                    <tr>
                      {["#", "Rider", "Deliveries", "Gross fare", "Commission", "Net earning", "COD collected"].map((h) => (
                        <th key={h} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-50">
                    {riderPerf.map((r, i) => (
                      <tr key={r.rider_id} className="hover:bg-ink-50">
                        <td className="px-3 py-2 text-ink-400">{i + 1}</td>
                        <td className="px-3 py-2 font-medium text-ink-800">{r.name}</td>
                        <td className="px-3 py-2">{r.deliveries}</td>
                        <td className="px-3 py-2">{formatNPR(r.gross)}</td>
                        <td className="px-3 py-2 text-ink-500">{formatNPR(r.commission)}</td>
                        <td className="px-3 py-2 font-semibold text-green-700">{formatNPR(r.net)}</td>
                        <td className="px-3 py-2 text-amber-700">{formatNPR(r.cod)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Payments / COD / Cancellations */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="p-5">
              <h3 className="mb-3 text-sm font-semibold text-ink-800">Payment report</h3>
              {paymentSummary.byProvider.length === 0 ? (
                <p className="text-sm text-ink-500">No successful digital payments in the period.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {paymentSummary.byProvider.map(([provider, s]) => (
                    <li key={provider} className="flex items-center justify-between rounded-lg bg-ink-50 px-3 py-2">
                      <span className="capitalize font-medium">{provider}</span>
                      <span className="text-ink-600">{s.count} txns</span>
                      <span className="font-semibold text-green-700">{formatNPR(s.sum)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {paymentSummary.byStatus.map(([st, n]) => (
                  <Badge key={st} className={cn("bg-ink-100 text-ink-700")}>{st}: {n}</Badge>
                ))}
              </div>
            </Card>

            <Card className="p-5">
              <h3 className="mb-3 text-sm font-semibold text-ink-800">COD report</h3>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-ink-500">COD collected (via completed trips)</dt><dd className="font-semibold text-amber-700">{formatNPR(codSummary.collected)}</dd></div>
                <div className="flex justify-between"><dt className="text-ink-500">Refunds on cancellations</dt><dd className="font-semibold text-accent-700">{formatNPR(codSummary.cancelledRefunds)}</dd></div>
              </dl>
              <Link to="/admin/cod" className="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline">
                Open COD settlement board →
              </Link>
            </Card>

            <Card className="p-5">
              <h3 className="mb-3 text-sm font-semibold text-ink-800">Cancellation report ({cancellations.length})</h3>
              {cancellations.length === 0 ? (
                <p className="text-sm text-ink-500">No cancellations in the period. 🎉</p>
              ) : (
                <ul className="max-h-48 space-y-1.5 overflow-y-auto pr-1 text-xs">
                  {cancellations.slice(0, 30).map((c) => (
                    <li key={c.id} className="flex items-center justify-between rounded-lg bg-ink-50 px-3 py-2">
                      <Link to={`/admin/orders/${c.order_id}`} className="font-mono text-brand-700 hover:underline">{c.order_code ?? c.order_id.slice(0, 8)}</Link>
                      <span className="truncate px-2 text-ink-600">{c.reason}</span>
                      <span className="text-ink-400">{formatDateTime(c.created_at).slice(0, 12)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
