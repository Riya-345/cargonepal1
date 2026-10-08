// ============================================================
// CargoNepal — Rider layout: mobile-first shell + bottom nav
// (spec §37: Home / Deliveries / Earnings / Profile)
// ============================================================
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/core/hooks/useAuth";
import { signOut } from "@/services/auth/authService";
import { cn } from "@/core/utils";

const NAV = [
  { to: "/rider", label: "Home", icon: "🛵", end: true },
  { to: "/rider/deliveries", label: "Deliveries", icon: "📦", end: false },
  { to: "/rider/earnings", label: "Earnings", icon: "💰", end: false },
  { to: "/rider/profile", label: "Profile", icon: "👤", end: false },
];

export function RiderLayout() {
  const { riderProfile } = useAuth();
  const navigate = useNavigate();

  // Riders must be approved before accessing the app (spec §10).
  const pending = riderProfile && riderProfile.status !== "approved";

  return (
    <div className="min-h-screen bg-ink-50">
      <header className="sticky top-0 z-30 bg-ink-900 text-white">
        <div className="mx-auto max-w-2xl flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">🛵</span>
            <span className="font-display font-bold">Cargo<span className="text-accent-400">Nepal</span> <span className="text-white/60 font-medium text-sm">Rider</span></span>
          </div>
          <div className="flex items-center gap-3">
            <span className={cn("cn-badge", riderProfile?.availability === "online" ? "bg-green-500/20 text-green-300"
              : riderProfile?.availability === "busy" ? "bg-amber-500/20 text-amber-300" : "bg-white/10 text-white/60")}>
              {riderProfile?.availability ?? "offline"}
            </span>
            <button onClick={async () => { await signOut(); navigate("/"); }} className="text-sm text-white/70 hover:text-white">Sign out</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pb-24 pt-4">
        {pending ? (
          <div className="cn-card p-8 text-center mt-6">
            <div className="text-5xl mb-4">⏳</div>
            <h2 className="text-xl font-bold">Account under review</h2>
            <p className="mt-2 text-sm text-ink-500">
              Your rider registration is <span className="font-semibold capitalize text-amber-600">{riderProfile?.status}</span>.
              You'll be able to receive deliveries once an admin approves your account.
            </p>
            <NavLink to="/rider/verification" className="cn-btn-outline mt-5 inline-flex">View verification status</NavLink>
          </div>
        ) : (
          <Outlet />
        )}
      </main>

      <nav className="fixed bottom-0 left-1/2 z-40 w-full max-w-2xl -translate-x-1/2 border-t border-ink-100 bg-white/95 backdrop-blur">
        <div className="grid grid-cols-4">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end}
              className={({ isActive }) => cn(
                "flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition",
                isActive ? "text-brand-600" : "text-ink-400 hover:text-ink-600")}>
              <span className="text-lg leading-none">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
