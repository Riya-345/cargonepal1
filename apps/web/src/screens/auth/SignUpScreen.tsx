// ============================================================
// CargoNepal — Sign up / Create profile (spec §4 screen 5)
// ============================================================
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Logo } from "@/widgets/Logo";
import { Button, Input, Select } from "@/components/ui";
import { signUpWithEmail, sendPhoneOtp } from "@/services/auth/authService";
import { SERVICE_CITIES } from "@/core/constants";
import { isValidNepaliMobile } from "@/core/utils";
import type { UserRole } from "@/models/types";

export default function SignUpScreen() {
  const navigate = useNavigate();
  const [role, setRole] = useState<Exclude<UserRole, "admin" | "super_admin">>("customer");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [city, setCity] = useState(SERVICE_CITIES[0]);
  const [method, setMethod] = useState<"phone" | "email">("phone");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!fullName.trim()) { setError("Please enter your full name."); return; }
    if (!isValidNepaliMobile(phone)) { setError("Enter a valid Nepali mobile number."); return; }

    setLoading(true);
    try {
      if (method === "email") {
        if (!email || password.length < 6) { setError("Enter a valid email and a password of at least 6 characters."); setLoading(false); return; }
        const res = await signUpWithEmail({ email, password, role, fullName, phone, city });
        setLoading(false);
        if (res.error) { setError(res.error); return; }
        navigate(res.needsOtp ? "/login" : "/", { replace: true });
      } else {
        // Phone-first: create the account via OTP; role carried in metadata on verify.
        const res = await sendPhoneOtp(phone);
        setLoading(false);
        if (res.error) { setError(res.error); return; }
        navigate("/auth/verify-otp", { state: { phone, role, fullName, city } });
      }
    } catch (err) {
      setLoading(false);
      setError((err as Error).message);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-700 to-brand-900 flex flex-col items-center justify-center px-4 py-10">
      <div className="mb-6"><Logo light size="md" /></div>
      <div className="w-full max-w-md cn-card p-7 animate-slide-up">
        <h1 className="text-2xl font-bold">Create your account</h1>
        <p className="text-sm text-ink-500 mt-1">Join CargoNepal to send parcels or start earning as a rider.</p>

        <div className="mt-5 grid grid-cols-2 gap-2">
          {(["customer", "rider"] as const).map((r) => (
            <button key={r} type="button" onClick={() => setRole(r)}
              className={`rounded-xl border-2 p-3 text-left transition ${role === r ? "border-brand-500 bg-brand-50" : "border-ink-200 hover:border-ink-300"}`}>
              <span className="block text-xl">{r === "customer" ? "📦" : "🛵"}</span>
              <span className="mt-1 block text-sm font-semibold capitalize">{r}</span>
              <span className="block text-xs text-ink-500">{r === "customer" ? "Send parcels" : "Deliver & earn"}</span>
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="mt-5 space-y-4">
          <Input label="Full name" placeholder="e.g. Aarav Shrestha" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          <Input label="Mobile number" type="tel" placeholder="98XXXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Select label="City" value={city} onChange={(e) => setCity((e.target as HTMLSelectElement).value)}>
            {SERVICE_CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>

          <div className="grid grid-cols-2 gap-1 rounded-xl bg-ink-100 p-1">
            {(["phone", "email"] as const).map((m) => (
              <button key={m} type="button" onClick={() => setMethod(m)}
                className={`rounded-lg py-2 text-sm font-semibold transition ${method === m ? "bg-white shadow-sm text-brand-700" : "text-ink-500"}`}>
                {m === "phone" ? "Verify by phone" : "Use email + password"}
              </button>
            ))}
          </div>

          {method === "email" && (
            <>
              <Input label="Email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              <Input label="Password" type="password" placeholder="At least 6 characters" value={password} onChange={(e) => setPassword(e.target.value)} />
            </>
          )}

          {error && <div className="rounded-lg bg-accent-50 border border-accent-200 px-3 py-2 text-sm text-accent-700">{error}</div>}
          <Button type="submit" className="w-full" size="lg" loading={loading}>Create account</Button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-500">
          Already have an account? <Link to="/login" className="font-semibold text-brand-600 hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
