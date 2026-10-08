// ============================================================
// CargoNepal — Login (spec §3, §4 screen 3)
// ============================================================
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Logo } from "@/widgets/Logo";
import { Button, Input, useToast } from "@/components/ui";
import { sendPhoneOtp, signInWithEmail, signInWithGoogle } from "@/services/auth/authService";
import { isConfigured } from "@/core/config/env";
import { isValidNepaliMobile } from "@/core/utils";

export default function LoginScreen() {
  const [mode, setMode] = useState<"phone" | "email">("phone");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const toast = useToast();

  async function handlePhone(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isValidNepaliMobile(phone)) { setError("Enter a valid Nepali mobile number (10 digits starting with 9)."); return; }
    setLoading(true);
    const res = await sendPhoneOtp(phone);
    setLoading(false);
    if (res.error) { setError(res.error); return; }
    toast("Code sent! Check your phone.", "success");
    navigate("/auth/verify-otp", { state: { phone } });
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await signInWithEmail(email, password);
    setLoading(false);
    if (res.error) { setError(res.error); return; }
    navigate("/"); // RoleRedirect handles routing on auth change.
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-700 via-brand-600 to-brand-900 flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="flex justify-center mb-8">
            <Logo light size="lg" />
          </div>
          <div className="cn-card p-7 animate-slide-up">
            <h1 className="text-2xl font-bold text-ink-900">Welcome back</h1>
            <p className="text-sm text-ink-500 mt-1">Sign in to send or track a parcel.</p>

            {!isConfigured.supabase && (
              <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
                Supabase isn't configured yet. Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to
                <code> apps/web/.env</code>, then <Link className="underline" to="/setup">see the setup guide</Link>.
              </div>
            )}

            <div className="mt-5 grid grid-cols-2 gap-1 rounded-xl bg-ink-100 p-1">
              {(["phone", "email"] as const).map((m) => (
                <button key={m} onClick={() => { setMode(m); setError(null); }}
                  className={`rounded-lg py-2 text-sm font-semibold transition ${mode === m ? "bg-white shadow-sm text-brand-700" : "text-ink-500"}`}>
                  {m === "phone" ? "Phone OTP" : "Email"}
                </button>
              ))}
            </div>

            {error && <div className="mt-4 rounded-lg bg-accent-50 border border-accent-200 px-3 py-2 text-sm text-accent-700">{error}</div>}

            {mode === "phone" ? (
              <form onSubmit={handlePhone} className="mt-5 space-y-4">
                <Input label="Mobile number" type="tel" inputMode="numeric" placeholder="98XXXXXXXX"
                  value={phone} onChange={(e) => setPhone(e.target.value)} autoFocus />
                <Button type="submit" className="w-full" size="lg" loading={loading}>Send OTP</Button>
              </form>
            ) : (
              <form onSubmit={handleEmail} className="mt-5 space-y-4">
                <Input label="Email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                <Input label="Password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
                <Button type="submit" className="w-full" size="lg" loading={loading}>Sign in</Button>
              </form>
            )}

            <div className="my-5 flex items-center gap-3 text-xs text-ink-400">
              <span className="h-px flex-1 bg-ink-200" /> or <span className="h-px flex-1 bg-ink-200" />
            </div>
            <Button variant="outline" className="w-full" onClick={() => signInWithGoogle()}>
              <span className="text-base">G</span> Continue with Google
            </Button>

            <p className="mt-6 text-center text-sm text-ink-500">
              New to CargoNepal? <Link to="/signup" className="font-semibold text-brand-600 hover:underline">Create an account</Link>
            </p>
            <p className="mt-2 text-center text-sm text-ink-500">
              Want to deliver? <Link to="/rider/join" className="font-semibold text-accent-600 hover:underline">Become a rider</Link>
            </p>
          </div>
          <p className="mt-6 text-center text-xs text-white/60">
            <Link to="/" className="hover:underline">← Back to home</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
