// ============================================================
// CargoNepal — Shared UI primitives (spec §37)
// ============================================================
// Loading states, skeletons, empty states, error states, badges,
// buttons, inputs, modal, toast — used across all three apps.
// ============================================================

import { type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes,
  type TextareaHTMLAttributes, useEffect, createContext, useContext, useState, useCallback } from "react";
import { cn } from "@/core/utils";
import { ORDER_STATUS_LABELS, STATUS_TONE } from "@/core/constants";

// ---- Button ----------------------------------------------------------
type Variant = "primary" | "accent" | "outline" | "ghost";
type Size = "sm" | "md" | "lg";
const variantClass: Record<Variant, string> = {
  primary: "cn-btn-primary", accent: "cn-btn-accent", outline: "cn-btn-outline", ghost: "cn-btn-ghost",
};
const sizeClass: Record<Size, string> = {
  sm: "px-3 py-2 text-sm", md: "px-4 py-2.5 text-sm", lg: "px-6 py-3.5 text-base",
};
export function Button({ variant = "primary", size = "md", className, loading, children, disabled, ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button className={cn(variantClass[variant], sizeClass[size], className)} disabled={disabled || loading} {...props}>
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}

// ---- Spinner ---------------------------------------------------------
export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("animate-spin", className)} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
    </svg>
  );
}

// ---- Inputs ----------------------------------------------------------
export function Input({ className, label, error, hint, ...props }:
  InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string; hint?: string }) {
  return (
    <label className="block">
      {label && <span className="cn-label">{label}</span>}
      <input className={cn("cn-input", error && "border-accent-400 focus:ring-accent-100", className)} {...props} />
      {error ? <span className="mt-1 block text-xs text-accent-600">{error}</span>
        : hint ? <span className="mt-1 block text-xs text-ink-500">{hint}</span> : null}
    </label>
  );
}

export function Textarea({ className, label, error, ...props }:
  TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; error?: string }) {
  return (
    <label className="block">
      {label && <span className="cn-label">{label}</span>}
      <textarea className={cn("cn-input resize-y", error && "border-accent-400", className)} {...props} />
      {error && <span className="mt-1 block text-xs text-accent-600">{error}</span>}
    </label>
  );
}

export function Select({ className, label, error, children, ...props }:
  InputHTMLAttributes<HTMLSelectElement> & { label?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      {label && <span className="cn-label">{label}</span>}
      <select className={cn("cn-input appearance-none bg-white", className)} {...(props as object)}>
        {children}
      </select>
      {error && <span className="mt-1 block text-xs text-accent-600">{error}</span>}
    </label>
  );
}

// ---- Badge -----------------------------------------------------------
export function Badge({ className, children }: { className?: string; children: ReactNode }) {
  return <span className={cn("cn-badge", className)}>{children}</span>;
}

// ---- Card ------------------------------------------------------------
export function Card({ className, children, onClick }: { className?: string; children: ReactNode; onClick?: () => void }) {
  return <div className={cn("cn-card", onClick && "cursor-pointer hover:shadow-pop transition", className)} onClick={onClick}>{children}</div>;
}

// ---- Skeleton --------------------------------------------------------
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("cn-skeleton", className)} />;
}

export function SkeletonList({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-3", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-20 w-full rounded-2xl" />
      ))}
    </div>
  );
}

// ---- Empty state -----------------------------------------------------
export function EmptyState({ icon = "📦", title, message, action }: {
  icon?: string; title: string; message?: string; action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center animate-fade-in">
      <div className="text-5xl mb-4">{icon}</div>
      <h3 className="text-lg font-semibold text-ink-800">{title}</h3>
      {message && <p className="mt-1 max-w-sm text-sm text-ink-500">{message}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// ---- Error state -----------------------------------------------------
export function ErrorState({ title = "Something went wrong", message, onRetry }: {
  title?: string; message?: string; onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center animate-fade-in">
      <div className="text-5xl mb-4">⚠️</div>
      <h3 className="text-lg font-semibold text-ink-800">{title}</h3>
      {message && <p className="mt-1 max-w-sm text-sm text-ink-500">{message}</p>}
      {onRetry && <Button variant="outline" className="mt-5" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

// ---- Modal -----------------------------------------------------------
export function Modal({ open, onClose, title, children, footer, size = "md" }: {
  open: boolean; onClose: () => void; title?: string; children: ReactNode; footer?: ReactNode; size?: "sm" | "md" | "lg";
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  const sizeClass = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl" }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-ink-950/50 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className={cn("relative w-full bg-white rounded-t-3xl sm:rounded-2xl shadow-pop animate-slide-up max-h-[92vh] overflow-hidden flex flex-col", sizeClass)}>
        {title && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100">
            <h3 className="font-semibold text-lg">{title}</h3>
            <button onClick={onClose} className="text-ink-400 hover:text-ink-700 text-2xl leading-none">×</button>
          </div>
        )}
        <div className="px-5 py-4 overflow-y-auto">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-ink-100 bg-ink-50">{footer}</div>}
      </div>
    </div>
  );
}

// ---- Toggle / Switch -------------------------------------------------
export function Toggle({ checked, onChange, label, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean;
}) {
  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn("relative inline-flex h-7 w-12 items-center rounded-full transition-colors",
        checked ? "bg-green-500" : "bg-ink-300", disabled && "opacity-50")}>
      <span className={cn("inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
        checked ? "translate-x-6" : "translate-x-1")} />
      {label && <span className="sr-only">{label}</span>}
    </button>
  );
}

// ---- Toast system ----------------------------------------------------
interface Toast { id: number; message: string; type: "success" | "error" | "info" }
const ToastCtx = createContext<{ push: (message: string, type?: Toast["type"]) => void } | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, type: Toast["type"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);
  const tones = { success: "bg-green-600", error: "bg-accent-600", info: "bg-ink-900" };
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-4 left-1/2 z-[60] w-full max-w-sm -translate-x-1/2 px-4 space-y-2">
        {toasts.map((t) => (
          <div key={t.id} className={cn("rounded-xl px-4 py-3 text-sm font-medium text-white shadow-pop animate-slide-up", tones[t.type])}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx.push;
}

// ---- StatusBadge (order status) --------------------------------------
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const tone = STATUS_TONE[status as keyof typeof STATUS_TONE] ?? "bg-ink-100 text-ink-700";
  return <Badge className={cn(tone, className)}>{ORDER_STATUS_LABELS[status as keyof typeof ORDER_STATUS_LABELS] ?? status}</Badge>;
}
