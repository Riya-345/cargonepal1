// ============================================================
// CargoNepal — Admin Payments ledger (spec §17, §20)
// ============================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/services/supabaseClient";
import { isConfigured } from "@/core/config/env";
import { PAYMENT_METHODS } from "@/core/constants";
import {
  Button, Card, Badge, Input, Select,
  SkeletonList, EmptyState, ErrorState, useToast,
} from "@/components/ui";
import { cn, formatNPR, formatDateTime } from "@/core/utils";
import type { Payment, PaymentStatus, User } from "@/models/types";

type PaymentRow = Payment & {
  orders: { id: string; order_code: string | null } | null;
  customer?: Pick<User, "id" | "full_name" | "phone"> | null;
};

const STATUS_TONES: Record<PaymentStatus, string> = {
  successful: "bg-green-100 text-green-800",
  pending: "bg-amber-100 text-amber-800",
  initiated: "bg-blue-100 text-blue-800",
  failed: "bg-accent-100 text-accent-800",
  refunded: "bg-ink-200 text-ink-700",
};

const STATUSES: PaymentStatus[] = ["pending", "initiated", "successful", "failed", "refunded"];

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

export default function PaymentsScreen() {
  const navigate = useNavigate();
  const toast = useToast();
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [provider, setProvider] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = useCallback(async () => {
    if (!isConfigured.supabase) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      let query = supabase.from("payments")
        .select("*, orders(id, order_code)")
        .order("created_at", { ascending: false })
        .limit(300);
      if (status) query = query.eq("status", status);
      if (provider) query = query.eq("provider", provider);
      if (from) query = query.gte("created_at", new Date(`${from}T00:00:00`).toISOString());
      if (to) query = query.lte("created_at", new Date(`${to}T23:59:59`).toISOString());

      const { data, error: e } = await query;
      if (e) throw new Error(e.message);
      const payments = (data as PaymentRow[]) ?? [];

      const customerIds = [...new Set(payments.map((p) => p.customer_id))];
      if (customerIds.length > 0) {
        const { data: users } = await supabase.from("users").select("id, full_name, phone").in("id", customerIds);
        const map = new Map((users ?? []).map((u) => [u.id as string, u as Pick<User, "id" | "full_name" | "phone">]));
        payments.forEach((p) => { p.customer = map.get(p.customer_id) ?? null; });
      }
      setRows(payments);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load payments");
    } finally {
      setLoading(false);
    }
  }, [status, provider, from, to]);

  useEffect(() => { void load(); }, [load]);

  const totals = useMemo(() => {
    const successful = rows.filter((p) => p.status === "successful");
    return {
      count: successful.length,
      sum: successful.reduce((s, p) => s + Number(p.amount), 0),
      refunded: rows.filter((p) => p.status === "refunded").reduce((s, p) => s + Number(p.amount), 0),
      failed: rows.filter((p) => p.status === "failed").length,
    };
  }, [rows]);

  function exportCsv() {
    downloadCsv(`cargonepal-payments-${new Date().toISOString().slice(0, 10)}.csv`, [
      ["created_at", "order_code", "customer", "phone", "amount_npr", "provider", "status", "transaction_reference"],
      ...rows.map((p) => [
        p.created_at, p.orders?.order_code ?? p.order_id, p.customer?.full_name ?? "", p.customer?.phone ?? "",
        Number(p.amount), p.provider, p.status, p.transaction_reference ?? "",
      ]),
    ]);
    toast(`Exported ${rows.length} payments to CSV`, "success");
  }

  if (!isConfigured.supabase) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold text-ink-900">Payments</h1>
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
          <h1 className="text-2xl font-bold text-ink-900">Payments</h1>
          <p className="text-sm text-ink-500">Digital payment ledger — Khalti, eSewa, Fonepay & card</p>
        </div>
        <Button variant="outline" size="sm" disabled={rows.length === 0} onClick={exportCsv}>⬇ Export CSV</Button>
      </div>

      {/* Totals */}
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-ink-500">Successful (loaded)</p>
          <p className="mt-1 text-xl font-bold text-green-700">{formatNPR(totals.sum)}</p>
          <p className="text-xs text-ink-500">{totals.count} payments</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-ink-500">Refunded</p>
          <p className="mt-1 text-xl font-bold text-ink-800">{formatNPR(totals.refunded)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-ink-500">Failed</p>
          <p className="mt-1 text-xl font-bold text-accent-700">{totals.failed}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-ink-500">Rows loaded</p>
          <p className="mt-1 text-xl font-bold text-ink-800">{rows.length}</p>
          <p className="text-xs text-ink-500">Latest 300 matching filters</p>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-4 grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Select value={provider} onChange={(e) => setProvider(e.target.value)}>
          <option value="">All providers</option>
          {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </Select>
        <Input type="date" label="From" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input type="date" label="To" value={to} onChange={(e) => setTo(e.target.value)} />
        <div className="flex items-end">
          <Button variant="outline" size="sm" className="w-full" onClick={() => void load()}>↻ Refresh</Button>
        </div>
      </Card>

      {error ? (
        <ErrorState title="Could not load payments" message={error} onRetry={() => void load()} />
      ) : loading ? (
        <SkeletonList rows={6} />
      ) : rows.length === 0 ? (
        <Card><EmptyState icon="💳" title="No payments found" message="No payments match the current filters." /></Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="min-w-full divide-y divide-ink-100 text-sm">
            <thead className="bg-ink-50">
              <tr>
                {["Order", "Customer", "Amount", "Provider", "Status", "Reference", "Created"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-50">
              {rows.map((p) => (
                <tr key={p.id} className="cursor-pointer transition hover:bg-ink-50"
                  onClick={() => navigate(`/admin/orders/${p.orders?.id ?? p.order_id}`)}>
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-brand-700">{p.orders?.order_code ?? p.order_id.slice(0, 8)}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink-800">{p.customer?.full_name ?? "—"}</p>
                    <p className="text-xs text-ink-500">{p.customer?.phone ?? ""}</p>
                  </td>
                  <td className="px-4 py-3 font-semibold text-ink-900">{formatNPR(p.amount)}</td>
                  <td className="px-4 py-3"><Badge className="bg-brand-100 text-brand-800 capitalize">{p.provider}</Badge></td>
                  <td className="px-4 py-3"><Badge className={cn(STATUS_TONES[p.status])}>{p.status}</Badge></td>
                  <td className="px-4 py-3 font-mono text-xs text-ink-500">{p.transaction_reference ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-ink-500">{formatDateTime(p.created_at)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-ink-50">
              <tr>
                <td className="px-4 py-3 text-xs font-semibold uppercase text-ink-500" colSpan={2}>Total successful</td>
                <td className="px-4 py-3 font-bold text-green-700">{formatNPR(totals.sum)}</td>
                <td colSpan={4} />
              </tr>
            </tfoot>
          </table>
        </Card>
      )}
    </div>
  );
}
