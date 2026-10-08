// ============================================================
// CargoNepal — OTP verification (spec §4 screen 4)
// ============================================================
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Logo } from "@/widgets/Logo";
import { Button, useToast } from "@/components/ui";
import { verifyPhoneOtp, sendPhoneOtp } from "@/services/auth/authService";
import { cn } from "@/core/utils";

export default function OtpVerifyScreen() {
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const phone = (location.state as { phone?: string })?.phone ?? "";
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(45);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (!phone) navigate("/login", { replace: true });
  }, [phone, navigate]);

  useEffect(() => {
    if (seconds <= 0) return;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  function setDigit(i: number, v: string) {
    if (!/^\d?$/.test(v)) return;
    const next = [...digits];
    next[i] = v;
    setDigits(next);
    if (v && i < 5) refs.current[i + 1]?.focus();
  }

  function onKey(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[i] && i > 0) refs.current[i - 1]?.focus();
  }

  function onPaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (text.length === 6) {
      setDigits(text.split(""));
      refs.current[5]?.focus();
      e.preventDefault();
    }
  }

  async function verify() {
    const token = digits.join("");
    if (token.length !== 6) { setError("Enter the 6-digit code."); return; }
    setError(null); setLoading(true);
    const res = await verifyPhoneOtp(phone, token);
    setLoading(false);
    if (res.error) { setError(res.error); return; }
    toast("Verified! Welcome to CargoNepal.", "success");
    navigate("/", { replace: true });
  }

  async function resend() {
    setSeconds(45);
    const res = await sendPhoneOtp(phone);
    if (res.error) toast(res.error, "error");
    else toast("New code sent.", "success");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-700 to-brand-900 flex flex-col items-center justify-center px-4">
      <div className="mb-8"><Logo light size="lg" /></div>
      <div className="w-full max-w-md cn-card p-7 animate-slide-up">
        <h1 className="text-2xl font-bold">Verify your number</h1>
        <p className="text-sm text-ink-500 mt-1">We sent a 6-digit code to <span className="font-semibold text-ink-700">{phone}</span></p>

        <div className="mt-6 flex justify-between gap-2" onPaste={onPaste}>
          {digits.map((d, i) => (
            <input key={i} ref={(el) => { refs.current[i] = el; }} value={d}
              onChange={(e) => setDigit(i, e.target.value)} onKeyDown={(e) => onKey(i, e)}
              inputMode="numeric" maxLength={1} autoFocus={i === 0}
              className={cn("h-14 w-full rounded-xl border-2 text-center text-xl font-bold text-ink-900 outline-none transition",
                d ? "border-brand-400 bg-brand-50" : "border-ink-200 focus:border-brand-400")} />
          ))}
        </div>

        {error && <div className="mt-4 rounded-lg bg-accent-50 border border-accent-200 px-3 py-2 text-sm text-accent-700">{error}</div>}

        <Button className="w-full mt-6" size="lg" loading={loading} onClick={verify}>Verify & continue</Button>

        <div className="mt-5 text-center text-sm text-ink-500">
          {seconds > 0 ? (
            <span>Resend code in <span className="font-semibold text-ink-700">{seconds}s</span></span>
          ) : (
            <button onClick={resend} className="font-semibold text-brand-600 hover:underline">Resend code</button>
          )}
        </div>
      </div>
    </div>
  );
}
