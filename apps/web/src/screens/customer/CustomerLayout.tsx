// ============================================================
// CargoNepal — Customer layout: mobile-first shell + bottom nav
// (spec §37, §38)
// ============================================================
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/core/hooks/useAuth";
import { useNotifications } from "@/core/hooks/useRealtime";
import { signOut } from "@/services/auth/authService";
import { cn } from "@/core/utils";

const NAV = [
  { to: "/customer", label: "Home", icon: "🏠", end: true },
  { to: "/customer/orders", label: "Orders", icon: "📦", end: false },
  { to: "/customer/notifications", label: "Alerts", icon: "🔔", end: false },
  { to: "/customer/profile", label: "Profile", icon: "👤", end: false },
];

export function CustomerLayout() {
  const { user } = useAuth();
  const { unread } = useNotifications(user?.id ?? null);
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-ink-50">
      {/* Top bar */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-ink-100">
        <div className="mx-auto max-w-2xl flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">📦</span>
            <span className="font-display font-bold text-ink-900">Cargo<span className="text-accent-600">Nepal</span></span>
          </div>
          <button onClick={async () => { await signOut(); navigate("/"); }}
            className="text-sm font-medium text-ink-500 hover:text-accent-600">Sign out</button>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-2xl px-4 pb-24 pt-4">
        <Outlet />
      </main>

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-1/2 z-40 w-full max-w-2xl -translate-x-1/2 border-t border-ink-100 bg-white/95 backdrop-blur">
        <div className="grid grid-cols-4">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end}
              className={({ isActive }) => cn(
                "relative flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition",
                isActive ? "text-brand-600" : "text-ink-400 hover:text-ink-600")}>
              <span className="text-lg leading-none">{item.icon}</span>
              {item.label}
              {item.to === "/customer/notifications" && unread > 0 && (
                <span className="absolute right-[22%] top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-600 px-1 text-[10px] font-bold text-white">
                  {unread}
                </span>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
