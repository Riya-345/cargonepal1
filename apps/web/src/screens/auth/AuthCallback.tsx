// ============================================================
// CargoNepal — OAuth callback handler (spec §2 Google login)
// ============================================================
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/services/supabaseClient";
import { Spinner } from "@/components/ui";
import { ROLE_HOME } from "@/core/constants";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        supabase.from("users").select("role").eq("id", data.session.user.id).maybeSingle()
          .then(({ data: u }) => navigate(ROLE_HOME[(u?.role as keyof typeof ROLE_HOME) ?? "customer"] ?? "/", { replace: true }));
      } else {
        setError("Authentication failed. Please try again.");
        setTimeout(() => navigate("/login", { replace: true }), 1500);
      }
    });
  }, [navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-ink-50">
      {error
        ? <p className="text-accent-600 font-medium">{error}</p>
        : <><Spinner className="h-8 w-8 text-brand-600" /><p className="text-ink-500 text-sm">Completing sign-in…</p></>}
    </div>
  );
}
