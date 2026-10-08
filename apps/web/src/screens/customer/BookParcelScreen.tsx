// ============================================================
// CargoNepal — Book a parcel: 4-step wizard (spec §6, §7, §16)
// Pickup -> Drop-off -> Parcel details -> Fare & review -> confirm
// ============================================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Button, Card, Input, Textarea, Select, Toggle, Spinner, useToast,
} from "@/components/ui";
import { MapView } from "@/components/MapView";
import { useAuth } from "@/core/hooks/useAuth";
import { useGeolocation } from "@/core/hooks/useGeolocation";
import { estimateFare, createOrder, type FareEstimateResponse } from "@/services/orders/ordersService";
import { compressImage, uploadFile, getSignedUrl } from "@/services/storage/storageService";
import { geocodeSearch, reverseGeocode } from "@/services/maps/mapsService";
import { supabase } from "@/services/supabaseClient";
import { isConfigured, NEPAL_CENTER } from "@/core/config/env";
import {
  PARCEL_CATEGORIES, PAYMENT_METHODS, WEIGHT_PRESETS, SERVICE_CITIES,
  ALLOWED_IMAGE_TYPES, MAX_UPLOAD_MB,
} from "@/core/constants";
import { cn, formatNPR, formatKm, isValidNepaliMobile } from "@/core/utils";
import type { Address, DeliveryPriority, ParcelCategory, PaymentProvider } from "@/models/types";

type Step = 1 | 2 | 3 | 4;
const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: "Pickup" }, { n: 2, label: "Drop-off" },
  { n: 3, label: "Parcel" }, { n: 4, label: "Fare & review" },
];

interface PlaceDraft { lat: number | null; lng: number | null; address: string; city: string }

interface Draft {
  pickup: PlaceDraft & { contact_name: string; contact_phone: string };
  dropoff: PlaceDraft & { receiver_name: string; receiver_phone: string };
  parcel: {
    category: ParcelCategory | ""; description: string; weight_kg: string; quantity: string;
    is_fragile: boolean; declared_value: string; special_instructions: string; parcel_image_url: string;
  };
  cod_enabled: boolean;
  cod_amount: string;
  priority: DeliveryPriority;
  payment_method: PaymentProvider;
  promo_code: string;
}

function cityFromAddress(address: string): string {
  return SERVICE_CITIES.find((c) => address.toLowerCase().includes(c.toLowerCase())) ?? "";
}

function StepIndicator({ current }: { current: Step }) {
  return (
    <div className="flex items-center gap-1.5">
      {STEPS.map((s) => (
        <div key={s.n} className="flex flex-1 flex-col gap-1">
          <div className={cn("h-1.5 rounded-full transition-colors",
            s.n < current ? "bg-brand-600" : s.n === current ? "bg-brand-500" : "bg-ink-200")} />
          <span className={cn("text-[10px] font-medium",
            s.n === current ? "text-brand-700" : "text-ink-400")}>{s.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Map + geocode-search pin picker shared by the pickup & drop-off steps. */
function PinPicker({ point, onPoint, savedAddresses, onPickSaved }: {
  point: { lat: number | null; lng: number | null };
  onPoint: (p: { lat: number; lng: number }) => void;
  savedAddresses: Address[];
  onPickSaved?: (a: Address) => void;
}) {
  const geo = useGeolocation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ point: { lat: number; lng: number }; address: string }[]>([]);
  const [searching, setSearching] = useState(false);

  async function runSearch() {
    const q = query.trim();
    if (!q) { setResults([]); return; }
    setSearching(true);
    try { setResults(await geocodeSearch(q)); } finally { setSearching(false); }
  }

  const pin = point.lat != null && point.lng != null ? { lat: point.lat, lng: point.lng } : null;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input placeholder="Search address or place…" value={query} aria-label="Search address"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void runSearch()} />
        <Button type="button" variant="outline" loading={searching} onClick={() => void runSearch()}>Search</Button>
      </div>
      {results.length > 0 && (
        <Card className="divide-y divide-ink-100 overflow-hidden">
          {results.map((r, i) => (
            <button key={i} type="button"
              onClick={() => { onPoint(r.point); setResults([]); setQuery(r.address); }}
              className="block w-full px-4 py-2.5 text-left text-sm text-ink-700 hover:bg-ink-50">
              {r.address}
            </button>
          ))}
        </Card>
      )}
      <div className="h-56 w-full overflow-hidden rounded-2xl border border-ink-100">
        <MapView center={pin ?? NEPAL_CENTER} zoom={pin ? 15 : 12}
          onMapClick={onPoint}
          draggableMarker={pin ? { point: pin, onDragEnd: onPoint } : null} />
      </div>
      <p className="text-xs text-ink-400">Tap the map or drag the pin to set the exact location.</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" loading={geo.status === "locating"}
          onClick={async () => { const p = await geo.request(false); if (p) onPoint(p); }}>
          📍 Use current location
        </Button>
        {savedAddresses.slice(0, 3).map((a) => (
          <Button key={a.id} type="button" variant="ghost" size="sm"
            onClick={() => onPickSaved ? onPickSaved(a) : onPoint({ lat: a.lat, lng: a.lng })}>
            {a.label}
          </Button>
        ))}
      </div>
      {geo.error && <p className="text-xs text-accent-600">{geo.error}</p>}
    </div>
  );
}

export default function BookParcelScreen() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const prefillAddress = (useLocation().state as { address?: Address } | null)?.address;

  const [step, setStep] = useState<Step>(1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [savedAddresses, setSavedAddresses] = useState<Address[]>([]);
  const [estimate, setEstimate] = useState<FareEstimateResponse | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [draft, setDraft] = useState<Draft>(() => ({
    pickup: { lat: null, lng: null, address: "", city: "", contact_name: "", contact_phone: "" },
    dropoff: { lat: null, lng: null, address: "", city: "", receiver_name: "", receiver_phone: "" },
    parcel: {
      category: "", description: "", weight_kg: "1", quantity: "1",
      is_fragile: false, declared_value: "", special_instructions: "", parcel_image_url: "",
    },
    cod_enabled: false, cod_amount: "", priority: "standard",
    payment_method: "khalti", promo_code: "",
  }));

  const patch = useCallback(<K extends keyof Draft>(key: K, value: Partial<Draft[K]> | Draft[K]) => {
    setDraft((d) => ({
      ...d,
      [key]: typeof value === "object" && !Array.isArray(value)
        ? { ...(d[key] as object), ...(value as object) }
        : value,
    } as Draft));
  }, []);

  // Prefill contact from user profile.
  useEffect(() => {
    if (!user) return;
    setDraft((d) => ({
      ...d,
      pickup: { ...d.pickup, contact_name: d.pickup.contact_name || user.full_name || "", contact_phone: d.pickup.contact_phone || user.phone || "" },
    }));
  }, [user]);

  // Prefill pickup from a saved address tapped on the Home screen.
  useEffect(() => {
    const a = prefillAddress;
    if (!a) return;
    setDraft((d) => ({
      ...d,
      pickup: {
        lat: a.lat, lng: a.lng, address: a.address_line1 ?? `${a.lat.toFixed(5)}, ${a.lng.toFixed(5)}`,
        city: a.city ?? "", contact_name: a.contact_name || d.pickup.contact_name,
        contact_phone: a.contact_phone || d.pickup.contact_phone,
      },
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Saved addresses for quick-pick.
  useEffect(() => {
    if (!isConfigured.supabase || !user?.id) return;
    let mounted = true;
    supabase.from("addresses").select("*").eq("user_id", user.id)
      .order("is_default", { ascending: false }).limit(5)
      .then(({ data }) => { if (mounted && data) setSavedAddresses(data as Address[]); });
    return () => { mounted = false; };
  }, [user?.id]);

  // Reverse-geocode whenever a pin is set without an address.
  const setPickupPoint = useCallback((p: { lat: number; lng: number }) => {
    setDraft((d) => ({ ...d, pickup: { ...d.pickup, lat: p.lat, lng: p.lng } }));
    void reverseGeocode(p).then((addr) => {
      setDraft((d) => (d.pickup.lat === p.lat && d.pickup.lng === p.lng
        ? { ...d, pickup: { ...d.pickup, address: addr, city: cityFromAddress(addr) || d.pickup.city } } : d));
    });
  }, []);
  const setDropoffPoint = useCallback((p: { lat: number; lng: number }) => {
    setDraft((d) => ({ ...d, dropoff: { ...d.dropoff, lat: p.lat, lng: p.lng } }));
    void reverseGeocode(p).then((addr) => {
      setDraft((d) => (d.dropoff.lat === p.lat && d.dropoff.lng === p.lng
        ? { ...d, dropoff: { ...d.dropoff, address: addr, city: cityFromAddress(addr) || d.dropoff.city } } : d));
    });
  }, []);

  const useCod = draft.cod_enabled || draft.payment_method === "cod";

  // Debounced fare estimate on the review step.
  const estimateKey = useMemo(() => JSON.stringify({
    p: [draft.pickup.lat, draft.pickup.lng, draft.pickup.city],
    d: [draft.dropoff.lat, draft.dropoff.lng],
    w: draft.parcel.weight_kg, f: draft.parcel.is_fragile, pr: draft.priority,
    cod: useCod, ca: useCod ? draft.cod_amount : "", promo: draft.promo_code.trim(),
  }), [draft.pickup.lat, draft.pickup.lng, draft.pickup.city, draft.dropoff.lat, draft.dropoff.lng,
    draft.parcel.weight_kg, draft.parcel.is_fragile, draft.priority, useCod, draft.cod_amount, draft.promo_code]);

  useEffect(() => {
    if (step !== 4) return;
    if (draft.pickup.lat == null || draft.dropoff.lat == null) return;
    const t = setTimeout(async () => {
      setEstimating(true);
      setEstimateError(null);
      try {
        const res = await estimateFare({
          pickup: { lat: draft.pickup.lat, lng: draft.pickup.lng!, city: draft.pickup.city || undefined },
          dropoff: { lat: draft.dropoff.lat, lng: draft.dropoff.lng! },
          weight_kg: parseFloat(draft.parcel.weight_kg) || undefined,
          is_cod: useCod,
          cod_amount: useCod ? parseFloat(draft.cod_amount) || undefined : undefined,
          is_fragile: draft.parcel.is_fragile,
          priority: draft.priority,
          promo_code: draft.promo_code.trim() || undefined,
        });
        setEstimate(res);
      } catch (e) {
        setEstimateError(e instanceof Error ? e.message : "Fare estimate failed.");
        setEstimate(null);
      } finally {
        setEstimating(false);
      }
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, estimateKey]);

  function validate(s: Step): boolean {
    const e: Record<string, string> = {};
    if (s === 1) {
      if (draft.pickup.lat == null || draft.pickup.lng == null) e.pin = "Set the pickup location on the map or via search.";
      if (!draft.pickup.address.trim()) e.address = "Pickup address is required.";
      if (!draft.pickup.contact_name.trim()) e.contact_name = "Contact name is required.";
      if (!isValidNepaliMobile(draft.pickup.contact_phone)) e.contact_phone = "Enter a valid Nepali mobile (98XXXXXXXX).";
    }
    if (s === 2) {
      if (draft.dropoff.lat == null || draft.dropoff.lng == null) e.pin = "Set the drop-off location on the map or via search.";
      if (!draft.dropoff.address.trim()) e.address = "Drop-off address is required.";
      if (!draft.dropoff.receiver_name.trim()) e.receiver_name = "Receiver name is required.";
      if (!isValidNepaliMobile(draft.dropoff.receiver_phone)) e.receiver_phone = "Enter a valid Nepali mobile (98XXXXXXXX).";
    }
    if (s === 3) {
      if (!draft.parcel.category) e.category = "Choose what you're sending.";
      if (useCod && !(parseFloat(draft.cod_amount) > 0)) e.cod_amount = "Enter the amount the rider should collect.";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function next() {
    if (!validate(step)) return;
    setErrors({});
    setStep((s) => Math.min(4, s + 1) as Step);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function back() {
    setErrors({});
    setStep((s) => Math.max(1, s - 1) as Step);
  }

  async function handleImage(file: File | undefined) {
    if (!file || !user?.id) return;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) { toast(`Only ${ALLOWED_IMAGE_TYPES.join(", ")} allowed`, "error"); return; }
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) { toast(`Image too large (max ${MAX_UPLOAD_MB} MB)`, "error"); return; }
    setUploading(true);
    try {
      const compressed = await compressImage(file);
      const { path, error } = await uploadFile("parcel-images", user.id, compressed, "parcel");
      if (error || !path) { toast(error ?? "Upload failed", "error"); return; }
      patch("parcel", { parcel_image_url: path });
      const url = await getSignedUrl("parcel-images", path, 600);
      setImagePreview(url);
      toast("Parcel photo attached", "success");
    } catch {
      toast("Could not upload the photo", "error");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function confirmOrder() {
    if (!estimate || !estimate.serviceable || submitting) return;
    setSubmitting(true);
    try {
      const res = await createOrder({
        pickup: {
          lat: draft.pickup.lat!, lng: draft.pickup.lng!, address: draft.pickup.address.trim(),
          city: draft.pickup.city || undefined, contact_name: draft.pickup.contact_name.trim(),
          contact_phone: draft.pickup.contact_phone.trim(),
        },
        dropoff: {
          lat: draft.dropoff.lat!, lng: draft.dropoff.lng!, address: draft.dropoff.address.trim(),
          city: draft.dropoff.city || undefined, receiver_name: draft.dropoff.receiver_name.trim(),
          receiver_phone: draft.dropoff.receiver_phone.trim(),
        },
        parcel: {
          category: draft.parcel.category as string,
          description: draft.parcel.description.trim() || undefined,
          weight_kg: parseFloat(draft.parcel.weight_kg) || undefined,
          quantity: parseInt(draft.parcel.quantity, 10) || undefined,
          is_fragile: draft.parcel.is_fragile,
          declared_value: parseFloat(draft.parcel.declared_value) || undefined,
          special_instructions: draft.parcel.special_instructions.trim() || undefined,
          parcel_image_url: draft.parcel.parcel_image_url || undefined,
        },
        priority: draft.priority,
        payment_method: draft.payment_method,
        cod_amount: useCod ? parseFloat(draft.cod_amount) || undefined : undefined,
        promo_code: draft.promo_code.trim() || undefined,
      });
      toast(`Order ${res.order_code} placed!`, "success");
      if (useCod || draft.payment_method === "cod") navigate(`/customer/track/${res.order_id}`, { replace: true });
      else navigate(`/customer/checkout/${res.order_id}`, { replace: true });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not place the order", "error");
    } finally {
      setSubmitting(false);
    }
  }

  const fare = estimate?.fare;

  return (
    <div className="pb-4 space-y-5 animate-fade-in">
      <header className="flex items-center gap-3">
        <Link to="/customer" className="text-ink-400 hover:text-ink-700 text-xl leading-none">←</Link>
        <h1 className="font-display text-xl font-bold text-ink-900">Send a parcel</h1>
      </header>

      <StepIndicator current={step} />

      {!isConfigured.supabase && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Supabase is not configured.{" "}
          <Link to="/setup" className="font-semibold underline">Open the setup guide</Link> to enable booking.
        </div>
      )}

      {/* ---------- Step 1: Pickup ---------- */}
      {step === 1 && (
        <Card className="space-y-4 p-4">
          <h2 className="font-display text-base font-bold text-ink-900">Where do we pick up?</h2>
          <PinPicker point={{ lat: draft.pickup.lat, lng: draft.pickup.lng }} onPoint={setPickupPoint}
            savedAddresses={savedAddresses}
            onPickSaved={(a) => {
              setDraft((d) => ({
                ...d,
                pickup: {
                  ...d.pickup, lat: a.lat, lng: a.lng,
                  address: a.address_line1 ?? `${a.lat.toFixed(5)}, ${a.lng.toFixed(5)}`,
                  city: a.city ?? d.pickup.city,
                  contact_name: a.contact_name || d.pickup.contact_name,
                  contact_phone: a.contact_phone || d.pickup.contact_phone,
                },
              }));
            }} />
          {errors.pin && <p className="text-xs text-accent-600">{errors.pin}</p>}
          <Input label="Pickup address" placeholder="Street, landmark, area…" value={draft.pickup.address}
            error={errors.address} onChange={(e) => patch("pickup", { address: e.target.value })} />
          <Select label="City" value={draft.pickup.city}
            onChange={(e) => patch("pickup", { city: e.target.value })}>
            <option value="">Select city (optional)</option>
            {SERVICE_CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Contact name" value={draft.pickup.contact_name} error={errors.contact_name}
              onChange={(e) => patch("pickup", { contact_name: e.target.value })} />
            <Input label="Contact phone" type="tel" placeholder="98XXXXXXXX" value={draft.pickup.contact_phone}
              error={errors.contact_phone} onChange={(e) => patch("pickup", { contact_phone: e.target.value })} />
          </div>
        </Card>
      )}

      {/* ---------- Step 2: Drop-off ---------- */}
      {step === 2 && (
        <Card className="space-y-4 p-4">
          <h2 className="font-display text-base font-bold text-ink-900">Where is it going?</h2>
          <PinPicker point={{ lat: draft.dropoff.lat, lng: draft.dropoff.lng }} onPoint={setDropoffPoint}
            savedAddresses={savedAddresses}
            onPickSaved={(a) => setDraft((d) => ({
              ...d,
              dropoff: {
                ...d.dropoff, lat: a.lat, lng: a.lng,
                address: a.address_line1 ?? `${a.lat.toFixed(5)}, ${a.lng.toFixed(5)}`,
                city: a.city ?? d.dropoff.city,
                receiver_name: a.contact_name || d.dropoff.receiver_name,
                receiver_phone: a.contact_phone || d.dropoff.receiver_phone,
              },
            }))} />
          {errors.pin && <p className="text-xs text-accent-600">{errors.pin}</p>}
          <Input label="Drop-off address" placeholder="Street, landmark, area…" value={draft.dropoff.address}
            error={errors.address} onChange={(e) => patch("dropoff", { address: e.target.value })} />
          <Select label="City" value={draft.dropoff.city}
            onChange={(e) => patch("dropoff", { city: e.target.value })}>
            <option value="">Select city (optional)</option>
            {SERVICE_CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Receiver name *" value={draft.dropoff.receiver_name} error={errors.receiver_name}
              onChange={(e) => patch("dropoff", { receiver_name: e.target.value })} />
            <Input label="Receiver phone *" type="tel" placeholder="98XXXXXXXX" value={draft.dropoff.receiver_phone}
              error={errors.receiver_phone} onChange={(e) => patch("dropoff", { receiver_phone: e.target.value })} />
          </div>
        </Card>
      )}

      {/* ---------- Step 3: Parcel details ---------- */}
      {step === 3 && (
        <Card className="space-y-4 p-4">
          <h2 className="font-display text-base font-bold text-ink-900">What are you sending?</h2>
          <div>
            <span className="cn-label">Category *</span>
            <div className="grid grid-cols-4 gap-2">
              {PARCEL_CATEGORIES.map((c) => (
                <button key={c.value} type="button"
                  onClick={() => { patch("parcel", { category: c.value }); setErrors((e) => ({ ...e, category: "" })); }}
                  className={cn("flex flex-col items-center gap-1 rounded-xl border p-3 text-xs font-medium transition",
                    draft.parcel.category === c.value
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-ink-200 text-ink-600 hover:bg-ink-50")}>
                  <span className="text-xl">{c.icon}</span>
                  {c.label}
                </button>
              ))}
            </div>
            {errors.category && <p className="mt-1 text-xs text-accent-600">{errors.category}</p>}
          </div>
          <Input label="Description" placeholder="e.g. Box of medicines, sealed" value={draft.parcel.description}
            onChange={(e) => patch("parcel", { description: e.target.value })} />
          <div>
            <span className="cn-label">Weight (kg)</span>
            <div className="mb-2 flex flex-wrap gap-2">
              {WEIGHT_PRESETS.map((w) => (
                <button key={w} type="button"
                  onClick={() => patch("parcel", { weight_kg: String(w) })}
                  className={cn("rounded-full border px-3 py-1 text-xs font-medium transition",
                    parseFloat(draft.parcel.weight_kg) === w
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-ink-200 text-ink-600 hover:bg-ink-50")}>
                  {w} kg
                </button>
              ))}
            </div>
            <Input type="number" min={0.1} step={0.1} value={draft.parcel.weight_kg} aria-label="Weight in kg"
              onChange={(e) => patch("parcel", { weight_kg: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Quantity" type="number" min={1} value={draft.parcel.quantity}
              onChange={(e) => patch("parcel", { quantity: e.target.value })} />
            <Input label="Declared value (NPR)" type="number" min={0} placeholder="Optional"
              value={draft.parcel.declared_value}
              onChange={(e) => patch("parcel", { declared_value: e.target.value })} />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-ink-200 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-ink-800">Fragile item</p>
              <p className="text-xs text-ink-500">Handle with extra care (small fee applies)</p>
            </div>
            <Toggle checked={draft.parcel.is_fragile} label="Fragile"
              onChange={(v) => patch("parcel", { is_fragile: v })} />
          </div>
          <Textarea label="Special instructions" rows={2} placeholder="Call on arrival, keep upright…"
            value={draft.parcel.special_instructions}
            onChange={(e) => patch("parcel", { special_instructions: e.target.value })} />
          <Select label="Delivery priority" value={draft.priority}
            onChange={(e) => setDraft((d) => ({ ...d, priority: e.target.value as DeliveryPriority }))}>
            <option value="standard">Standard</option>
            <option value="priority">Priority (faster matching)</option>
            <option value="express">Express (fastest)</option>
          </Select>
          {/* Parcel photo */}
          <div>
            <span className="cn-label">Parcel photo (optional)</span>
            <input ref={fileRef} type="file" accept={ALLOWED_IMAGE_TYPES.join(",")} className="hidden"
              onChange={(e) => void handleImage(e.target.files?.[0])} />
            {uploading ? (
              <div className="flex items-center gap-2 text-sm text-ink-500"><Spinner className="h-4 w-4" /> Uploading…</div>
            ) : imagePreview ? (
              <div className="flex items-center gap-3">
                <img src={imagePreview} alt="Parcel" className="h-20 w-20 rounded-xl object-cover border border-ink-200" />
                <Button type="button" variant="ghost" size="sm"
                  onClick={() => { patch("parcel", { parcel_image_url: "" }); setImagePreview(null); }}>Remove</Button>
              </div>
            ) : (
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                📷 Attach a photo
              </Button>
            )}
          </div>
          {/* COD */}
          <div className="rounded-xl border border-ink-200 px-4 py-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-ink-800">Collect cash on delivery</p>
                <p className="text-xs text-ink-500">Rider collects this amount from the receiver</p>
              </div>
              <Toggle checked={draft.cod_enabled} label="Cash on delivery"
                onChange={(v) => setDraft((d) => ({ ...d, cod_enabled: v, payment_method: v ? "cod" : d.payment_method === "cod" ? "khalti" : d.payment_method }))} />
            </div>
            {draft.cod_enabled && (
              <Input label="COD amount (NPR)" type="number" min={0} placeholder="e.g. 1500"
                value={draft.cod_amount} error={errors.cod_amount}
                onChange={(e) => setDraft((d) => ({ ...d, cod_amount: e.target.value }))} />
            )}
          </div>
        </Card>
      )}

      {/* ---------- Step 4: Fare & review ---------- */}
      {step === 4 && (
        <div className="space-y-4">
          <Card className="space-y-3 p-4">
            <h2 className="font-display text-base font-bold text-ink-900">Review your delivery</h2>
            <div className="space-y-2 text-sm">
              <div className="rounded-xl bg-ink-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Pickup</p>
                <p className="text-ink-800">{draft.pickup.address}</p>
                <p className="text-xs text-ink-500">{draft.pickup.contact_name} · {draft.pickup.contact_phone}</p>
              </div>
              <div className="rounded-xl bg-ink-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-accent-600">Drop-off</p>
                <p className="text-ink-800">{draft.dropoff.address}</p>
                <p className="text-xs text-ink-500">{draft.dropoff.receiver_name} · {draft.dropoff.receiver_phone}</p>
              </div>
              <div className="rounded-xl bg-ink-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Parcel</p>
                <p className="text-ink-800">
                  {PARCEL_CATEGORIES.find((c) => c.value === draft.parcel.category)?.label ?? "Parcel"}
                  {" · "}{draft.parcel.weight_kg || "?"} kg{" · "}qty {draft.parcel.quantity || 1}
                  {draft.parcel.is_fragile && " · fragile"}
                  {draft.priority !== "standard" && ` · ${draft.priority}`}
                </p>
                {draft.parcel.description && <p className="text-xs text-ink-500">{draft.parcel.description}</p>}
              </div>
            </div>
          </Card>

          {/* Promo */}
          <Card className="p-4">
            <div className="flex gap-2 items-end">
              <Input label="Promo code" placeholder="e.g. WELCOME20" value={draft.promo_code}
                hint={estimate?.promo_applied ? "Promo applied 🎉" : undefined}
                onChange={(e) => setDraft((d) => ({ ...d, promo_code: e.target.value.toUpperCase() }))} />
              <Button type="button" variant="outline" onClick={() => setEstimate(null)}>Apply</Button>
            </div>
          </Card>

          {/* Fare breakdown */}
          <Card className="p-4 space-y-3">
            <h3 className="font-display text-base font-bold text-ink-900">Fare estimate</h3>
            {estimating ? (
              <div className="flex items-center gap-2 py-6 justify-center text-sm text-ink-500">
                <Spinner className="h-4 w-4" /> Calculating fare…
              </div>
            ) : estimateError ? (
              <div className="rounded-xl border border-accent-200 bg-accent-50 p-3 text-sm text-accent-800">
                {estimateError}
              </div>
            ) : !estimate ? (
              <p className="py-4 text-center text-sm text-ink-500">Waiting for estimate…</p>
            ) : !estimate.serviceable ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                {estimate.message ?? "This route is outside our service area."}
              </div>
            ) : (
              <>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-brand-50 px-3 py-1 font-medium text-brand-700">
                    📏 {formatKm(estimate.distance_km)}
                  </span>
                  <span className="rounded-full bg-brand-50 px-3 py-1 font-medium text-brand-700">
                    🛵 Pickup in ~{estimate.pickup_eta_minutes} min
                  </span>
                  <span className="rounded-full bg-brand-50 px-3 py-1 font-medium text-brand-700">
                    ⏱ Delivery in ~{estimate.delivery_eta_minutes} min
                  </span>
                </div>
                {fare && (
                  <dl className="space-y-1.5 text-sm">
                    <FareRow label="Base fare" value={fare.base_fare} />
                    <FareRow label={`Distance fee (${formatKm(estimate.distance_km)})`} value={fare.distance_fee} />
                    <FareRow label="Weight fee" value={fare.weight_fee} />
                    <FareRow label="Service fees" value={fare.service_fees} />
                    {fare.cod_fee > 0 && <FareRow label="COD fee" value={fare.cod_fee} />}
                    {fare.priority_fee > 0 && <FareRow label="Priority fee" value={fare.priority_fee} />}
                    {fare.fragile_fee > 0 && <FareRow label="Fragile handling" value={fare.fragile_fee} />}
                    {fare.peak_surcharge > 0 && <FareRow label="Peak surcharge" value={fare.peak_surcharge} />}
                    {fare.waiting_fee > 0 && <FareRow label="Waiting fee" value={fare.waiting_fee} />}
                    <div className="border-t border-ink-100 pt-1.5">
                      <FareRow label="Subtotal" value={fare.subtotal} />
                    </div>
                    {fare.discount_amount > 0 && (
                      <FareRow label="Discount" value={-fare.discount_amount} accent />
                    )}
                    <div className="flex items-center justify-between border-t border-ink-200 pt-2">
                      <dt className="font-display text-base font-bold text-ink-900">Total</dt>
                      <dd className="font-display text-lg font-bold text-brand-700">{formatNPR(fare.total_amount)}</dd>
                    </div>
                  </dl>
                )}
              </>
            )}
          </Card>

          {/* Payment method */}
          <Card className="p-4 space-y-2">
            <h3 className="font-display text-base font-bold text-ink-900">Payment method</h3>
            {PAYMENT_METHODS.map((m) => (
              <button key={m.value} type="button"
                onClick={() => setDraft((d) => ({ ...d, payment_method: m.value, cod_enabled: m.value === "cod" ? true : d.cod_enabled }))}
                className={cn("flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition",
                  draft.payment_method === m.value
                    ? "border-brand-500 bg-brand-50"
                    : "border-ink-200 hover:bg-ink-50")}>
                <span className={cn("flex h-4 w-4 items-center justify-center rounded-full border-2",
                  draft.payment_method === m.value ? "border-brand-600" : "border-ink-300")}>
                  {draft.payment_method === m.value && <span className="h-2 w-2 rounded-full bg-brand-600" />}
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-semibold text-ink-800">{m.label}</span>
                  <span className="block text-xs text-ink-500">{m.description}</span>
                </span>
              </button>
            ))}
            {draft.payment_method === "cod" && !draft.cod_amount && (
              <Input label="COD amount (NPR)" type="number" min={0} className="mt-2"
                value={draft.cod_amount} error={errors.cod_amount}
                onChange={(e) => setDraft((d) => ({ ...d, cod_amount: e.target.value }))} />
            )}
          </Card>
        </div>
      )}

      {/* ---------- Nav buttons ---------- */}
      <div className="flex gap-3">
        {step > 1 && <Button variant="outline" className="flex-1" onClick={back}>Back</Button>}
        {step < 4 ? (
          <Button className="flex-1" onClick={next}>Continue</Button>
        ) : (
          <Button className="flex-1" size="lg" loading={submitting}
            disabled={!estimate?.serviceable || estimating || !isConfigured.supabase}
            onClick={() => void confirmOrder()}>
            {estimate?.serviceable && fare ? `Confirm · ${formatNPR(fare.total_amount)}` : "Confirm order"}
          </Button>
        )}
      </div>
    </div>
  );
}

function FareRow({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-ink-600">{label}</dt>
      <dd className={cn("font-medium tabular-nums", accent ? "text-green-600" : "text-ink-800")}>
        {value < 0 ? "−" : ""}{formatNPR(Math.abs(value))}
      </dd>
    </div>
  );
}
