// ============================================================
// CargoNepal — Setup guide (spec §59 — clear credential requirements)
// ============================================================
import { Link } from "react-router-dom";
import { Logo } from "@/widgets/Logo";
import { isConfigured } from "@/core/config/env";

const STEPS = [
  { title: "1. Create a Supabase project", detail: "Go to supabase.com, create a project, and note the Project URL + anon key from Settings → API." },
  { title: "2. Run the migrations", detail: "Apply supabase/migrations/0001…0009 in order via the SQL editor or `supabase db push`. This creates all tables, RLS policies, functions, and triggers." },
  { title: "3. Seed baseline config", detail: "Run supabase/seed/seed.sql to insert the default pricing rule, service areas, and notification templates. This is config data, not fake users." },
  { title: "4. Deploy Edge Functions", detail: "`supabase functions deploy` from the repo root. Set payment/FCM secrets with `supabase secrets set …` (see supabase/functions/README.md)." },
  { title: "5. Configure the web app", detail: "Copy .env.example to apps/web/.env and fill VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_GOOGLE_MAPS_API_KEY, and the Firebase web keys." },
  { title: "6. Enable auth providers", detail: "In Supabase Auth → Providers, enable Phone (SMS OTP) and optionally Google. Add your SMTP for email." },
  { title: "7. Run the app", detail: "`npm install && npm run dev` from the repo root, then open http://localhost:5173." },
];

function Pill({ ok }: { ok: boolean }) {
  return (
    <span className={`cn-badge ${ok ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
      {ok ? "Configured" : "Not set"}
    </span>
  );
}

export default function SetupGuide() {
  return (
    <div className="min-h-screen bg-ink-50">
      <header className="border-b border-ink-100 bg-white">
        <div className="cn-container flex items-center justify-between py-4">
          <Logo />
          <Link to="/" className="text-sm font-medium text-ink-500 hover:text-brand-600">← Home</Link>
        </div>
      </header>
      <main className="cn-container py-10 max-w-3xl">
        <h1 className="text-3xl font-bold">Setup guide</h1>
        <p className="mt-2 text-ink-500">
          CargoNepal is fully wired to Supabase. This page lists what must be configured to go live.
          Per the build rules, no external service is faked — where credentials are missing the app
          stays functional and tells you exactly what to add.
        </p>

        <div className="mt-6 cn-card p-5">
          <h2 className="font-semibold mb-3">Current configuration status</h2>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between"><span>Supabase (URL + anon key)</span><Pill ok={isConfigured.supabase} /></div>
            <div className="flex items-center justify-between"><span>Google Maps API key</span><Pill ok={isConfigured.maps} /></div>
            <div className="flex items-center justify-between"><span>Firebase (push)</span><Pill ok={isConfigured.firebase} /></div>
          </div>
        </div>

        <ol className="mt-6 space-y-3">
          {STEPS.map((s) => (
            <li key={s.title} className="cn-card p-5">
              <h3 className="font-semibold text-ink-900">{s.title}</h3>
              <p className="mt-1 text-sm text-ink-600">{s.detail}</p>
            </li>
          ))}
        </ol>

        <div className="mt-6 cn-card p-5 bg-brand-50 border-brand-100">
          <h3 className="font-semibold text-brand-900">Required credentials summary</h3>
          <ul className="mt-2 text-sm text-brand-800 list-disc pl-5 space-y-1">
            <li>SUPABASE_URL, SUPABASE_ANON_KEY (frontend) + SUPABASE_SERVICE_ROLE_KEY (functions only)</li>
            <li>GOOGLE_MAPS_API_KEY (browser) + GOOGLE_MAPS_SERVER_KEY (Edge Functions)</li>
            <li>KHALTI_SECRET_KEY / KHALTI_PUBLIC_KEY (test mode supported)</li>
            <li>ESEWA_MERCHANT_CODE / ESEWA_SECRET_KEY (EPAYTEST sandbox supported)</li>
            <li>FCM_SERVER_KEY + Firebase web config + VAPID key</li>
            <li>Optional: FonePay_MERCHANT_CODE / FonePay_SECRET</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
