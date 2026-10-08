// ============================================================
// CargoNepal — Admin layout: desktop-first sidebar (spec §18, §38)
// ============================================================
import { useState } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/core/hooks/useAuth";
import { signOut } from "@/services/auth/authService";
import { Logo } from "@/widgets/Logo";
import { cn } from "@/core/utils";

const NAV = [
  { group: "Operations", items: [
    { to: "/admin", label: "Dashboard", icon: "📊", end: true },
    { to: "/admin/orders", label: "Orders", icon: "📦" },
    { to: "/admin/live-map", label: "Live Map", icon: "🗺️" },
  ]},
  { group: "People", items: [
    { to: "/admin/riders", label: "Riders", icon: "🛵" },
    { to: "/admin/customers", label: "Customers", icon: "👥" },
    { to: "/admin/support", label: "Support", icon: "🎧" },
  ]},
  { group: "Finance", items: [
    { to: "/admin/payments", label: "Payments", icon: "💳" },
    { to: "/admin/cod", label: "COD", icon: "💵" },
    { to: "/admin/reports", label: "Reports", icon: "📈" },
  ]},
  { group: "Configuration", items: [
    { to: "/admin/pricing", label: "Pricing", icon: "🏷️" },
    { to: "/admin/promotions", label: "Promotions", icon: "🎟️" },
    { to: "/admin/service-areas", label: "Service Areas", icon: "📍" },
    { to: "/admin/settings", label: "Settings", icon: "⚙️" },
    { to: "/admin/audit", label: "Audit Logs", icon: "🔒" },
  ]},
];

export function AdminLayout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const SidebarContent = (
    <div className="flex h-full flex-col">
      <div className="px-5 py-4 border-b border-white/10">
        <Logo light size="sm" />
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {NAV.map((section) => (
          <div key={section.group}>
            <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/40">{section.group}</p>
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) => cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                    isActive ? "bg-white/15 text-white" : "text-white/65 hover:bg-white/8 hover:text-white")}>
                  <span className="text-base">{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-sm font-bold">
            {(user?.full_name ?? "A").charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{user?.full_name ?? "Admin"}</p>
            <p className="truncate text-xs text-white/50 capitalize">{user?.role?.replace("_", " ")}</p>
          </div>
        </div>
        <button onClick={async () => { await signOut(); navigate("/"); }}
          className="mt-1 w-full rounded-lg px-3 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white">
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-ink-50">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 bg-ink-950 lg:block">
        {SidebarContent}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink-950/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-ink-950 animate-fade-in">{SidebarContent}</aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-ink-100 bg-white/90 backdrop-blur px-4 py-3 lg:px-8">
          <button onClick={() => setOpen(true)} className="lg:hidden text-2xl text-ink-700">☰</button>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-3">
            <span className="cn-badge bg-green-100 text-green-800">● Live</span>
            <NavLink to="/" className="text-sm text-ink-500 hover:text-brand-600">View site</NavLink>
          </div>
        </header>
        <main className="p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
