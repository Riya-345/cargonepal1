// ============================================================
// CargoNepal — Admin Riders management (spec §22)
// ============================================================
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase, invoke } from "@/services/supabaseClient";
import { getSignedUrl } from "@/services/storage/storageService";
import { isConfigured } from "@/core/config/env";
import {
  Button, Card, Badge, Input, Select, Modal, Textarea,
  SkeletonList, EmptyState, ErrorState, useToast,
} from "@/components/ui";
import { cn, formatNPR, formatDateTime, timeAgo } from "@/core/utils";
import type { Order, RiderDocument, RiderEarning, RiderProfile, RiderStatus, User, Vehicle } from "@/models/types";

type RiderRow = RiderProfile & {
  users: Pick<User, "id" | "full_name" | "phone" | "email" | "avatar_url"> | null;
  vehicles: Vehicle[];
};

const STATUS_TONES: Record<RiderStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-accent-100 text-accent-800",
  suspended: "bg-ink-200 text-ink-700",
};

type StatusAction = "approve" | "reject" | "suspend" | "activate";

export default function RidersScreen() {
  const toast = useToast();
  const [riders, setRiders] = useState<RiderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [availFilter, setAvailFilter] = useState<string>("");
  const [search, setSearch] = useState("");

  const [detail, setDetail] = useState<RiderRow | null>(null);
  const [docs, setDocs] = useState<RiderDocument[]>([]);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [earnings, setEarnings] = useState<RiderEarning[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [actionTarget, setActionTarget] = useState<{ rider: RiderRow; action: StatusAction } | null>(null);
  const [reason, setReason] = useState("");
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    if (!isConfigured.supabase) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const { data, error: e } = await supabase.from("rider_profiles")
        .select("*, users(id, full_name, phone, email, avatar_url), vehicles(*)")
        .order("created_at", { ascending: false })
        .limit(300);
      if (e) throw new Error(e.message);
      setRiders((data as RiderRow[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load riders");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function openDetail(r: RiderRow) {
    setDetail(r);
    setDocs([]); setRecentOrders([]); setEarnings([]);
    setLoadingDetail(true);
    const [d, o, e] = await Promise.all([
      supabase.from("rider_documents").select("*").eq("rider_id", r.id),
      supabase.from("orders").select("*").eq("rider_id", r.id).order("created_at", { ascending: false }).limit(8),
      supabase.from("rider_earnings").select("*").eq("rider_id", r.id).order("earned_at", { ascending: false }).limit(50),
    ]);
    setDocs((d.data as RiderDocument[]) ?? []);
    setRecentOrders((o.data as Order[]) ?? []);
    setEarnings((e.data as RiderEarning[]) ?? []);
    setLoadingDetail(false);
  }

  async function viewDocument(doc: RiderDocument) {
    const url = await getSignedUrl("rider-documents", doc.file_url);
    if (url) window.open(url, "_blank", "noopener");
    else toast("Could not open document", "error");
  }

  function askAction(rider: RiderRow, action: StatusAction) {
    if (action === "reject" || action === "suspend") {
      setActionTarget({ rider, action });
      setReason("");
    } else {
      void runAction(rider, action, "");
    }
  }

  async function runAction(rider: RiderRow, action: StatusAction, reasonText: string) {
    const needsReason = action === "reject" || action === "suspend";
    const finalReason = reasonText.trim();
    if (needsReason && !finalReason) { toast("A reason is required", "error"); return; }
    setActing(true);
    try {
      await invoke("rider-status", {
        body: { rider_id: rider.id, action, reason: finalReason || undefined },
      });
      toast(`Rider ${action === "approve" ? "approved" : action === "reject" ? "rejected" : action === "suspend" ? "suspended" : "activated"}`, "success");
      setActionTarget(null);
      setDetail(null);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Action failed", "error");
    } finally {
      setActing(false);
    }
  }

  const q = search.trim().toLowerCase();
  const filtered = riders.filter((r) => {
    if (statusFilter && r.status !== statusFilter) return false;
    if (availFilter && r.availability !== availFilter) return false;
    if (q) {
      const hay = `${r.users?.full_name ?? ""} ${r.users?.phone ?? ""} ${r.users?.email ?? ""} ${r.primary_city ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  // Pending approval queue first.
  const sorted = [...filtered].sort((a, b) => (a.status === "pending" ? -1 : 0) - (b.status === "pending" ? -1 : 0));
  const pendingCount = riders.filter((r) => r.status === "pending").length;

  if (!isConfigured.supabase) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold text-ink-900">Riders</h1>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Supabase is not configured. <Link to="/setup" className="font-semibold underline">Run setup</Link>.
        </div>
      </div>
    );
  }

  const totalEarnings = earnings.reduce((s, e) => s + Number(e.net_earning ?? 0), 0);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Riders</h1>
          <p className="text-sm text-ink-500">
            {riders.length} riders · {riders.filter((r) => r.status === "approved").length} approved
            {pendingCount > 0 && <span className="ml-2 font-semibold text-amber-600">{pendingCount} pending approval</span>}
          </p>
        </div>
      </div>

      <Card className="mb-4 grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Input placeholder="Search name, phone, city…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="suspended">Suspended</option>
        </Select>
        <Select value={availFilter} onChange={(e) => setAvailFilter(e.target.value)}>
          <option value="">Any availability</option>
          <option value="online">Online</option>
          <option value="busy">Busy</option>
          <option value="offline">Offline</option>
        </Select>
        <div className="flex items-end">
          <Button variant="outline" size="sm" className="w-full" onClick={() => void load()}>↻ Refresh</Button>
        </div>
      </Card>

      {error ? (
        <ErrorState title="Could not load riders" message={error} onRetry={() => void load()} />
      ) : loading ? (
        <SkeletonList rows={6} />
      ) : sorted.length === 0 ? (
        <Card><EmptyState icon="🛵" title="No riders found" message="No riders match the current filters." /></Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="min-w-full divide-y divide-ink-100 text-sm">
            <thead className="bg-ink-50">
              <tr>
                {["Rider", "City", "Status", "Availability", "Rating", "Deliveries", "COD balance", "Wallet", "Actions"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-50">
              {sorted.map((r) => (
                <tr key={r.id} className={cn("cursor-pointer transition hover:bg-ink-50", r.status === "pending" && "bg-amber-50/60")}
                  onClick={() => void openDetail(r)}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink-800">{r.users?.full_name ?? "—"}</p>
                    <p className="text-xs text-ink-500">{r.users?.phone}</p>
                  </td>
                  <td className="px-4 py-3 text-ink-600">{r.primary_city ?? "—"}</td>
                  <td className="px-4 py-3"><Badge className={STATUS_TONES[r.status]}>{r.status}</Badge></td>
                  <td className="px-4 py-3">
                    <Badge className={r.availability === "online" ? "bg-green-100 text-green-800" : r.availability === "busy" ? "bg-amber-100 text-amber-800" : "bg-ink-100 text-ink-600"}>
                      {r.availability}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-ink-700">⭐ {Number(r.rating_avg).toFixed(1)} <span className="text-xs text-ink-400">({r.rating_count})</span></td>
                  <td className="px-4 py-3 text-ink-700">{r.total_deliveries}</td>
                  <td className={cn("px-4 py-3 font-medium", Number(r.cod_balance) > 0 ? "text-amber-700" : "text-ink-600")}>{formatNPR(r.cod_balance)}</td>
                  <td className="px-4 py-3 text-ink-700">{formatNPR(r.wallet_balance)}</td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex flex-wrap gap-1.5">
                      {r.status === "pending" && (
                        <>
                          <Button size="sm" onClick={() => askAction(r, "approve")}>Approve</Button>
                          <Button size="sm" variant="accent" onClick={() => askAction(r, "reject")}>Reject</Button>
                        </>
                      )}
                      {r.status === "approved" && (
                        <Button size="sm" variant="accent" onClick={() => askAction(r, "suspend")}>Suspend</Button>
                      )}
                      {(r.status === "suspended" || r.status === "rejected") && (
                        <Button size="sm" onClick={() => askAction(r, "activate")}>Activate</Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => void openDetail(r)}>View</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Detail modal */}
      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title={detail?.users?.full_name ?? "Rider"} size="lg">
        {detail && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <div><p className="text-xs text-ink-500">Phone</p><p className="font-medium">{detail.users?.phone ?? "—"}</p></div>
              <div><p className="text-xs text-ink-500">Email</p><p className="font-medium truncate">{detail.users?.email ?? "—"}</p></div>
              <div><p className="text-xs text-ink-500">City</p><p className="font-medium">{detail.primary_city ?? "—"}</p></div>
              <div><p className="text-xs text-ink-500">Last location</p><p className="font-medium">{timeAgo(detail.location_updated_at)}</p></div>
              <div><p className="text-xs text-ink-500">Total deliveries</p><p className="font-medium">{detail.total_deliveries}</p></div>
              <div><p className="text-xs text-ink-500">COD balance</p><p className="font-medium text-amber-700">{formatNPR(detail.cod_balance)}</p></div>
              <div><p className="text-xs text-ink-500">Wallet</p><p className="font-medium">{formatNPR(detail.wallet_balance)}</p></div>
              <div><p className="text-xs text-ink-500">Earnings (last 50 trips)</p><p className="font-medium text-green-700">{formatNPR(totalEarnings)}</p></div>
            </div>

            <div>
              <h4 className="mb-2 text-sm font-semibold text-ink-800">Vehicles</h4>
              {detail.vehicles.length === 0 ? (
                <p className="text-sm text-ink-500">No vehicle registered.</p>
              ) : (
                <ul className="space-y-2">
                  {detail.vehicles.map((v) => (
                    <li key={v.id} className="flex items-center justify-between rounded-lg bg-ink-50 px-3 py-2 text-sm">
                      <span className="capitalize">{v.vehicle_type.replace("_", " ")} · {v.make_model ?? "—"} · <span className="font-mono">{v.license_plate}</span>{v.color ? ` · ${v.color}` : ""}</span>
                      {v.is_verified ? <Badge className="bg-green-100 text-green-800">Verified</Badge> : <Badge className="bg-amber-100 text-amber-800">Unverified</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h4 className="mb-2 text-sm font-semibold text-ink-800">Documents</h4>
              {loadingDetail ? (
                <SkeletonList rows={2} />
              ) : docs.length === 0 ? (
                <p className="text-sm text-ink-500">No documents uploaded.</p>
              ) : (
                <ul className="space-y-2">
                  {docs.map((d) => (
                    <li key={d.id} className="flex items-center justify-between rounded-lg bg-ink-50 px-3 py-2 text-sm">
                      <span>
                        <span className="font-medium capitalize">{d.doc_type}</span>
                        {d.doc_number && <span className="ml-2 font-mono text-xs text-ink-500">{d.doc_number}</span>}
                        {d.expiry_date && <span className="ml-2 text-xs text-ink-400">exp {formatDateTime(d.expiry_date)}</span>}
                      </span>
                      <span className="flex items-center gap-2">
                        <Badge className={STATUS_TONES[d.status]}>{d.status}</Badge>
                        <Button size="sm" variant="outline" onClick={() => void viewDocument(d)}>View file</Button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h4 className="mb-2 text-sm font-semibold text-ink-800">Recent deliveries</h4>
              {loadingDetail ? (
                <SkeletonList rows={2} />
              ) : recentOrders.length === 0 ? (
                <p className="text-sm text-ink-500">No deliveries yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {recentOrders.map((o) => (
                    <li key={o.id}>
                      <Link to={`/admin/orders/${o.id}`}
                        className="flex items-center justify-between rounded-lg border border-ink-100 px-3 py-2 text-sm transition hover:border-brand-200">
                        <span className="font-mono text-xs text-brand-700">{o.order_code ?? o.id.slice(0, 8)}</span>
                        <span className="text-xs text-ink-500">{timeAgo(o.created_at)}</span>
                        <span className="font-medium">{formatNPR(o.total_amount)}</span>
                        <Badge className={o.status === "DELIVERED" ? "bg-green-100 text-green-800" : "bg-ink-100 text-ink-700"}>{o.status.replace(/_/g, " ").toLowerCase()}</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Reason modal for reject/suspend */}
      <Modal open={Boolean(actionTarget && (actionTarget.action === "reject" || actionTarget.action === "suspend"))}
        onClose={() => setActionTarget(null)}
        title={actionTarget?.action === "reject" ? "Reject rider" : "Suspend rider"} size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setActionTarget(null)}>Cancel</Button>
            <Button variant="accent" loading={acting}
              onClick={() => actionTarget && void runAction(actionTarget.rider, actionTarget.action, reason)}>
              {actionTarget?.action === "reject" ? "Reject rider" : "Suspend rider"}
            </Button>
          </div>
        }>
        <p className="mb-3 text-sm text-ink-600">
          {actionTarget?.action === "reject" ? "Rejecting" : "Suspending"} <span className="font-semibold">{actionTarget?.rider.users?.full_name ?? "this rider"}</span>. They will be notified with your reason.
        </p>
        <Textarea label="Reason (required)" rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder={actionTarget?.action === "reject" ? "e.g. License document illegible…" : "e.g. Repeated customer complaints…"} />
      </Modal>
    </div>
  );
}
