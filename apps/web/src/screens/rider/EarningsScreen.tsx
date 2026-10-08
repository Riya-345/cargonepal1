// ============================================================
// CargoNepal — Rider earnings (spec §32)
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Card, Badge, ErrorState, Skeleton, SkeletonList } from "@/components/ui";
import { invoke } from "@/services/supabaseClient";
import { isConfigured } from "@/core/config/env";
import { formatDate, formatNPR } from "@/core/utils";

interface PeriodStats { net: number; gross: number; commission: number; cod: number; deliveries: number }
interface RecentItem { id?: string; order_id?: string; net_earning: number; gross_fare?: number; cod_collected?: number; earned_at: string }
interface EarningsResponse {
  rider_id: string;
  wallet_balance: number;
  cod_balance: number;
  total_deliveries: number;
  rating_avg: number;
  rating_count: number;
  today: PeriodStats;
  week: PeriodStats;
  month: PeriodStats;
  recent: RecentItem[];
}

function PeriodCard({ title, p, accent }: { title: string; p: PeriodStats; accent?: boolean }) {
  return (
    <Card className={accent ? "border-green-200 bg-green-50/50 p-4" : "p-4"}>
      <div className="text-xs uppercase tracking-wide text-ink-400">{title}</div>
      <div className={accent ? "mt-1 text-2xl font-bold text-green-600" : "mt-1 text-2xl font-bold text-ink-900"}>
        {formatNPR(p.net)}
      </div>
      <div className="mt-3 space-y-1 text-xs text-ink-500">
        <div className="flex justify-between"><span>Gross</span><span className="font-medium text-ink-700">{formatNPR(p.gross)}</span></div>
        <div className="flex justify-between"><span>Commission</span><span className="font-medium text-accent-600">−{formatNPR(p.commission)}</span></div>
        <div className="flex justify-between"><span>COD collected</span><span className="font-medium text-ink-700">{formatNPR(p.cod)}</span></div>
        <div className="flex justify-between"><span>Deliveries</span><span className="font-medium text-ink-700">{p.deliveries}</span></div>
      </div>
    </Card>
  );
}

export default function EarningsScreen() {
  const [data, setData] = useState<EarningsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isConfigured.supabase) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await invoke<EarningsResponse>("rider-earnings", { method: "GET" });
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load earnings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Build last-7-day bar chart from recent earnings.
  const chart = useMemo(() => {
    const days: { key: string; label: string; net: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push({ key: d.toISOString().slice(0, 10), label: d.toLocaleDateString("en-GB", { weekday: "short" }), net: 0 });
    }
    (data?.recent ?? []).forEach((r) => {
      const key = new Date(r.earned_at).toISOString().slice(0, 10);
      const bucket = days.find((x) => x.key === key);
      if (bucket) bucket.net += r.net_earning ?? 0;
    });
    return days.map((d) => ({ label: d.label, net: Math.round(d.net) }));
  }, [data]);

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
        <Skeleton className="h-24 w-full rounded-2xl" />
        <div className="grid gap-3 sm:grid-cols-3">
          <Skeleton className="h-40 rounded-2xl" /><Skeleton className="h-40 rounded-2xl" /><Skeleton className="h-40 rounded-2xl" />
        </div>
        <SkeletonList rows={3} />
      </div>
    );
  }

  if (error || !data) return <ErrorState message={error ?? "No earnings data."} onRetry={() => void load()} />;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-ink-900">Earnings</h1>

      {/* Balances */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="border-green-200 bg-gradient-to-br from-green-50 to-white p-4">
          <div className="text-xs uppercase tracking-wide text-ink-400">Wallet balance</div>
          <div className="mt-1 text-2xl font-bold text-green-600">{formatNPR(data.wallet_balance)}</div>
          <div className="mt-1 text-[11px] text-ink-400">Available to withdraw</div>
        </Card>
        <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4">
          <div className="text-xs uppercase tracking-wide text-ink-400">COD balance</div>
          <div className="mt-1 text-2xl font-bold text-amber-600">{formatNPR(data.cod_balance)}</div>
          <div className="mt-1 text-[11px] text-ink-400">Pending settlement</div>
        </Card>
      </div>

      {/* Quick facts */}
      <div className="flex flex-wrap gap-2">
        <Badge className="bg-brand-100 text-brand-800">🚚 {data.total_deliveries} total deliveries</Badge>
        <Badge className="bg-amber-100 text-amber-800">★ {data.rating_avg.toFixed(1)} ({data.rating_count})</Badge>
      </div>

      {/* Period cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        <PeriodCard title="Today" p={data.today} accent />
        <PeriodCard title="This week" p={data.week} />
        <PeriodCard title="This month" p={data.month} />
      </div>

      {/* Last 7 days chart */}
      <Card className="p-4">
        <h3 className="mb-3 font-semibold text-ink-800">Last 7 days</h3>
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}>
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#637491" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#637491" }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(value) => [formatNPR(Number(value)), "Net"]} cursor={{ fill: "rgba(31,66,235,0.06)" }} />
              <Bar dataKey="net" fill="#1f42eb" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Recent */}
      <Card className="p-4">
        <h3 className="mb-3 font-semibold text-ink-800">Recent earnings</h3>
        {data.recent.length === 0 ? (
          <p className="text-sm text-ink-500">No earnings yet. Complete deliveries to see them here.</p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {data.recent.slice(0, 20).map((r, i) => (
              <li key={r.id ?? r.order_id ?? i} className="flex items-center justify-between py-3">
                <div>
                  <div className="text-sm font-medium text-ink-800">
                    Order {r.order_id ? r.order_id.slice(0, 8) : "—"}
                  </div>
                  <div className="text-xs text-ink-400">{formatDate(r.earned_at)}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-green-600">+{formatNPR(r.net_earning)}</div>
                  {r.cod_collected ? <div className="text-[11px] text-amber-600">COD {formatNPR(r.cod_collected)}</div> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
