// ============================================================
// CargoNepal — Rider join / onboarding (spec §10, PUBLIC)
// ============================================================
// Standalone marketing-style registration page. Requires sign-in
// before submitting; uploads documents then calls `rider-register`.
// ============================================================

import { useRef, useState, type ChangeEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Logo } from "@/widgets/Logo";
import { Button, Input, Select, Spinner, useToast } from "@/components/ui";
import { useAuth } from "@/core/hooks/useAuth";
import { isConfigured } from "@/core/config/env";
import { BRAND, SERVICE_CITIES } from "@/core/constants";
import { isValidNepaliMobile } from "@/core/utils";
import { compressImage, uploadFile } from "@/services/storage/storageService";
import { invoke } from "@/services/supabaseClient";
import type { VehicleType } from "@/models/types";

const VEHICLE_TYPES: { value: VehicleType; label: string }[] = [
  { value: "bike", label: "Bike" },
  { value: "scooter", label: "Scooter" },
  { value: "e_bike", label: "E-bike" },
  { value: "cargo_bike", label: "Cargo bike" },
];

function FileField({ label, file, onPick, required }: {
  label: string; file: File | null; onPick: (f: File | null) => void; required?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    onPick(f);
  }
  return (
    <div>
      <span className="cn-label">
        {label} {required && <span className="text-accent-600">*</span>}
      </span>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="flex w-full items-center justify-between rounded-xl border border-dashed border-ink-300 bg-ink-50 px-4 py-3 text-sm text-ink-600 hover:border-brand-400 hover:bg-brand-50/40 transition"
      >
        <span className="truncate">{file ? file.name : "Tap to upload photo"}</span>
        <span className="ml-2 shrink-0 text-lg">{file ? "✅" : "📎"}</span>
      </button>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={handleChange} />
    </div>
  );
}

export default function RiderJoinScreen() {
  const { session, user, loading } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  // ---- form state -------------------------------------------------
  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState(SERVICE_CITIES[0]);
  const [citizenshipNumber, setCitizenshipNumber] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");

  const [vehicleType, setVehicleType] = useState<VehicleType>("bike");
  const [licensePlate, setLicensePlate] = useState("");
  const [makeModel, setMakeModel] = useState("");
  const [color, setColor] = useState("");
  const [year, setYear] = useState("");

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [vehiclePhotoFile, setVehiclePhotoFile] = useState<File | null>(null);
  const [licenseFile, setLicenseFile] = useState<File | null>(null);
  const [citizenshipFile, setCitizenshipFile] = useState<File | null>(null);
  const [bluebookFile, setBluebookFile] = useState<File | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function uploadOne(
    bucket: "avatars" | "rider-documents",
    sub: string,
    file: File | null,
    userId: string,
  ): Promise<string | null> {
    if (!file) return null;
    const compressed = await compressImage(file);
    const { path, error: upErr } = await uploadFile(bucket, userId, compressed, sub);
    if (upErr) throw new Error(upErr);
    return path;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError(null);

    // ---- validation ----
    if (!fullName.trim()) return setError("Full name is required.");
    if (!isValidNepaliMobile(phone)) return setError("Enter a valid Nepali mobile number (10 digits starting with 9).");
    if (!address.trim()) return setError("Address is required.");
    if (!citizenshipNumber.trim()) return setError("Citizenship number is required.");
    if (!licenseNumber.trim()) return setError("Driving license number is required.");
    if (!licensePlate.trim()) return setError("Vehicle license plate is required.");
    if (!licenseFile) return setError("Please upload your driving license photo.");
    if (!citizenshipFile) return setError("Please upload your citizenship photo.");
    if (!bluebookFile) return setError("Please upload your vehicle bluebook photo.");

    setSubmitting(true);
    try {
      setProgress("Uploading profile photo…");
      const avatar_path = await uploadOne("avatars", "", avatarFile, user.id);

      setProgress("Uploading vehicle photo…");
      const vehicle_photo_path = await uploadOne("rider-documents", "vehicle", vehiclePhotoFile, user.id);

      setProgress("Uploading documents…");
      const license_path = await uploadOne("rider-documents", "license", licenseFile, user.id);
      const citizenship_path = await uploadOne("rider-documents", "citizenship", citizenshipFile, user.id);
      const bluebook_path = await uploadOne("rider-documents", "bluebook", bluebookFile, user.id);

      setProgress("Submitting application…");
      await invoke("rider-register", {
        body: {
          full_name: fullName.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
          address: address.trim(),
          city: city || undefined,
          profile_photo_path: avatar_path,
          vehicle: {
            type: vehicleType,
            license_plate: licensePlate.trim(),
            make_model: makeModel.trim() || undefined,
            color: color.trim() || undefined,
            year: year ? Number(year) : undefined,
            photo_path: vehicle_photo_path,
          },
          // doc_number is carried per-document so the backend does not create
          // duplicate citizenship/license rows from top-level number fields.
          documents: [
            { doc_type: "license", doc_number: licenseNumber.trim(), file_path: license_path },
            { doc_type: "citizenship", doc_number: citizenshipNumber.trim(), file_path: citizenship_path },
            { doc_type: "vehicle_bluebook", file_path: bluebook_path },
          ],
        },
      });

      toast("Application submitted! Awaiting verification.", "success");
      navigate("/rider/verification");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Registration failed. Please try again.";
      setError(msg);
      toast(msg, "error");
    } finally {
      setSubmitting(false);
      setProgress("");
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-950">
        <Spinner className="h-8 w-8 text-accent-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ink-50">
      {/* Header */}
      <header className="bg-gradient-to-br from-ink-950 via-brand-900 to-ink-900 text-white">
        <div className="mx-auto max-w-2xl px-4 py-5">
          <div className="flex items-center justify-between">
            <Logo light size="md" />
            <Link to="/" className="text-sm text-white/70 hover:text-white">← Back</Link>
          </div>
          <div className="mt-8 pb-4">
            <h1 className="font-display text-3xl font-extrabold leading-tight">
              Earn with <span className="text-accent-400">CargoNepal</span>
            </h1>
            <p className="mt-2 max-w-md text-sm text-white/70">
              Turn your bike into income. Pick up parcels near you, drop them across the city, and get
              paid per delivery — with weekly settlements straight to your wallet.
            </p>
            <div className="mt-5 grid grid-cols-3 gap-3">
              {[
                { k: "Per drop", v: "NPR 80–250" },
                { k: "Payouts", v: "Weekly" },
                { k: "Cities", v: String(SERVICE_CITIES.length) + "+" },
              ].map((s) => (
                <div key={s.k} className="rounded-xl bg-white/10 px-3 py-3 text-center backdrop-blur">
                  <div className="text-lg font-bold text-accent-300">{s.v}</div>
                  <div className="text-[11px] uppercase tracking-wide text-white/60">{s.k}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8">
        {!isConfigured.supabase && (
          <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            Supabase isn't configured yet. Add <code>VITE_SUPABASE_URL</code> and{" "}
            <code>VITE_SUPABASE_ANON_KEY</code>, then <Link className="underline" to="/setup">see the setup guide</Link>.
          </div>
        )}

        {!session || !user ? (
          <div className="cn-card p-8 text-center">
            <div className="text-5xl mb-3">🔐</div>
            <h2 className="text-xl font-bold">Sign in to apply</h2>
            <p className="mt-2 text-sm text-ink-500">
              Create or use your rider account to submit an application. It only takes a minute.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Link to="/login?role=rider" className="cn-btn-primary px-6 py-3">Sign in as rider</Link>
              <Link to="/signup" className="cn-btn-outline px-6 py-3">Create account</Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="cn-card p-6 space-y-6">
            <div>
              <h2 className="text-lg font-bold">Rider application</h2>
              <p className="text-sm text-ink-500">
                Fill in your details and upload the required documents. Fields marked{" "}
                <span className="text-accent-600">*</span> are required.
              </p>
            </div>

            {error && (
              <div className="rounded-lg border border-accent-200 bg-accent-50 px-3 py-2 text-sm text-accent-700">
                {error}
              </div>
            )}

            {/* Personal */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-400">Personal info</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Full name *" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ram Bahadur" />
                <Input label="Mobile number *" type="tel" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98XXXXXXXX" />
                <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
                <Select label="City *" value={city} onChange={(e) => setCity((e.target as HTMLSelectElement).value)}>
                  {SERVICE_CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </div>
              <Input label="Address *" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street / tole, ward" />
              <FileField label="Profile photo" file={avatarFile} onPick={setAvatarFile} />
            </section>

            {/* Identity */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-400">Identity & licenses</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Citizenship number *" value={citizenshipNumber} onChange={(e) => setCitizenshipNumber(e.target.value)} placeholder="XX-XX-XX" />
                <Input label="Driving license number *" value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} placeholder="License no." />
              </div>
            </section>

            {/* Vehicle */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-400">Vehicle details</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <Select label="Vehicle type *" value={vehicleType} onChange={(e) => setVehicleType((e.target as HTMLSelectElement).value as VehicleType)}>
                  {VEHICLE_TYPES.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
                </Select>
                <Input label="License plate *" value={licensePlate} onChange={(e) => setLicensePlate(e.target.value)} placeholder="BA 12 PA 3456" />
                <Input label="Make / model" value={makeModel} onChange={(e) => setMakeModel(e.target.value)} placeholder="Honda Wave 110i" />
                <Input label="Color" value={color} onChange={(e) => setColor(e.target.value)} placeholder="Red" />
                <Input label="Year" type="number" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2019" />
              </div>
              <FileField label="Vehicle photo" file={vehiclePhotoFile} onPick={setVehiclePhotoFile} />
            </section>

            {/* Documents */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-400">Documents</h3>
              <FileField label="Driving license photo *" file={licenseFile} onPick={setLicenseFile} required />
              <FileField label="Citizenship photo *" file={citizenshipFile} onPick={setCitizenshipFile} required />
              <FileField label="Vehicle bluebook photo *" file={bluebookFile} onPick={setBluebookFile} required />
            </section>

            <div className="pt-2">
              <Button type="submit" size="lg" className="w-full" loading={submitting} disabled={!isConfigured.supabase}>
                {submitting ? progress || "Submitting…" : "Submit application"}
              </Button>
              <p className="mt-3 text-center text-xs text-ink-400">
                By applying you agree to our rider terms. Need help? Email {BRAND.supportEmail}.
              </p>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
