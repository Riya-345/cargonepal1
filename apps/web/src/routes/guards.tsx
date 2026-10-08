// ============================================================
// CargoNepal — Route guards (RBAC, spec §1)
// ============================================================

import { type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/core/hooks/useAuth";
import { Spinner } from "@/components/ui";
import { ROLE_HOME } from "@/core/constants";
import type { UserRole } from "@/models/types";

function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50">
      <Spinner className="h-8 w-8 text-brand-600" />
    </div>
  );
}

/** Requires an authenticated session; otherwise redirect to login. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullScreenLoader />;
  if (!session) return <Navigate to="/login" state={{ from: location }} replace />;
  return <>{children}</>;
}

/** Requires a specific role; redirects to the correct role home. */
export function RequireRole({ roles, children }: { roles: UserRole[]; children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to={ROLE_HOME[user.role]} replace />;
  return <>{children}</>;
}

/** Redirects an authenticated user to their role home (used on /login). */
export function RoleRedirect({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (user) return <Navigate to={ROLE_HOME[user.role]} replace />;
  return <>{children}</>;
}
