// ============================================================
// CargoNepal — Admin Service Areas (spec §26)
// ============================================================
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/services/supabaseClient";
import { isConfigured, NEPAL_CENTER, DEFAULT_ZOOM } from "@/core/config/env";
import { SERVICE_CITIES } from "@/core/constants";
import { MapView } from "@/components/MapView";
import {
  Button, Card, Badge, Input, Select, Modal, Toggle,
  SkeletonList, EmptyState, ErrorState, useToast,
} from "@/components/ui";
import { cn } from "@/core/utils";
import type { ServiceArea } from "@/models/types";

type AreaRow = ServiceArea & {
  operating_hours?: { start?: string; end?: string; days?: number[] };
};

interface AreaForm {
  city: string;
  district: string;
  province: string;
  zone: "standard" | "metro" | "remote";
  center_lat: string;
  center_lng: string;
  radius_km: string;
  pricing_multiplier: string;
  is_active: boolean;
  hours_start: string;
  hours_end: string;
}

const EMPTY_FORM: AreaForm = {
  city: "", district: "", province: "Bagmati", zone: "standard",
  center_lat: "", center_lng: "", radius_km: "15", pricing_multiplier: "1",
  is_active: true, hours_start: "07:00", hours_end: "21:00",
};

const ZONE_TONES: Record<AreaForm["zone"], string> = {
  metro: "bg-brand-100 text-brand-800",
  standard: "bg-blue-100 text-blue-800",
  remote: "bg-amber-100 text-amber-800",
};

export default function ServiceAreasScreen() {
  const toast = useToast();
  const [rows, setRows] = useState<AreaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<AreaRow | null>(null);
  const [form, setForm] = useState<AreaForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AreaRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!isConfigured.supabase) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const { data, error: e } = await supabase.from("service_areas").select("*").order("city");
      if (e) throw new Error(e.message);
      setRows((data as AreaRow[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load service areas");
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

  function openEdit(a: AreaRow) {
    setEditing(a);
    setForm({
      city: a.city,
      district: a.district ?? "",
      province: a.province ?? "",
      zone: a.zone,
      center_lat: a.center_lat != null ? String(a.center_lat) : "",
      center_lng: a.center_lng != null ? String(a.center_lng) : "",
      radius_km: String(a.radius_km),
      pricing_multiplier: String(a.pricing_multiplier),
      is_active: a.is_active,
      hours_start: a.operating_hours?.start ?? "07:00",
      hours_end: a.operating_hours?.end ?? "21:00",
    });
    setEditorOpen(true);
  }

  const pickerPoint = form.center_lat && form.center_lng
    ? { lat: Number(form.center_lat), lng: Number(form.center_lng) }
    : null;

  async function save() {
    if (!form.city.trim()) { toast("City is required", "error"); return; }
    setSaving(true);
    const payload = {
      city: form.city.trim(),
      district: form.district.trim() || null,
      province: form.province.trim() || null,
      zone: form.zone,
      center_lat: form.center_lat ? Number(form.center_lat) : null,
      center_lng: form.center_lng ? Number(form.center_lng) : null,
      radius_km: Number(form.radius_km || 15),
      pricing_multiplier: Number(form.pricing_multiplier || 1),
      is_active: form.is_active,
      operating_hours: { start: form.hours_start, end: form.hours_end, days: [1, 2, 3, 4, 5, 6, 7] },
      updated_at: new Date().toISOString(),
    };
    try {
      const { error: e } = editing
        ? await supabase.from("service_areas").update(payload).eq("id", editing.id)
        : await supabase.from("service_areas").insert(payload);
      if (e) throw new Error(e.message);
      toast(editing ? "Service area updated" : "Service area created", "success");
      setEditorOpen(false);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to save service area", "error");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(a: AreaRow) {
    const { error: e } = await supabase.from("service_areas")
      .update({ is_active: !a.is_active, updated_at: new Date().toISOString() })
      .eq("id", a.id);
    if (e) { toast(e.message, "error"); return; }
    toast(`${a.city} ${a.is_active ? "deactivated" : "activated"}`, "success");
    await load();
  }

  async function remove() {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error: e } = await supabase.from("service_areas").delete().eq("id", deleteTarget.id);
    if (e) toast(e.message, "error");
    else { toast(`${deleteTarget.city} removed`, "success"); setDeleteTarget(null); await load(); }
    setDeleting(false);
  }

  if (!isConfigured.supabase) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold text-ink-900">Service Areas</h1>
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
          <h1 className="text-2xl font-bold text-ink-900">Service Areas</h1>
          <p className="text-sm text-ink-500">
            {rows.length} areas · {rows.filter((r) => r.is_active).length} active — launch cities: {SERVICE_CITIES.join(", ")}
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>+ New service area</Button>
      </div>

      {error ? (
        <ErrorState title="Could not load service areas" message={error} onRetry={() => void load()} />
      ) : loading ? (
        <SkeletonList rows={4} />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState icon="📍" title="No service areas yet"
            message={`Add your first coverage zone. The launch plan covers ${SERVICE_CITIES.join(", ")}.`}
            action={<Button onClick={openCreate}>Create service area</Button>} />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((a) => (
            <Card key={a.id} className={cn("p-5", !a.is_active && "opacity-60")}>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-ink-900">{a.city}</h3>
                  <p className="text-xs text-ink-500">{[a.district, a.province].filter(Boolean).join(" · ") || "—"}</p>
                </div>
                <Badge className={ZONE_TONES[a.zone]}>{a.zone}</Badge>
              </div>
              <dl className="mt-4 space-y-1.5 text-sm">
                <div className="flex justify-between"><dt className="text-ink-500">Radius</dt><dd className="font-medium">{Number(a.radius_km)} km</dd></div>
                <div className="flex justify-between"><dt className="text-ink-500">Pricing multiplier</dt><dd className="font-medium">×{Number(a.pricing_multiplier).toFixed(2)}</dd></div>
                <div className="flex justify-between"><dt className="text-ink-500">Hours</dt><dd className="font-medium">{a.operating_hours?.start ?? "—"} – {a.operating_hours?.end ?? "—"}</dd></div>
                <div className="flex justify-between"><dt className="text-ink-500">Center</dt>
                  <dd className="font-mono text-xs">{a.center_lat != null && a.center_lng != null ? `${Number(a.center_lat).toFixed(4)}, ${Number(a.center_lng).toFixed(4)}` : "not set"}</dd>
                </div>
              </dl>
              <div className="mt-4 flex items-center justify-between border-t border-ink-100 pt-3">
                <label className="flex items-center gap-2 text-xs text-ink-600">
                  <Toggle checked={a.is_active} onChange={() => void toggleActive(a)} label={`Toggle ${a.city}`} />
                  {a.is_active ? "Active" : "Inactive"}
                </label>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(a)}>Edit</Button>
                  <Button size="sm" variant="ghost" className="text-accent-600" onClick={() => setDeleteTarget(a)}>Delete</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create / edit modal */}
      <Modal open={editorOpen} onClose={() => setEditorOpen(false)} size="lg"
        title={editing ? `Edit ${editing.city}` : "New service area"}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditorOpen(false)}>Cancel</Button>
            <Button loading={saving} onClick={() => void save()}>{editing ? "Save changes" : "Create area"}</Button>
          </div>
        }>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="City" list="service-cities" value={form.city}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} placeholder="Kathmandu" />
            <datalist id="service-cities">{SERVICE_CITIES.map((c) => <option key={c} value={c} />)}</datalist>
            <Input label="District" value={form.district}
              onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))} placeholder="Kathmandu" />
            <Input label="Province" value={form.province}
              onChange={(e) => setForm((f) => ({ ...f, province: e.target.value }))} placeholder="Bagmati" />
            <Select label="Zone type" value={form.zone}
              onChange={(e) => setForm((f) => ({ ...f, zone: e.target.value as AreaForm["zone"] }))}>
              <option value="standard">Standard</option>
              <option value="metro">Metro</option>
              <option value="remote">Remote</option>
            </Select>
            <Input label="Radius (km)" type="number" min="1" step="0.5" value={form.radius_km}
              onChange={(e) => setForm((f) => ({ ...f, radius_km: e.target.value }))} />
            <Input label="Pricing multiplier" type="number" min="0.5" step="0.05" value={form.pricing_multiplier}
              onChange={(e) => setForm((f) => ({ ...f, pricing_multiplier: e.target.value }))}
              hint="1.00 = standard fares" />
            <Input label="Opens at" type="time" value={form.hours_start}
              onChange={(e) => setForm((f) => ({ ...f, hours_start: e.target.value }))} />
            <Input label="Closes at" type="time" value={form.hours_end}
              onChange={(e) => setForm((f) => ({ ...f, hours_end: e.target.value }))} />
          </div>

          <div>
            <p className="cn-label">Center point — click the map or type coordinates</p>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Latitude" type="number" step="0.00001" value={form.center_lat}
                onChange={(e) => setForm((f) => ({ ...f, center_lat: e.target.value }))} placeholder="27.7172" />
              <Input label="Longitude" type="number" step="0.00001" value={form.center_lng}
                onChange={(e) => setForm((f) => ({ ...f, center_lng: e.target.value }))} placeholder="85.3240" />
            </div>
            <div className="mt-3 overflow-hidden rounded-xl border border-ink-100">
              <MapView
                className="h-56 w-full"
                center={pickerPoint ?? NEPAL_CENTER}
                zoom={pickerPoint ? DEFAULT_ZOOM : 7}
                markers={pickerPoint ? [{ point: pickerPoint, type: "generic", label: form.city || "Center" }] : []}
                onMapClick={(p) => setForm((f) => ({ ...f, center_lat: p.lat.toFixed(6), center_lng: p.lng.toFixed(6) }))}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-ink-700">
            <Toggle checked={form.is_active} onChange={(v) => setForm((f) => ({ ...f, is_active: v }))} label="Active" />
            Active (accepting orders)
          </label>
        </div>
      </Modal>

      {/* Delete confirm */}
      <Modal open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} size="sm" title="Delete service area"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Keep</Button>
            <Button variant="accent" loading={deleting} onClick={() => void remove()}>Delete</Button>
          </div>
        }>
        <p className="text-sm text-ink-600">
          Delete <span className="font-semibold">{deleteTarget?.city}</span>? Orders there will stop being accepted.
          You can deactivate it instead to keep history.
        </p>
      </Modal>
    </div>
  );
}
