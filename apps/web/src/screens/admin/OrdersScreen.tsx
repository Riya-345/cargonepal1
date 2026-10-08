// ============================================================
// CargoNepal — Admin Orders list (spec §20, §33)
// ============================================================
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/services/supabaseClient";
import { isConfigured } from "@/core/config/env";
import { ORDER_STATUS_LABELS, SERVICE_CITIES, PAYMENT_METHODS } from "@/core/constants";
import { Button, Input, Select, Card, StatusBadge, Badge, SkeletonList, EmptyState, ErrorState, useToast } from "@/components/ui";
import { cn, formatNPR, formatDateTime, timeAgo } from "@/core/utils";
import type { Order, OrderStatus, User } from "@/models/types";

const PAGE_SIZE = 50;

interface OrderRow extends Order {
  customer?: Pick<User, "id" | "full_name" | "phone"> | null;
  rider?: Pick<User, "id" | "full_name" | "phone"> | null;
}

interface Filters {
  q: string;
  status: string;
  city: string;
  payment: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: Filters = { q: "", status: "", city: "", payment: "", from: "", to: "" };

const PAYMENT_STATUS_TONE: Record<string, string> = {
  successful: "bg-green-100 text-green-800",
  pending: "bg-amber-100 text-amber-800",
  initiated: "bg-blue-100 text-blue-800",
  failed: "bg-accent-100 text-accent-800",
  refunded: "bg-ink-200 text-ink-700",
};

export default function OrdersScreen() {
  const navigate = useNavigate();
  const toast = useToast();
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [searchDraft, setSearchDraft] = useState("");

  const load = useCallback(async (f: Filters, p: number) => {
    if (!isConfigured.supabase) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      let query = supabase.from("orders")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(p * PAGE_SIZE, p * PAGE_SIZE + PAGE_SIZE - 1);

      if (f.status) query = query.eq("status", f.status);
      if (f.city) query = query.eq("pickup_city", f.city);
      if (f.payment) query = query.eq("payment_method", f.payment);
      if (f.from) query = query.gte("created_at", new Date(`${f.from}T00:00:00`).toISOString());
      if (f.to) query = query.lte("created_at", new Date(`${f.to}T23:59:59`).toISOString());

      const q = f.q.trim();
      if (q) {
        // Search by order code directly, and by customer name/phone via a users lookup.
        const { data: matchedUsers } = await supabase.from("users")
          .select("id")
          .or(`phone.ilike.%${q}%,full_name.ilike.%${q}%`)
          .limit(100);
        const ids = (matchedUsers ?? []).map((u) => u.id as string);
        const clauses = [`order_code.ilike.%${q}%`];
        if (ids.length > 0) clauses.push(`customer_id.in.(${ids.join(",")})`);
        query = query.or(clauses.join(","));
      }

      const { data, error: qErr, count } = await query;
      if (qErr) throw new Error(qErr.message);
      const orders = (data as Order[]) ?? [];
      setTotal(count ?? orders.length);

      // Enrich with customer + rider names (separate queries keep FK naming safe).
      const customerIds = [...new Set(orders.map((o) => o.customer_id))];
      const riderIds = [...new Set(orders.map((o) => o.rider_id).filter((r): r is string => Boolean(r)))];
      const [custs, riders] = await Promise.all([
        customerIds.length
          ? supabase.from("users").select("id, full_name, phone").in("id", customerIds)
          : Promise.resolve({ data: [] as Pick<User, "id" | "full_name" | "phone">[] }),
        riderIds.length
          ? supabase.from("users").select("id, full_name, phone").in("id", riderIds)
          : Promise.resolve({ data: [] as Pick<User, "id" | "full_name" | "phone">[] }),
      ]);
      const custMap = new Map((custs.data ?? []).map((u) => [u.id as string, u as Pick<User, "id" | "full_name" | "phone">]));
      const riderMap = new Map((riders.data ?? []).map((u) => [u.id as string, u as Pick<User, "id" | "full_name" | "phone">]));
      setRows(orders.map((o) => ({
        ...o,
        customer: custMap.get(o.customer_id) ?? null,
        rider: o.rider_id ? riderMap.get(o.rider_id) ?? null : null,
      })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(filters, page); }, [filters, page, load]);

  function applyFilters(patch: Partial<Filters>) {
    setPage(0);
    setFilters((f) => ({ ...f, ...patch }));
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (!isConfigured.supabase) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold text-ink-900">Orders</h1>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Supabase is not configured. <Link to="/setup" className="font-semibold underline">Run setup</Link> to load orders.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Orders</h1>
          <p className="text-sm text-ink-500">{total} orders match the current filters</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { void load(filters, page); toast("Orders refreshed", "success"); }}>
          ↻ Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card className="mb-4 grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
        <div className="lg:col-span-2">
          <Input
            placeholder="Search order code, customer name or phone…"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") applyFilters({ q: searchDraft }); }}
          />
        </div>
        <Select value={filters.status} onChange={(e) => applyFilters({ status: e.target.value })}>
          <option value="">All statuses</option>
          {(Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]).map((s) => (
            <option key={s} value={s}>{ORDER_STATUS_LABELS[s]}</option>
          ))}
        </Select>
        <Select value={filters.city} onChange={(e) => applyFilters({ city: e.target.value })}>
          <option value="">All cities</option>
          {SERVICE_CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
        <Select value={filters.payment} onChange={(e) => applyFilters({ payment: e.target.value })}>
          <option value="">All payment methods</option>
          {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </Select>
        <div className="flex items-end gap-2">
          <Input type="date" label="From" value={filters.from} onChange={(e) => applyFilters({ from: e.target.value })} />
          <Input type="date" label="To" value={filters.to} onChange={(e) => applyFilters({ to: e.target.value })} />
        </div>
      </Card>

      {error ? (
        <ErrorState title="Could not load orders" message={error} onRetry={() => void load(filters, page)} />
      ) : loading ? (
        <SkeletonList rows={6} />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState icon="📦" title="No orders found"
            message="Try adjusting your filters, or wait for new orders to arrive."
            action={<Button variant="outline" onClick={() => { setFilters(EMPTY_FILTERS); setSearchDraft(""); setPage(0); }}>Clear filters</Button>} />
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="min-w-full divide-y divide-ink-100 text-sm">
            <thead className="bg-ink-50">
              <tr>
                {["Order", "Customer", "Rider", "Pickup", "Drop", "Amount", "Payment", "Status", "Created", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-50">
              {rows.map((o) => (
                <tr key={o.id} className="cursor-pointer hover:bg-ink-50 transition" onClick={() => navigate(`/admin/orders/${o.id}`)}>
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-brand-700">{o.order_code ?? o.id.slice(0, 8)}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink-800">{o.customer?.full_name ?? "—"}</p>
                    <p className="text-xs text-ink-500">{o.customer?.phone ?? ""}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-ink-800">{o.rider?.full_name ?? <span className="text-ink-400">Unassigned</span>}</p>
                    {o.rider?.phone && <p className="text-xs text-ink-500">{o.rider.phone}</p>}
                  </td>
                  <td className="px-4 py-3 text-ink-600">{o.pickup_city ?? "—"}</td>
                  <td className="px-4 py-3 text-ink-600">{(o as OrderRow & { dropoff_city?: string | null }).dropoff_city ?? "—"}</td>
                  <td className="px-4 py-3 font-semibold text-ink-900">{formatNPR(o.total_amount)}</td>
                  <td className="px-4 py-3">
                    <p className="capitalize text-ink-700">{o.payment_method}</p>
                    <Badge className={cn("mt-0.5", PAYMENT_STATUS_TONE[o.payment_status] ?? "bg-ink-100 text-ink-700")}>{o.payment_status}</Badge>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                  <td className="px-4 py-3 text-xs text-ink-500" title={formatDateTime(o.created_at)}>{timeAgo(o.created_at)}</td>
                  <td className="px-4 py-3">
                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/admin/orders/${o.id}`); }}>View</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Pagination */}
          <div className="flex items-center justify-between border-t border-ink-100 px-4 py-3">
            <p className="text-xs text-ink-500">Page {page + 1} of {pageCount}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0 || loading} onClick={() => setPage((p) => Math.max(0, p - 1))}>← Prev</Button>
              <Button variant="outline" size="sm" disabled={page + 1 >= pageCount || loading} onClick={() => setPage((p) => p + 1)}>Next →</Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
