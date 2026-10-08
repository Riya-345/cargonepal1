// ============================================================
// CargoNepal — Brand logo (spec §3)
// ============================================================
import { cn } from "@/core/utils";

export function Logo({ className, light = false, size = "md" }: { className?: string; light?: boolean; size?: "sm" | "md" | "lg" }) {
  const dims = { sm: "h-8 w-8", md: "h-10 w-10", lg: "h-14 w-14" }[size];
  const text = { sm: "text-base", md: "text-lg", lg: "text-2xl" }[size];
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className={cn("relative flex items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-800 shadow-sm", dims)}>
        <svg viewBox="0 0 64 64" className="h-3/4 w-3/4" fill="none">
          <path d="M14 40h6l4-14h16l3 8h7" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="22" cy="46" r="6" stroke="#fff" strokeWidth="3.5" />
          <circle cx="46" cy="46" r="6" stroke="#fff" strokeWidth="3.5" />
          <rect x="26" y="18" width="16" height="12" rx="2.5" fill="#f83232" />
        </svg>
      </div>
      <div className="leading-tight">
        <span className={cn("block font-display font-extrabold tracking-tight", text, light ? "text-white" : "text-ink-900")}>
          Cargo<span className="text-accent-600">Nepal</span>
        </span>
        {size !== "sm" && (
          <span className={cn("block text-[11px] font-medium", light ? "text-white/70" : "text-ink-500")}>
            Fast. Safe. Parcel First.
          </span>
        )}
      </div>
    </div>
  );
}
