// ============================================================
// CargoNepal — Admin Customers (spec §23)
// ============================================================
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/services/supabaseClient";
import { useAuth } from "@/core/hooks/useAuth";
import { isConfigured } from "@/core/config/env";
import {
  Button, Card, Badge, Input, Modal, StatusBadge,
  SkeletonList, EmptyState, ErrorState, useToast,
} from "@/components/ui";
import { cn, formatNPR, formatDateTime, timeAgo } from "@/core/utils";
import type { CustomerProfile, Order, Payment, User } from "@/models/types";

type CustomerRow = CustomerProfile & {
  created_at: string;
  users: Pick<User, "id" | "full_name" | "phone" | "email" | "avatar_url" | "status"> | null;
};

interface CancellationRow {
  id: string; order_id: string; reason: string; reason_code: string | null; created_at: string;
}

export default function CustomersScreen() {
  const { user: admin } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [detail, setDetail] = useState<CustomerRow | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [cancellations, setCancellations] = useState<CancellationRow[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [acting, setActing] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<{ customer: CustomerRow; suspend: boolean } | null>(null);

  const load = useCallback(async () => {
    if (!isConfigured.supabase) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const { data, error: e } = await supabase.from("customer_profiles")
        .select("*, users(id, full_name, phone, email, avatar_url, status)")
        .order("total_orders", { ascending: false })
        .limit(500);
      if (e) throw new Error(e.message);
      setRows((data as CustomerRow[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load customers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function openDetail(c: CustomerRow) {
    setDetail(c);
    setOrders([]); setPayments([]); setCancellations([]);
    setLoadingDetail(true);
    const [o, p] = await Promise.all([
      supabase.from("orders").select("*").eq("customer_id", c.id).order("created_at", { ascending: false }).limit(30),
      supabase.from("payments").select("*").eq("customer_id", c.id).order("created_at", { ascending: false }).limit(30),
    ]);
    const orderRows = (o.data as Order[]) ?? [];
    setOrders(orderRows);
    setPayments((p.data as Payment[]) ?? []);
    if (orderRows.length > 0) {
      const { data: canc } = await supabase.from("order_cancellations")
        .select("id, order_id, reason, reason_code, created_at")
        .in("order_id", orderRows.map((x) => x.id));
      setCancellations((canc as CancellationRow[]) ?? []);
    }
    setLoadingDetail(false);
  }

  async function toggleSuspension(customer: CustomerRow, suspend: boolean) {
    setActing(true);
    try {
      const { error: e } = await supabase.from("users")
        .update({ status: suspend ? "suspended" : "active", updated_at: new Date().toISOString() })
        .eq("id", customer.id);
      if (e) throw new Error(e.message);
      if (admin?.id) {
        await supabase.rpc("write_audit", {
          p_admin_id: admin.id,
          p_action: suspend ? "user_suspended" : "user_restored",
          p_target_type: "user",
          p_target_id: customer.id,
          p_metadata: { phone: customer.users?.phone ?? null },
        });
      }
      toast(suspend ? "Customer account suspended" : "Customer account restored", "success");
      setConfirmTarget(null);
      await load();
      setDetail(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Action failed", "error");
    } finally {
      setActing(false);
    }
  }

  const q = search.trim().toLowerCase();
  const filtered = rows.filter((c) => {
    if (!q) return true;
    return `${c.users?.full_name ?? ""} ${c.users?.phone ?? ""} ${c.users?.email ?? ""} ${c.business_name ?? ""}`.toLowerCase().includes(q);
  });

  if (!isConfigured.supabase) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold text-ink-900">Customers</h1>
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
          <h1 className="text-2xl font-bold text-ink-900">Customers</h1>
          <p className="text-sm text-ink-500">
            {rows.length} customers · {rows.filter((c) => c.is_business).length} business accounts
          </p>
        </div>
        <div className="w-full sm:w-72">
          <Input placeholder="Search name, phone or email…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {error ? (
        <ErrorState title="Could not load customers" message={error} onRetry={() => void load()} />
      ) : loading ? (
        <SkeletonList rows={6} />
      ) : filtered.length === 0 ? (
        <Card><EmptyState icon="👥" title="No customers found" message="No customers match your search yet." /></Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="min-w-full divide-y divide-ink-100 text-sm">
            <thead className="bg-ink-50">
              <tr>
                {["Customer", "Phone", "Account", "Orders", "Total spent", "Loyalty", "Joined", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-50">
              {filtered.map((c) => (
                <tr key={c.id} className="cursor-pointer transition hover:bg-ink-50" onClick={() => void openDetail(c)}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-ink-800">{c.users?.full_name ?? "—"}</p>
                      {c.is_business && <Badge className="bg-brand-100 text-brand-800">Business</Badge>}
                      {c.users?.status === "suspended" && <Badge className="bg-accent-100 text-accent-800">Suspended</Badge>}
                    </div>
                    {c.business_name && <p className="text-xs text-ink-500">{c.business_name}</p>}
                  </td>
                  <td className="px-4 py-3 text-ink-600">{c.users?.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-ink-600">{c.users?.email ?? "—"}</td>
                  <td className="px-4 py-3 font-semibold text-ink-800">{c.total_orders}</td>
                  <td className="px-4 py-3 text-ink-800">{formatNPR(c.total_spent)}</td>
                  <td className="px-4 py-3 text-ink-600">{c.loyalty_points} pts</td>
                  <td className="px-4 py-3 text-xs text-ink-500">{timeAgo(c.created_at)}</td>
                  <td className="px-4 py-3">
                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); void openDetail(c); }}>View</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Detail drawer-modal */}
      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title={detail?.users?.full_name ?? "Customer"} size="lg"
        footer={detail ? (
          <div className="flex justify-between">
            {detail.users?.status === "suspended" ? (
              <Button variant="outline" onClick={() => setConfirmTarget({ customer: detail, suspend: false })}>Restore account</Button>
            ) : (
              <Button variant="accent" onClick={() => setConfirmTarget({ customer: detail, suspend: true })}>Suspend account</Button>
            )}
            <Button variant="ghost" onClick={() => setDetail(null)}>Close</Button>
          </div>
        ) : undefined}>
        {detail && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <div><p className="text-xs text-ink-500">Phone</p><p className="font-medium">{detail.users?.phone ?? "—"}</p></div>
              <div><p className="text-xs text-ink-500">Email</p><p className="font-medium truncate">{detail.users?.email ?? "—"}</p></div>
              <div><p className="text-xs text-ink-500">Referral code</p><p className="font-mono text-xs">{detail.referral_code ?? "—"}</p></div>
              <div><p className="text-xs text-ink-500">Status</p>
                <Badge className={detail.users?.status === "active" ? "bg-green-100 text-green-800" : "bg-accent-100 text-accent-800"}>
                  {detail.users?.status ?? "unknown"}
                </Badge>
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-sm font-semibold text-ink-800">Orders ({orders.length})</h4>
              {loadingDetail ? <SkeletonList rows={3} /> : orders.length === 0 ? (
                <p className="text-sm text-ink-500">No orders yet.</p>
              ) : (
                <ul className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                  {orders.map((o) => (
                    <li key={o.id}>
                      <Link to={`/admin/orders/${o.id}`}
                        className="flex items-center justify-between gap-2 rounded-lg border border-ink-100 px-3 py-2 text-sm transition hover:border-brand-200">
                        <span className="font-mono text-xs text-brand-700">{o.order_code ?? o.id.slice(0, 8)}</span>
                        <span className="text-xs text-ink-500">{formatDateTime(o.created_at)}</span>
                        <span className="font-medium">{formatNPR(o.total_amount)}</span>
                        <StatusBadge status={o.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h4 className="mb-2 text-sm font-semibold text-ink-800">Payments ({payments.length})</h4>
              {loadingDetail ? <SkeletonList rows={2} /> : payments.length === 0 ? (
                <p className="text-sm text-ink-500">No digital payments recorded.</p>
              ) : (
                <ul className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
                  {payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between rounded-lg bg-ink-50 px-3 py-2 text-xs">
                      <span className="capitalize font-medium">{p.provider}</span>
                      <span>{formatNPR(p.amount)}</span>
                      <Badge className={cn(p.status === "successful" ? "bg-green-100 text-green-800" : p.status === "failed" ? "bg-accent-100 text-accent-800" : "bg-amber-100 text-amber-800")}>{p.status}</Badge>
                      <span className="font-mono text-ink-400">{p.transaction_reference ?? "—"}</span>
                      <span className="text-ink-400">{timeAgo(p.created_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h4 className="mb-2 text-sm font-semibold text-ink-800">Cancellations ({cancellations.length})</h4>
              {loadingDetail ? <SkeletonList rows={1} /> : cancellations.length === 0 ? (
                <p className="text-sm text-ink-500">No cancellations — happy customer.</p>
              ) : (
                <ul className="space-y-1.5">
                  {cancellations.map((c) => (
                    <li key={c.id} className="rounded-lg bg-accent-50 px-3 py-2 text-xs text-accent-800">
                      <Link to={`/admin/orders/${c.order_id}`} className="font-mono hover:underline">{c.order_id.slice(0, 8)}</Link> · {c.reason}
                      <span className="ml-2 text-accent-500">{timeAgo(c.created_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Suspend / restore confirm */}
      <Modal open={Boolean(confirmTarget)} onClose={() => setConfirmTarget(null)} size="sm"
        title={confirmTarget?.suspend ? "Suspend customer" : "Restore customer"}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmTarget(null)}>Cancel</Button>
            <Button variant={confirmTarget?.suspend ? "accent" : "primary"} loading={acting}
              onClick={() => confirmTarget && void toggleSuspension(confirmTarget.customer, confirmTarget.suspend)}>
              {confirmTarget?.suspend ? "Suspend" : "Restore"}
            </Button>
          </div>
        }>
        <p className="text-sm text-ink-600">
          {confirmTarget?.suspend
            ? <>Suspend <span className="font-semibold">{confirmTarget?.customer.users?.full_name ?? "this customer"}</span>? They will be blocked from placing new orders. This is recorded in the audit log.</>
            : <>Restore <span className="font-semibold">{confirmTarget?.customer.users?.full_name ?? "this customer"}</span>? They will be able to order again immediately.</>}
        </p>
      </Modal>
    </div>
  );
}
