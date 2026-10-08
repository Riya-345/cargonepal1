// ============================================================
// CargoNepal — Admin COD settlements (spec §16)
// ============================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase, invoke } from "@/services/supabaseClient";
import { isConfigured } from "@/core/config/env";
import {
  Button, Card, Badge, Input, Select, Textarea, Modal,
  SkeletonList, EmptyState, ErrorState, useToast,
} from "@/components/ui";
import { cn, formatNPR, formatDateTime } from "@/core/utils";
import type { CodTransaction, RiderProfile, User } from "@/models/types";

type CodRow = CodTransaction & {
  orders: { id: string; order_code: string | null } | null;
  rider?: { id: string; name: string; phone: string | null } | null;
};

interface RiderBalance {
  id: string;
  name: string;
  phone: string | null;
  cod_balance: number;
  pending_amount: number;
  pending_count: number;
}

type Tab = "collected" | "settled";

export default function CodScreen() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("collected");
  const [rows, setRows] = useState<CodRow[]>([]);
  const [balances, setBalances] = useState<RiderBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [riderFilter, setRiderFilter] = useState("");

  const [settleOpen, setSettleOpen] = useState(false);
  const [settleRider, setSettleRider] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [settlementRef, setSettlementRef] = useState("");
  const [note, setNote] = useState("");
  const [settling, setSettling] = useState(false);

  const load = useCallback(async () => {
    if (!isConfigured.supabase) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const [codRes, ridersRes] = await Promise.all([
        supabase.from("cod_transactions")
          .select("*, orders(id, order_code)")
          .eq("status", tab === "collected" ? "collected" : "settled")
          .order("collected_at", { ascending: false })
          .limit(300),
        supabase.from("rider_profiles").select("id, cod_balance").gt("cod_balance", 0).order("cod_balance", { ascending: false }),
      ]);
      if (codRes.error) throw new Error(codRes.error.message);
      const txns = (codRes.data as CodRow[]) ?? [];

      // Resolve rider + customer names for the transactions and balance table.
      const riderIds = [...new Set([
        ...txns.map((t) => t.rider_id),
        ...((ridersRes.data as Pick<RiderProfile, "id" | "cod_balance">[]) ?? []).map((r) => r.id),
      ])];
      const { data: users } = riderIds.length
        ? await supabase.from("users").select("id, full_name, phone").in("id", riderIds)
        : { data: [] as Pick<User, "id" | "full_name" | "phone">[] };
      const uMap = new Map((users ?? []).map((u) => [u.id as string, u as Pick<User, "id" | "full_name" | "phone">]));

      setRows(txns.map((t) => ({
        ...t,
        rider: { id: t.rider_id, name: uMap.get(t.rider_id)?.full_name ?? t.rider_id.slice(0, 8), phone: uMap.get(t.rider_id)?.phone ?? null },
      })));

      const pendingByRider = new Map<string, { amount: number; count: number }>();
      txns.filter((t) => t.status === "collected").forEach((t) => {
        const cur = pendingByRider.get(t.rider_id) ?? { amount: 0, count: 0 };
        pendingByRider.set(t.rider_id, { amount: cur.amount + Number(t.amount), count: cur.count + 1 });
      });
      setBalances(((ridersRes.data as Pick<RiderProfile, "id" | "cod_balance">[]) ?? []).map((r) => ({
        id: r.id,
        name: uMap.get(r.id)?.full_name ?? r.id.slice(0, 8),
        phone: uMap.get(r.id)?.phone ?? null,
        cod_balance: Number(r.cod_balance),
        pending_amount: pendingByRider.get(r.id)?.amount ?? 0,
        pending_count: pendingByRider.get(r.id)?.count ?? 0,
      })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load COD data");
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(
    () => (riderFilter ? rows.filter((r) => r.rider_id === riderFilter) : rows),
    [rows, riderFilter],
  );
  const filteredTotal = filtered.reduce((s, r) => s + Number(r.amount), 0);

  function openSettle(riderId?: string) {
    setSettleRider(riderId ?? "");
    setSelectedIds(riderId ? rows.filter((r) => r.rider_id === riderId).map((r) => r.id) : []);
    setSettlementRef("");
    setNote("");
    setSettleOpen(true);
  }

  function toggleTxn(id: string) {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  async function settle() {
    if (!settleRider) { toast("Select a rider to settle", "error"); return; }
    if (selectedIds.length === 0) { toast("Select at least one COD transaction", "error"); return; }
    if (!settlementRef.trim()) { toast("A settlement reference is required", "error"); return; }
    setSettling(true);
    try {
      await invoke("cod-settle", {
        body: {
          rider_id: settleRider,
          cod_transaction_ids: selectedIds,
          settlement_ref: settlementRef.trim(),
          note: note.trim() || undefined,
        },
      });
      toast(`Settled ${selectedIds.length} COD transaction(s)`, "success");
      setSettleOpen(false);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Settlement failed", "error");
    } finally {
      setSettling(false);
    }
  }

  if (!isConfigured.supabase) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold text-ink-900">COD</h1>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Supabase is not configured. <Link to="/setup" className="font-semibold underline">Run setup</Link>.
        </div>
      </div>
    );
  }

  const settleRiderRows = rows.filter((r) => r.rider_id === settleRider);
  const selectedTotal = rows.filter((r) => selectedIds.includes(r.id)).reduce((s, r) => s + Number(r.amount), 0);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Cash on Delivery</h1>
          <p className="text-sm text-ink-500">Rider-collected cash awaiting settlement and settlement history</p>
        </div>
        {tab === "collected" && (
          <Button size="sm" onClick={() => openSettle()}>💵 Settle rider COD</Button>
        )}
      </div>

      {/* Rider balances */}
      <Card className="mb-4 p-5">
        <h3 className="mb-3 text-sm font-semibold text-ink-800">Rider COD balances</h3>
        {balances.length === 0 ? (
          <p className="text-sm text-ink-500">No rider is holding un-settled cash right now. 🎉</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-ink-100 text-sm">
              <thead>
                <tr>
                  {["Rider", "Phone", "Wallet COD balance", "Pending txns", "Pending amount", ""].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                {balances.map((b) => (
                  <tr key={b.id} className="hover:bg-ink-50">
                    <td className="px-3 py-2 font-medium text-ink-800">{b.name}</td>
                    <td className="px-3 py-2 text-ink-600">{b.phone ?? "—"}</td>
                    <td className="px-3 py-2 font-semibold text-amber-700">{formatNPR(b.cod_balance)}</td>
                    <td className="px-3 py-2 text-ink-600">{b.pending_count}</td>
                    <td className="px-3 py-2 text-ink-800">{formatNPR(b.pending_amount)}</td>
                    <td className="px-3 py-2">
                      <Button size="sm" variant="outline" disabled={b.pending_count === 0}
                        onClick={() => openSettle(b.id)}>Settle</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Tabs + filter */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg bg-ink-100 p-1">
          {(["collected", "settled"] as Tab[]).map((t) => (
            <button key={t} onClick={() => { setTab(t); setRiderFilter(""); }}
              className={cn("rounded-md px-4 py-1.5 text-sm font-medium transition",
                tab === t ? "bg-white text-ink-900 shadow-sm" : "text-ink-500 hover:text-ink-800")}>
              {t === "collected" ? "Pending settlement" : "Settled"}
            </button>
          ))}
        </div>
        <div className="w-full sm:w-64">
          <Select value={riderFilter} onChange={(e) => setRiderFilter(e.target.value)}>
            <option value="">All riders</option>
            {[...new Map(rows.map((r) => [r.rider_id, r.rider?.name ?? r.rider_id])).entries()].map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </Select>
        </div>
      </div>

      {error ? (
        <ErrorState title="Could not load COD transactions" message={error} onRetry={() => void load()} />
      ) : loading ? (
        <SkeletonList rows={5} />
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState icon="💵" title={tab === "collected" ? "Nothing to settle" : "No settlements yet"}
            message={tab === "collected"
              ? "All rider-collected cash has been settled."
              : "Completed settlements will appear here."} />
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="min-w-full divide-y divide-ink-100 text-sm">
            <thead className="bg-ink-50">
              <tr>
                {["Order", "Rider", "Amount", "Collected", tab === "settled" ? "Settled" : "Status", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-50">
              {filtered.map((t) => (
                <tr key={t.id} className="transition hover:bg-ink-50">
                  <td className="px-4 py-3">
                    <Link to={`/admin/orders/${t.orders?.id ?? t.order_id}`} className="font-mono text-xs font-semibold text-brand-700 hover:underline">
                      {t.orders?.order_code ?? t.order_id.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink-800">{t.rider?.name}</p>
                    <p className="text-xs text-ink-500">{t.rider?.phone ?? ""}</p>
                  </td>
                  <td className="px-4 py-3 font-semibold text-ink-900">{formatNPR(t.amount)}</td>
                  <td className="px-4 py-3 text-xs text-ink-500">{formatDateTime(t.collected_at)}</td>
                  <td className="px-4 py-3">
                    {tab === "settled"
                      ? <span className="text-xs text-ink-500">{formatDateTime(t.settled_at)}</span>
                      : <Badge className="bg-amber-100 text-amber-800">Collected</Badge>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {tab === "collected" && (
                      <Button size="sm" variant="ghost" onClick={() => { openSettle(t.rider_id); setSelectedIds([t.id]); }}>Settle</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-ink-50">
              <tr>
                <td className="px-4 py-3 text-xs font-semibold uppercase text-ink-500" colSpan={2}>
                  Total ({filtered.length} transactions)
                </td>
                <td className="px-4 py-3 font-bold text-ink-900">{formatNPR(filteredTotal)}</td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </Card>
      )}

      {/* Settle modal */}
      <Modal open={settleOpen} onClose={() => setSettleOpen(false)} title="Settle COD" size="lg"
        footer={
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-ink-700">
              {selectedIds.length} selected · {formatNPR(selectedTotal)}
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setSettleOpen(false)}>Cancel</Button>
              <Button loading={settling} onClick={() => void settle()}>Confirm settlement</Button>
            </div>
          </div>
        }>
        <div className="space-y-4">
          <Select label="Rider" value={settleRider}
            onChange={(e) => {
              setSettleRider(e.target.value);
              setSelectedIds(rows.filter((r) => r.rider_id === e.target.value).map((r) => r.id));
            }}>
            <option value="">Select a rider…</option>
            {[...new Map(rows.map((r) => [r.rider_id, r.rider?.name ?? r.rider_id])).entries()].map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </Select>

          {settleRider && (
            <div>
              <p className="cn-label">Transactions to settle</p>
              <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-xl border border-ink-100 p-2">
                {settleRiderRows.length === 0 && <p className="p-2 text-sm text-ink-500">No collected transactions for this rider in the current list.</p>}
                {settleRiderRows.map((t) => (
                  <label key={t.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-ink-50">
                    <input type="checkbox" className="h-4 w-4 rounded border-ink-300"
                      checked={selectedIds.includes(t.id)} onChange={() => toggleTxn(t.id)} />
                    <span className="font-mono text-xs text-brand-700">{t.orders?.order_code ?? t.order_id.slice(0, 8)}</span>
                    <span className="font-medium">{formatNPR(t.amount)}</span>
                    <span className="ml-auto text-xs text-ink-400">{formatDateTime(t.collected_at)}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <Input label="Settlement reference (required)" value={settlementRef} onChange={(e) => setSettlementRef(e.target.value)}
            placeholder="e.g. Bank transfer voucher #, cash receipt no…" hint="Recorded on every settled transaction for audit." />
          <Textarea label="Note (optional)" rows={2} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Settled via bank transfer to rider's account" />
        </div>
      </Modal>
    </div>
  );
}
