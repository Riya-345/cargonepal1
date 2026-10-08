// ============================================================
// CargoNepal — Rider profile (spec §9 screen 23, §24)
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Card, Badge, Button, Input, Select, Toggle, Spinner, useToast, Skeleton,
} from "@/components/ui";
import { useAuth } from "@/core/hooks/useAuth";
import { supabase } from "@/services/supabaseClient";
import { signOut } from "@/services/auth/authService";
import { getPublicUrl } from "@/services/storage/storageService";
import { isConfigured } from "@/core/config/env";
import { BRAND, SERVICE_CITIES } from "@/core/constants";
import { cn, formatNPR } from "@/core/utils";
import type { RiderDocument, Vehicle } from "@/models/types";

const DOC_LABEL: Record<string, string> = {
  license: "Driving license",
  citizenship: "Citizenship",
  bluebook: "Vehicle bluebook",
  vehicle: "Vehicle photo",
};

function Stars({ value }: { value: number }) {
  const full = Math.round(value);
  return (
    <span className="text-amber-500" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= full ? "" : "opacity-25"}>★</span>
      ))}
    </span>
  );
}

export default function ProfileScreen() {
  const { user, riderProfile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [docs, setDocs] = useState<RiderDocument[]>([]);
  const [loading, setLoading] = useState(true);

  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [city, setCity] = useState(riderProfile?.primary_city ?? SERVICE_CITIES[0]);
  const [saving, setSaving] = useState(false);
  const [availabilityBusy, setAvailabilityBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user || !isConfigured.supabase) { setLoading(false); return; }
    setLoading(true);
    const [{ data: v }, { data: d }] = await Promise.all([
      supabase.from("vehicles").select("*").eq("rider_id", user.id).maybeSingle(),
      supabase.from("rider_documents").select("*").eq("rider_id", user.id).order("doc_type"),
    ]);
    setVehicle((v as Vehicle) ?? null);
    setDocs((d as RiderDocument[]) ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (riderProfile?.primary_city) setCity(riderProfile.primary_city); }, [riderProfile?.primary_city]);
  useEffect(() => { if (user?.full_name) setFullName(user.full_name); }, [user?.full_name]);

  const avatarUrl = user?.avatar_url
    ? (user.avatar_url.startsWith("http") ? user.avatar_url : getPublicUrl("avatars", user.avatar_url))
    : null;

  async function saveProfile() {
    if (!user) return;
    setSaving(true);
    try {
      if (fullName.trim() && fullName.trim() !== user.full_name) {
        const { error } = await supabase.from("users").update({ full_name: fullName.trim() }).eq("id", user.id);
        if (error) throw new Error(error.message);
      }
      if (city !== riderProfile?.primary_city) {
        const { error } = await supabase.from("rider_profiles").update({ primary_city: city }).eq("id", user.id);
        if (error) throw new Error(error.message);
      }
      await refreshProfile();
      toast("Profile updated.", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save profile.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function toggleAvailability(next: boolean) {
    if (!user) return;
    if (riderProfile?.availability === "busy") { toast("Finish your active delivery first.", "info"); return; }
    setAvailabilityBusy(true);
    try {
      const { error } = await supabase.from("rider_profiles")
        .update({ availability: next ? "online" : "offline" }).eq("id", user.id);
      if (error) throw new Error(error.message);
      await refreshProfile();
      toast(next ? "You're online." : "You're offline.", next ? "success" : "info");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not change availability.", "error");
    } finally {
      setAvailabilityBusy(false);
    }
  }

  if (!isConfigured.supabase) {
    return (
      <div className="py-8">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Supabase isn't configured yet. <Link className="underline font-semibold" to="/setup">Open the setup guide</Link>.
        </div>
      </div>
    );
  }

  const online = riderProfile?.availability === "online";
  const isBusy = riderProfile?.availability === "busy";

  return (
    <div className="space-y-5">
      {/* Identity card */}
      <Card className="p-5">
        <div className="flex items-center gap-4">
          {avatarUrl ? (
            <img src={avatarUrl} alt="Rider" className="h-16 w-16 rounded-full object-cover ring-2 ring-brand-100" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-2xl">🛵</div>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-lg font-bold text-ink-900">{user?.full_name ?? "Rider"}</div>
            <div className="truncate text-sm text-ink-500">{user?.phone ?? user?.email ?? ""}</div>
            <div className="mt-1.5 flex items-center gap-2">
              <Badge className={
                riderProfile?.status === "approved" ? "bg-green-100 text-green-800"
                : riderProfile?.status === "rejected" ? "bg-accent-100 text-accent-800"
                : "bg-amber-100 text-amber-800"
              }>
                {riderProfile?.status ?? "pending"}
              </Badge>
              <span className="text-xs text-ink-400">{riderProfile?.primary_city ?? "—"}</span>
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3 border-t border-ink-100 pt-4 text-center">
          <div>
            <div className="text-lg font-bold text-ink-900">{riderProfile ? riderProfile.rating_avg.toFixed(1) : "—"}</div>
            <div className="text-[11px] text-ink-400">Rating</div>
            <Stars value={riderProfile?.rating_avg ?? 0} />
          </div>
          <div>
            <div className="text-lg font-bold text-ink-900">{riderProfile?.total_deliveries ?? 0}</div>
            <div className="text-[11px] text-ink-400">Deliveries</div>
          </div>
          <div>
            <div className="text-lg font-bold text-green-600">{formatNPR(riderProfile?.wallet_balance ?? 0)}</div>
            <div className="text-[11px] text-ink-400">Wallet</div>
          </div>
        </div>
      </Card>

      {/* Availability quick toggle */}
      <Card className="flex items-center justify-between p-4">
        <div>
          <div className="font-semibold text-ink-800">Availability</div>
          <div className="text-xs text-ink-500">
            {isBusy ? "On a delivery" : online ? "Online — receiving requests" : "Offline"}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {availabilityBusy && <Spinner className="h-4 w-4 text-brand-600" />}
          <Toggle checked={online} onChange={toggleAvailability} disabled={isBusy || availabilityBusy} label="Availability" />
        </div>
      </Card>

      {/* Editable details */}
      <Card className="space-y-4 p-5">
        <h3 className="font-semibold text-ink-800">Edit details</h3>
        <Input label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        <Select label="Primary city" value={city} onChange={(e) => setCity((e.target as HTMLSelectElement).value)}>
          {SERVICE_CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
        <Button className="w-full" loading={saving} onClick={() => void saveProfile()}>Save changes</Button>
      </Card>

      {/* Vehicle */}
      <Card className="p-5">
        <h3 className="mb-3 font-semibold text-ink-800">Vehicle</h3>
        {loading ? (
          <Skeleton className="h-20 w-full rounded-xl" />
        ) : vehicle ? (
          <div className="flex items-start gap-4">
            {vehicle.photo_url ? (
              <img src={vehicle.photo_url.startsWith("http") ? vehicle.photo_url : (getPublicUrl("rider-documents", vehicle.photo_url) ?? "")}
                alt="Vehicle" className="h-16 w-16 rounded-xl object-cover" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-ink-100 text-2xl">🏍️</div>
            )}
            <div className="text-sm">
              <div className="font-medium text-ink-800 capitalize">{vehicle.vehicle_type.replace("_", " ")}</div>
              <div className="text-ink-600">{vehicle.make_model ?? "—"}</div>
              <div className="text-ink-500">Plate: {vehicle.license_plate}</div>
              <div className="text-ink-500">{[vehicle.color, vehicle.year].filter(Boolean).join(" · ") || "—"}</div>
              <Badge className={vehicle.is_verified ? "mt-1 bg-green-100 text-green-800" : "mt-1 bg-amber-100 text-amber-800"}>
                {vehicle.is_verified ? "Verified" : "Not verified"}
              </Badge>
            </div>
          </div>
        ) : (
          <p className="text-sm text-ink-500">No vehicle registered.</p>
        )}
      </Card>

      {/* Documents */}
      <Card className="p-5">
        <h3 className="mb-3 font-semibold text-ink-800">Documents</h3>
        {loading ? (
          <Skeleton className="h-20 w-full rounded-xl" />
        ) : docs.length === 0 ? (
          <p className="text-sm text-ink-500">No documents on file.</p>
        ) : (
          <ul className="space-y-2">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center justify-between rounded-xl border border-ink-100 px-3 py-2.5">
                <span className="text-sm text-ink-700">{DOC_LABEL[d.doc_type] ?? d.doc_type}</span>
                <Badge className={cn(
                  d.status === "approved" ? "bg-green-100 text-green-800"
                  : d.status === "rejected" ? "bg-accent-100 text-accent-800"
                  : "bg-amber-100 text-amber-800")}>
                  {d.status}
                </Badge>
              </li>
            ))}
          </ul>
        )}
        <Link to="/rider/verification" className="mt-3 inline-block text-sm font-semibold text-brand-600 hover:underline">
          View verification status →
        </Link>
      </Card>

      {/* Support + sign out */}
      <Card className="space-y-3 p-5">
        <a href={`mailto:${BRAND.supportEmail}`} className="cn-btn-outline w-full py-3 text-sm">
          📧 Contact support
        </a>
        <p className="text-center text-xs text-ink-400">{BRAND.supportPhone}</p>
        <Button variant="accent" className="w-full" onClick={async () => { await signOut(); navigate("/"); }}>
          Sign out
        </Button>
      </Card>
    </div>
  );
}
