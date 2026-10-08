// ============================================================
// CargoNepal — Auth context (session + role + profile)
// ============================================================

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/services/supabaseClient";
import type { CustomerProfile, RiderProfile, User, UserRole } from "@/models/types";

interface AuthState {
  session: Session | null;
  user: User | null;
  customerProfile: CustomerProfile | null;
  riderProfile: RiderProfile | null;
  role: UserRole | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [customerProfile, setCustomerProfile] = useState<CustomerProfile | null>(null);
  const [riderProfile, setRiderProfile] = useState<RiderProfile | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile(userId: string) {
    const { data } = await supabase
      .from("users")
      .select("id, role, full_name, phone, email, avatar_url, status, created_at")
      .eq("id", userId)
      .maybeSingle();
    const u = (data as User) ?? null;
    setUser(u);
    if (!u) { setCustomerProfile(null); setRiderProfile(null); return; }

    if (u.role === "rider") {
      const { data: rp } = await supabase.from("rider_profiles").select("*").eq("id", userId).maybeSingle();
      setRiderProfile((rp as RiderProfile) ?? null);
      setCustomerProfile(null);
    } else if (u.role === "customer") {
      const { data: cp } = await supabase.from("customer_profiles").select("*").eq("id", userId).maybeSingle();
      setCustomerProfile((cp as CustomerProfile) ?? null);
      setRiderProfile(null);
    } else {
      setCustomerProfile(null); setRiderProfile(null);
    }
  }

  const refreshProfile = useMemo(
    () => async () => {
      const { data: { user: u } } = await supabase.auth.getUser();
      if (u) await loadProfile(u.id);
    },
    [],
  );

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user) await loadProfile(data.session.user.id);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);
      if (newSession?.user) await loadProfile(newSession.user.id);
      else { setUser(null); setCustomerProfile(null); setRiderProfile(null); }
    });

    return () => { mounted = false; sub.subscription.unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value: AuthState = {
    session, user, customerProfile, riderProfile,
    role: user?.role ?? null, loading, refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
