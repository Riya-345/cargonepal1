// ============================================================
// CargoNepal — Admin Promotions / promo codes (spec §25)
// ============================================================
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/services/supabaseClient";
import { useAuth } from "@/core/hooks/useAuth";
import { isConfigured } from "@/core/config/env";
import {
  Button, Card, Badge, Input, Select, Textarea, Modal, Toggle,
  SkeletonList, EmptyState, ErrorState, useToast,
} from "@/components/ui";
import { cn, formatNPR, formatDateTime } from "@/core/utils";
import type { PromoCode, ServiceArea } from "@/models/types";

type PromoRow = PromoCode & {
  starts_at: string;
  created_at: string;
  service_area_id: string | null;
  created_by: string | null;
};

interface PromoForm {
  code: string;
  description: string;
  discount_type: "percentage" | "fixed";
  discount_value: string;
  min_order_amount: string;
  max_discount: string;
  usage_limit: string;
  per_user_limit: string;
  starts_at: string;
  expires_at: string;
  is_active: boolean;
  service_area_id: string;
}

const EMPTY_FORM: PromoForm = {
  code: "", description: "", discount_type: "percentage", discount_value: "10",
  min_order_amount: "0", max_discount: "", usage_limit: "", per_user_limit: "1",
  starts_at: "", expires_at: "", is_active: true, service_area_id: "",
};

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function PromotionsScreen() {
  const { user } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState<PromoRow[]>([]);
  const [areas, setAreas] = useState<ServiceArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<PromoRow | null>(null);
  const [form, setForm] = useState<PromoForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PromoRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!isConfigured.supabase) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const [promoRes, areaRes] = await Promise.all([
        supabase.from("promo_codes").select("*").order("created_at", { ascending: false }).limit(200),
        supabase.from("service_areas").select("*").order("city"),
      ]);
      if (promoRes.error) throw new Error(promoRes.error.message);
      setRows((promoRes.data as PromoRow[]) ?? []);
      setAreas((areaRes.data as ServiceArea[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load promo codes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setEditorOpen(true);
  }

  function openEdit(p: PromoRow) {
    setEditing(p);
    setForm({
      code: p.code,
      description: p.description ?? "",
      discount_type: p.discount_type,
      discount_value: String(p.discount_value),
      min_order_amount: String(p.min_order_amount),
      max_discount: p.max_discount != null ? String(p.max_discount) : "",
      usage_limit: p.usage_limit != null ? String(p.usage_limit) : "",
      per_user_limit: String(p.per_user_limit),
      starts_at: toLocalInput(p.starts_at),
      expires_at: toLocalInput(p.expires_at),
      is_active: p.is_active,
      service_area_id: p.service_area_id ?? "",
    });
    setEditorOpen(true);
  }

  async function save() {
    const code = form.code.trim().toUpperCase();
    if (!code) { toast("Promo code is required", "error"); return; }
    if (Number(form.discount_value) <= 0) { toast("Discount value must be greater than 0", "error"); return; }
    setSaving(true);
    const payload = {
      code,
      description: form.description.trim() || null,
      discount_type: form.discount_type,
      discount_value: Number(form.discount_value),
      min_order_amount: Number(form.min_order_amount || 0),
      max_discount: form.max_discount ? Number(form.max_discount) : null,
      usage_limit: form.usage_limit ? Number(form.usage_limit) : null,
      per_user_limit: Number(form.per_user_limit || 1),
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : new Date().toISOString(),
      expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
      is_active: form.is_active,
      service_area_id: form.service_area_id || null,
      updated_at: new Date().toISOString(),
    };
    try {
      const { error: e } = editing
        ? await supabase.from("promo_codes").update(payload).eq("id", editing.id)
        : await supabase.from("promo_codes").insert({ ...payload, created_by: user?.id ?? null });
      if (e) throw new Error(e.message);
      toast(editing ? "Promo code updated" : "Promo code created", "success");
      setEditorOpen(false);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to save promo code", "error");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(p: PromoRow) {
    const { error: e } = await supabase.from("promo_codes")
      .update({ is_active: !p.is_active, updated_at: new Date().toISOString() })
      .eq("id", p.id);
    if (e) { toast(e.message, "error"); return; }
    toast(p.is_active ? `${p.code} disabled` : `${p.code} activated`, "success");
    await load();
  }

  async function remove() {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error: e } = await supabase.from("promo_codes").delete().eq("id", deleteTarget.id);
    if (e) toast(e.message, "error");
    else { toast(`${deleteTarget.code} deleted`, "success"); setDeleteTarget(null); await load(); }
    setDeleting(false);
  }

  if (!isConfigured.supabase) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold text-ink-900">Promotions</h1>
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
          <h1 className="text-2xl font-bold text-ink-900">Promotions</h1>
          <p className="text-sm text-ink-500">{rows.length} promo codes · {rows.filter((r) => r.is_active).length} active</p>
        </div>
        <Button size="sm" onClick={openCreate}>+ New promo code</Button>
      </div>

      {error ? (
        <ErrorState title="Could not load promotions" message={error} onRetry={() => void load()} />
      ) : loading ? (
        <SkeletonList rows={5} />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState icon="🎟️" title="No promo codes yet"
            message="Create your first campaign — e.g. WELCOME10 for 10% off first deliveries."
            action={<Button onClick={openCreate}>Create promo code</Button>} />
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="min-w-full divide-y divide-ink-100 text-sm">
            <thead className="bg-ink-50">
              <tr>
                {["Code", "Discount", "Min order", "Max discount", "Usage", "Per user", "Area", "Validity", "Active", "Actions"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-50">
              {rows.map((p) => {
                const expired = p.expires_at ? new Date(p.expires_at).getTime() < Date.now() : false;
                const area = areas.find((a) => a.id === p.service_area_id);
                return (
                  <tr key={p.id} className={cn("transition hover:bg-ink-50", !p.is_active && "opacity-60")}>
                    <td className="px-4 py-3">
                      <p className="font-mono font-bold text-brand-700">{p.code}</p>
                      {p.description && <p className="max-w-[180px] truncate text-xs text-ink-500">{p.description}</p>}
                    </td>
                    <td className="px-4 py-3 font-semibold text-ink-800">
                      {p.discount_type === "percentage" ? `${Number(p.discount_value)}%` : formatNPR(p.discount_value)}
                    </td>
                    <td className="px-4 py-3 text-ink-600">{formatNPR(p.min_order_amount)}</td>
                    <td className="px-4 py-3 text-ink-600">{p.max_discount != null ? formatNPR(p.max_discount) : "—"}</td>
                    <td className="px-4 py-3 text-ink-600">{p.used_count} / {p.usage_limit ?? "∞"}</td>
                    <td className="px-4 py-3 text-ink-600">{p.per_user_limit}</td>
                    <td className="px-4 py-3 text-ink-600">{area?.city ?? "All Nepal"}</td>
                    <td className="px-4 py-3 text-xs text-ink-500">
                      {formatDateTime(p.starts_at)} → {p.expires_at ? formatDateTime(p.expires_at) : "no expiry"}
                      {expired && <Badge className="ml-1 bg-accent-100 text-accent-800">Expired</Badge>}
                    </td>
                    <td className="px-4 py-3">
                      <Toggle checked={p.is_active} onChange={() => void toggleActive(p)} label={`Toggle ${p.code}`} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>Edit</Button>
                        <Button size="sm" variant="ghost" className="text-accent-600" onClick={() => setDeleteTarget(p)}>Delete</Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {/* Create / edit modal */}
      <Modal open={editorOpen} onClose={() => setEditorOpen(false)} size="lg"
        title={editing ? `Edit ${editing.code}` : "New promo code"}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditorOpen(false)}>Cancel</Button>
            <Button loading={saving} onClick={() => void save()}>{editing ? "Save changes" : "Create promo"}</Button>
          </div>
        }>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Code" placeholder="WELCOME10" value={form.code}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
            hint="Uppercase, shown to customers at checkout" />
          <Select label="Discount type" value={form.discount_type}
            onChange={(e) => setForm((f) => ({ ...f, discount_type: e.target.value as "percentage" | "fixed" }))}>
            <option value="percentage">Percentage (%)</option>
            <option value="fixed">Fixed amount (NPR)</option>
          </Select>
          <Input label="Discount value" type="number" min="0" step="0.5" value={form.discount_value}
            onChange={(e) => setForm((f) => ({ ...f, discount_value: e.target.value }))} />
          <Input label="Max discount (NPR, optional)" type="number" min="0" value={form.max_discount}
            onChange={(e) => setForm((f) => ({ ...f, max_discount: e.target.value }))}
            hint="Cap for percentage discounts" />
          <Input label="Minimum order amount (NPR)" type="number" min="0" value={form.min_order_amount}
            onChange={(e) => setForm((f) => ({ ...f, min_order_amount: e.target.value }))} />
          <Input label="Total usage limit (blank = unlimited)" type="number" min="1" value={form.usage_limit}
            onChange={(e) => setForm((f) => ({ ...f, usage_limit: e.target.value }))} />
          <Input label="Per-user limit" type="number" min="1" value={form.per_user_limit}
            onChange={(e) => setForm((f) => ({ ...f, per_user_limit: e.target.value }))} />
          <Select label="Service area" value={form.service_area_id}
            onChange={(e) => setForm((f) => ({ ...f, service_area_id: e.target.value }))}>
            <option value="">All Nepal</option>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.city}{a.district ? ` · ${a.district}` : ""}</option>)}
          </Select>
          <Input label="Starts at" type="datetime-local" value={form.starts_at}
            onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))} />
          <Input label="Expires at (optional)" type="datetime-local" value={form.expires_at}
            onChange={(e) => setForm((f) => ({ ...f, expires_at: e.target.value }))} />
          <div className="sm:col-span-2">
            <Textarea label="Description" rows={2} value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="10% off your first delivery — welcome to CargoNepal!" />
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <Toggle checked={form.is_active} onChange={(v) => setForm((f) => ({ ...f, is_active: v }))} label="Active" />
            Active immediately
          </label>
        </div>
      </Modal>

      {/* Delete confirm */}
      <Modal open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} size="sm" title="Delete promo code"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Keep</Button>
            <Button variant="accent" loading={deleting} onClick={() => void remove()}>Delete</Button>
          </div>
        }>
        <p className="text-sm text-ink-600">
          Delete <span className="font-mono font-semibold">{deleteTarget?.code}</span>? Past orders keep their discount,
          but the code can no longer be redeemed. Consider disabling it instead.
        </p>
      </Modal>
    </div>
  );
}
