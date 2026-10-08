// ============================================================
// CargoNepal — Saved addresses CRUD (spec §28)
// Direct Supabase reads/writes on `addresses` (RLS: owner only).
// ============================================================
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Button, Card, Input, Select, Toggle, Modal, SkeletonList,
  EmptyState, ErrorState, Badge, useToast,
} from "@/components/ui";
import { MapView } from "@/components/MapView";
import { useAuth } from "@/core/hooks/useAuth";
import { useGeolocation } from "@/core/hooks/useGeolocation";
import { reverseGeocode } from "@/services/maps/mapsService";
import { supabase } from "@/services/supabaseClient";
import { isConfigured, NEPAL_CENTER } from "@/core/config/env";
import { SERVICE_CITIES } from "@/core/constants";
import { cn, isValidNepaliMobile } from "@/core/utils";
import type { Address } from "@/models/types";

interface AddressForm {
  id: string | null;
  label: string;
  contact_name: string;
  contact_phone: string;
  address_line1: string;
  city: string;
  lat: number | null;
  lng: number | null;
  is_default: boolean;
}

const EMPTY_FORM: AddressForm = {
  id: null, label: "", contact_name: "", contact_phone: "",
  address_line1: "", city: "", lat: null, lng: null, is_default: false,
};

export default function AddressesScreen() {
  const { user } = useAuth();
  const toast = useToast();
  const geo = useGeolocation();

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<AddressForm>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Address | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!isConfigured.supabase || !user?.id) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    const { data, error: e } = await supabase.from("addresses").select("*")
      .eq("user_id", user.id).order("is_default", { ascending: false }).order("label");
    if (e) setError(e.message);
    else setAddresses((data as Address[]) ?? []);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { void load(); }, [load]);

  function openAdd() {
    setForm({ ...EMPTY_FORM, is_default: addresses.length === 0, contact_name: user?.full_name ?? "", contact_phone: user?.phone ?? "" });
    setFormErrors({});
    setFormOpen(true);
  }

  function openEdit(a: Address) {
    setForm({
      id: a.id, label: a.label, contact_name: a.contact_name ?? "", contact_phone: a.contact_phone ?? "",
      address_line1: a.address_line1 ?? "", city: a.city ?? "", lat: a.lat, lng: a.lng, is_default: a.is_default,
    });
    setFormErrors({});
    setFormOpen(true);
  }

  async function setPin(p: { lat: number; lng: number }) {
    setForm((f) => ({ ...f, lat: p.lat, lng: p.lng }));
    setFormErrors((e) => ({ ...e, pin: "" }));
    const addr = await reverseGeocode(p);
    setForm((f) => (f.lat === p.lat && f.lng === p.lng && !f.address_line1 ? { ...f, address_line1: addr } : f));
  }

  async function useCurrentLocation() {
    const p = await geo.request(false);
    if (p) await setPin(p);
    else toast(geo.error ?? "Could not get your location", "error");
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.label.trim()) e.label = "Give this address a name (Home, Work…).";
    if (!form.address_line1.trim()) e.address_line1 = "Street address is required.";
    if (form.lat == null || form.lng == null) e.pin = "Set the location on the map.";
    if (form.contact_phone && !isValidNepaliMobile(form.contact_phone)) e.contact_phone = "Enter a valid Nepali mobile (98XXXXXXXX).";
    setFormErrors(e);
    return Object.keys(e).length === 0;
  }

  async function save() {
    if (!user?.id || saving || !validate()) return;
    setSaving(true);
    try {
      const row = {
        user_id: user.id,
        label: form.label.trim(),
        contact_name: form.contact_name.trim() || null,
        contact_phone: form.contact_phone.trim() || null,
        address_line1: form.address_line1.trim(),
        city: form.city || null,
        lat: form.lat!, lng: form.lng!,
        is_default: form.is_default,
      };
      if (form.is_default) {
        await supabase.from("addresses").update({ is_default: false }).eq("user_id", user.id);
      }
      const { error: e } = form.id
        ? await supabase.from("addresses").update(row).eq("id", form.id).eq("user_id", user.id)
        : await supabase.from("addresses").insert(row);
      if (e) throw new Error(e.message);
      toast(form.id ? "Address updated" : "Address saved", "success");
      setFormOpen(false);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not save the address", "error");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      const { error: e } = await supabase.from("addresses").delete().eq("id", deleteTarget.id);
      if (e) throw new Error(e.message);
      toast("Address deleted", "success");
      setDeleteTarget(null);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not delete the address", "error");
    } finally {
      setDeleting(false);
    }
  }

  if (!isConfigured.supabase) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        Saved addresses require a configured Supabase backend.{" "}
        <Link to="/setup" className="font-semibold underline">Open the setup guide</Link>.
      </div>
    );
  }

  const pin = form.lat != null && form.lng != null ? { lat: form.lat, lng: form.lng } : null;

  return (
    <div className="pb-4 space-y-4 animate-fade-in">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/customer/profile" className="text-ink-400 hover:text-ink-700 text-xl leading-none">←</Link>
          <h1 className="font-display text-xl font-bold text-ink-900">Saved addresses</h1>
        </div>
        <Button size="sm" onClick={openAdd}>+ Add</Button>
      </header>

      {loading ? (
        <SkeletonList rows={3} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : addresses.length === 0 ? (
        <EmptyState icon="📍" title="No saved addresses"
          message="Save your home, work or frequent drop-off points to book deliveries in seconds."
          action={<Button onClick={openAdd}>Add your first address</Button>} />
      ) : (
        <div className="space-y-2">
          {addresses.map((a) => (
            <Card key={a.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                    {a.label}
                    {a.is_default && <Badge className="bg-brand-100 text-brand-800">Default</Badge>}
                  </p>
                  <p className="mt-0.5 text-sm text-ink-600">{a.address_line1 ?? `${a.lat.toFixed(5)}, ${a.lng.toFixed(5)}`}</p>
                  <p className="text-xs text-ink-400">
                    {[a.city, a.contact_name, a.contact_phone].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(a)}>Edit</Button>
                  <Button variant="ghost" size="sm" className="text-accent-600" onClick={() => setDeleteTarget(a)}>Delete</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit modal */}
      <Modal open={formOpen} onClose={() => setFormOpen(false)}
        title={form.id ? "Edit address" : "Add address"} size="lg"
        footer={
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button className="flex-1" loading={saving} onClick={() => void save()}>
              {form.id ? "Save changes" : "Save address"}
            </Button>
          </div>
        }>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Label *" placeholder="Home / Work / …" value={form.label}
              error={formErrors.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} />
            <Select label="City" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}>
              <option value="">Select city</option>
              {SERVICE_CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>
          <Input label="Street address *" placeholder="Street, landmark, area…" value={form.address_line1}
            error={formErrors.address_line1} onChange={(e) => setForm((f) => ({ ...f, address_line1: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Contact name" value={form.contact_name}
              onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))} />
            <Input label="Contact phone" type="tel" placeholder="98XXXXXXXX" value={form.contact_phone}
              error={formErrors.contact_phone} onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))} />
          </div>

          <div>
            <span className="cn-label">Map location *</span>
            <div className="h-48 w-full overflow-hidden rounded-2xl border border-ink-100">
              <MapView center={pin ?? NEPAL_CENTER} zoom={pin ? 15 : 12}
                onMapClick={(p) => void setPin(p)}
                draggableMarker={pin ? { point: pin, onDragEnd: (p) => void setPin(p) } : null} />
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <Button type="button" variant="outline" size="sm" loading={geo.status === "locating"}
                onClick={() => void useCurrentLocation()}>
                📍 Use current location
              </Button>
              <span className={cn("text-xs", formErrors.pin ? "text-accent-600" : "text-ink-400")}>
                {formErrors.pin ?? (pin ? `${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}` : "Tap the map to drop a pin")}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-ink-200 px-4 py-3">
            <p className="text-sm font-medium text-ink-800">Set as default address</p>
            <Toggle checked={form.is_default} label="Default address"
              onChange={(v) => setForm((f) => ({ ...f, is_default: v }))} />
          </div>
        </div>
      </Modal>

      {/* Delete confirm modal */}
      <Modal open={deleteTarget !== null} onClose={() => setDeleteTarget(null)} title="Delete address?" size="sm"
        footer={
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteTarget(null)}>Keep</Button>
            <Button variant="accent" className="flex-1" loading={deleting} onClick={() => void confirmDelete()}>Delete</Button>
          </div>
        }>
        <p className="text-sm text-ink-600">
          Remove <strong>{deleteTarget?.label}</strong> ({deleteTarget?.address_line1}) from your saved addresses?
          This cannot be undone.
        </p>
      </Modal>
    </div>
  );
}
