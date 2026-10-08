// ============================================================
// CargoNepal — Payment history (spec §29)
// ============================================================
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Card, Button, SkeletonList, EmptyState, ErrorState, Badge,
} from "@/components/ui";
import { fetchCustomerPayments } from "@/services/payments/paymentsService";
import { isConfigured } from "@/core/config/env";
import { cn, formatDateTime, formatNPR, timeAgo } from "@/core/utils";
import type { Payment } from "@/models/types";

const STATUS_TONE: Record<string, string> = {
  successful: "bg-green-100 text-green-800",
  pending: "bg-amber-100 text-amber-800",
  initiated: "bg-amber-100 text-amber-800",
  failed: "bg-accent-100 text-accent-800",
  refunded: "bg-ink-200 text-ink-700",
};

const PROVIDER_TONE: Record<string, string> = {
  khalti: "bg-purple-100 text-purple-800",
  esewa: "bg-emerald-100 text-emerald-800",
  fonepay: "bg-sky-100 text-sky-800",
  card: "bg-indigo-100 text-indigo-800",
  cod: "bg-amber-100 text-amber-800",
};

export default function PaymentHistoryScreen() {
  const navigate = useNavigate();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPayments(await fetchCustomerPayments(50));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your payments.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isConfigured.supabase) { setLoading(false); return; }
    void load();
  }, [load]);

  const totalPaid = payments.filter((p) => p.status === "successful")
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  if (!isConfigured.supabase) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        Payment history requires a configured Supabase backend.{" "}
        <Link to="/setup" className="font-semibold underline">Open the setup guide</Link>.
      </div>
    );
  }

  return (
    <div className="pb-4 space-y-4 animate-fade-in">
      <header className="flex items-center gap-3">
        <Link to="/customer/profile" className="text-ink-400 hover:text-ink-700 text-xl leading-none">←</Link>
        <h1 className="font-display text-xl font-bold text-ink-900">Payment history</h1>
      </header>

      {!loading && !error && payments.length > 0 && (
        <Card className="flex items-center justify-between p-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-400">Total paid</p>
            <p className="font-display text-2xl font-bold text-ink-900">{formatNPR(totalPaid)}</p>
          </div>
          <span className="text-3xl">💳</span>
        </Card>
      )}

      {loading ? (
        <SkeletonList rows={4} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : payments.length === 0 ? (
        <EmptyState icon="💳" title="No payments yet"
          message="Once you pay for a delivery — digitally or via COD — the transaction will appear here."
          action={<Button onClick={() => navigate("/customer/book")}>Send a parcel</Button>} />
      ) : (
        <div className="space-y-2">
          {payments.map((p) => (
            <Card key={p.id} className="p-4" onClick={() => navigate(`/customer/orders/${p.order_id}`)}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-ink-900">{formatNPR(p.amount)}</p>
                  <p className="text-xs text-ink-500">{formatDateTime(p.created_at)} · {timeAgo(p.created_at)}</p>
                  {p.transaction_reference && (
                    <p className="mt-0.5 truncate font-mono text-[10px] text-ink-400">ref {p.transaction_reference}</p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <Badge className={cn("uppercase", PROVIDER_TONE[p.provider] ?? "bg-ink-100 text-ink-700")}>{p.provider}</Badge>
                  <Badge className={cn("capitalize", STATUS_TONE[p.status] ?? "bg-ink-100 text-ink-700")}>{p.status}</Badge>
                  <span className="text-xs text-brand-600">View order ›</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
