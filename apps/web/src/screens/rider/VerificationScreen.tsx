// ============================================================
// CargoNepal — Rider verification status (spec §10)
// ============================================================
// Standalone status view: shows the rider's approval state, the
// rejection reason (if any) and a checklist of submitted documents.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, ErrorState, SkeletonList, Badge } from "@/components/ui";
import { useAuth } from "@/core/hooks/useAuth";
import { supabase } from "@/services/supabaseClient";
import { isConfigured } from "@/core/config/env";
import { formatDate } from "@/core/utils";
import type { RiderDocument } from "@/models/types";

type RiderRow = {
  id: string;
  status: "pending" | "approved" | "rejected" | "suspended";
  rejection_reason?: string | null;
  primary_city?: string | null;
  created_at?: string | null;
};

const DOC_LABEL: Record<string, string> = {
  license: "Driving license",
  citizenship: "Citizenship",
  bluebook: "Vehicle bluebook",
  vehicle: "Vehicle photo",
};

const STATUS_META: Record<RiderRow["status"], { icon: string; title: string; tone: string; blurb: string }> = {
  pending: {
    icon: "⏳",
    title: "Under review",
    tone: "bg-amber-50 border-amber-200 text-amber-800",
    blurb: "Your application is being verified by our team. This usually takes 24–48 hours.",
  },
  approved: {
    icon: "✅",
    title: "Approved",
    tone: "bg-green-50 border-green-200 text-green-800",
    blurb: "You're all set! Head to the rider dashboard, go online and start earning.",
  },
  rejected: {
    icon: "❌",
    title: "Rejected",
    tone: "bg-accent-50 border-accent-200 text-accent-800",
    blurb: "Unfortunately your application was not approved. See the reason below.",
  },
  suspended: {
    icon: "⛔",
    title: "Suspended",
    tone: "bg-ink-100 border-ink-200 text-ink-700",
    blurb: "Your rider account has been suspended. Contact support for details.",
  },
};

export default function VerificationScreen() {
  const { user } = useAuth();
  const [rider, setRider] = useState<RiderRow | null>(null);
  const [docs, setDocs] = useState<RiderDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || !isConfigured.supabase) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    const { data: rp, error: rpErr } = await supabase
      .from("rider_profiles").select("*").eq("id", user.id).maybeSingle();
    if (rpErr) { setError(rpErr.message); setLoading(false); return; }
    setRider((rp as RiderRow) ?? null);

    const { data: docsData } = await supabase
      .from("rider_documents").select("*").eq("rider_id", user.id).order("doc_type");
    setDocs((docsData as RiderDocument[]) ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  if (!isConfigured.supabase) {
    return (
      <div className="py-8">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Supabase isn't configured yet. <Link className="underline font-semibold" to="/setup">Open the setup guide</Link>.
        </div>
      </div>
    );
  }

  if (loading) return <div className="py-6"><SkeletonList rows={3} /></div>;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;

  const status = rider?.status ?? "pending";
  const meta = STATUS_META[status];

  return (
    <div className="space-y-5 py-2">
      <div className={`rounded-2xl border p-6 text-center ${meta.tone}`}>
        <div className="text-5xl mb-3">{meta.icon}</div>
        <h2 className="text-xl font-bold capitalize">{meta.title}</h2>
        <p className="mt-1 text-sm opacity-90">{meta.blurb}</p>
        {rider?.created_at && (
          <p className="mt-3 text-xs opacity-70">Applied {formatDate(rider.created_at)}</p>
        )}
      </div>

      {(status === "rejected" || status === "suspended") && rider?.rejection_reason && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-ink-700">Reason</h3>
          <p className="mt-1 text-sm text-ink-600">{rider.rejection_reason}</p>
        </Card>
      )}

      {status === "approved" && (
        <div className="flex justify-center">
          <Link to="/rider" className="cn-btn-primary px-6 py-3">Go to rider dashboard</Link>
        </div>
      )}

      <Card className="p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Submitted documents</h3>
          <Badge className="bg-brand-100 text-brand-800">{docs.length}</Badge>
        </div>
        {docs.length === 0 ? (
          <p className="mt-4 text-sm text-ink-500">
            No documents found. If you just applied, they'll appear here shortly.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center justify-between rounded-xl border border-ink-100 px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-xl">📄</span>
                  <div>
                    <div className="text-sm font-medium text-ink-800">
                      {DOC_LABEL[d.doc_type] ?? d.doc_type}
                    </div>
                    {d.doc_number && <div className="text-xs text-ink-400">#{d.doc_number}</div>}
                  </div>
                </div>
                <Badge className={
                  d.status === "approved" ? "bg-green-100 text-green-800"
                  : d.status === "rejected" ? "bg-accent-100 text-accent-800"
                  : "bg-amber-100 text-amber-800"
                }>
                  {d.status}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="flex justify-center gap-3 pb-4">
        <Button variant="outline" onClick={() => void load()}>Refresh</Button>
        {status !== "approved" && (
          <Link to="/rider/join" className="cn-btn-ghost px-4 py-2.5 text-sm">Re-submit details</Link>
        )}
      </div>
    </div>
  );
}
