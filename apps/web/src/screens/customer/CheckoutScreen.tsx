// ============================================================
// CargoNepal — Checkout (spec §17)
// Digital payments: Khalti / eSewa / Fonepay. Verification is
// always server-side — the UI never fakes a success state.
// ============================================================
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Button, Card, Spinner, ErrorState, Badge, useToast,
} from "@/components/ui";
import { fetchOrder } from "@/services/orders/ordersService";
import { initiatePayment, verifyPayment, type InitiateResponse } from "@/services/payments/paymentsService";
import { isConfigured } from "@/core/config/env";
import { cn, formatNPR, formatDateTime } from "@/core/utils";
import type { Order } from "@/models/types";

type Provider = "khalti" | "esewa" | "fonepay";

const PROVIDERS: { value: Provider; label: string; icon: string; blurb: string }[] = [
  { value: "khalti", label: "Khalti", icon: "💜", blurb: "Khalti wallet checkout" },
  { value: "esewa", label: "eSewa", icon: "💚", blurb: "eSewa wallet checkout" },
  { value: "fonepay", label: "Fonepay", icon: "🔵", blurb: "Fonepay QR / mobile banking" },
];

export default function CheckoutScreen() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [busyProvider, setBusyProvider] = useState<Provider | null>(null);
  const [initiated, setInitiated] = useState<InitiateResponse | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ ok: boolean; status: string } | null>(null);

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    setError(null);
    try {
      const o = await fetchOrder(orderId);
      if (!o) { setError("Order not found."); return; }
      setOrder(o);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the order.");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { void load(); }, [load]);

  async function handleInitiate(provider: Provider) {
    if (!orderId || busyProvider) return;
    setBusyProvider(provider);
    setInitiated(null);
    setVerifyResult(null);
    try {
      const res = await initiatePayment(orderId, provider);
      setInitiated(res);
      if (res.checkout.configured && res.checkout.payment_url) {
        toast(`Redirecting to ${provider} checkout…`, "info");
        window.location.href = res.checkout.payment_url;
        return;
      }
      if (res.checkout.configured && res.checkout.gateway) {
        toast(`${provider} initiated — complete it in your ${provider} app, then verify here.`, "info");
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Payment could not be started", "error");
    } finally {
      setBusyProvider(null);
    }
  }

  async function handleVerify() {
    if (!orderId || !initiated || verifying) return;
    setVerifying(true);
    setVerifyResult(null);
    try {
      const res = await verifyPayment({
        payment_id: initiated.payment_id,
        order_id: orderId,
        provider: initiated.provider as Provider,
      });
      setVerifyResult(res);
      if (res.ok) {
        toast("Payment confirmed by server 🎉", "success");
        await load();
      } else {
        toast(`Server reports payment "${res.status}" — not confirmed yet`, "info");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Verification failed";
      setVerifyResult({ ok: false, status: msg });
      toast(msg, "error");
    } finally {
      setVerifying(false);
    }
  }

  if (!isConfigured.supabase) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        Payments require a configured Supabase backend.{" "}
        <Link to="/setup" className="font-semibold underline">Open the setup guide</Link>.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner className="h-8 w-8 text-brand-600" />
      </div>
    );
  }

  if (error || !order) {
    return <ErrorState title="Checkout unavailable" message={error ?? undefined} onRetry={() => void load()} />;
  }

  const paid = order.is_paid || order.payment_status === "successful";

  if (paid) {
    return (
      <div className="pb-4 space-y-5 animate-fade-in">
        <Card className="p-6 text-center space-y-3">
          <div className="text-5xl">✅</div>
          <h1 className="font-display text-xl font-bold text-ink-900">Payment successful</h1>
          <p className="text-sm text-ink-500">
            Order <span className="font-mono font-semibold text-ink-800">{order.order_code}</span> ·{" "}
            {formatNPR(order.total_amount)} paid.
          </p>
          <div className="flex justify-center gap-3 pt-2">
            <Button onClick={() => navigate(`/customer/track/${order.id}`)}>Track delivery</Button>
            <Button variant="outline" onClick={() => navigate(`/customer/orders/${order.id}`)}>Order details</Button>
          </div>
        </Card>
      </div>
    );
  }

  const notConfigured = initiated && !initiated.checkout.configured;

  return (
    <div className="pb-4 space-y-5 animate-fade-in">
      <header className="flex items-center gap-3">
        <Link to={`/customer/orders/${order.id}`} className="text-ink-400 hover:text-ink-700 text-xl leading-none">←</Link>
        <h1 className="font-display text-xl font-bold text-ink-900">Checkout</h1>
      </header>

      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-400">Amount due</p>
            <p className="font-display text-3xl font-bold text-ink-900">{formatNPR(order.total_amount)}</p>
          </div>
          <div className="text-right text-sm text-ink-500">
            <p className="font-mono font-semibold text-ink-800">{order.order_code}</p>
            <p className="text-xs">Placed {formatDateTime(order.created_at)}</p>
            <Badge className={cn("mt-1", order.payment_status === "pending" ? "bg-amber-100 text-amber-800" : "bg-ink-100 text-ink-700")}>
              {order.payment_status}
            </Badge>
          </div>
        </div>
      </Card>

      <div className="space-y-2">
        <h2 className="font-display text-base font-bold text-ink-900">Choose a payment provider</h2>
        {PROVIDERS.map((p) => (
          <Card key={p.value} className={cn("flex items-center gap-3 p-4",
            initiated?.provider === p.value && "border-brand-400 ring-2 ring-brand-100")}>
            <span className="text-2xl">{p.icon}</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-ink-800">{p.label}</p>
              <p className="text-xs text-ink-500">{p.blurb}</p>
            </div>
            <Button size="sm" loading={busyProvider === p.value}
              disabled={busyProvider !== null && busyProvider !== p.value}
              onClick={() => void handleInitiate(p.value)}>
              {initiated?.provider === p.value ? "Retry" : "Pay"}
            </Button>
          </Card>
        ))}
      </div>

      {notConfigured && (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900 space-y-2">
          <p className="font-semibold">This provider isn't live yet</p>
          <p>{initiated?.checkout.message ?? `${initiated?.provider} checkout is not configured on the server.`}</p>
          <p className="text-xs">
            No money has been taken. You can pay the rider in cash instead — your order stays active.
          </p>
          <div className="flex gap-2 pt-1">
            <Button size="sm" variant="outline" onClick={() => navigate(`/customer/track/${order.id}`)}>
              Continue with Cash on Delivery
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setInitiated(null); }}>
              Try another provider
            </Button>
          </div>
        </div>
      )}

      {initiated?.checkout.configured && (
        <Card className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-base font-bold text-ink-900">
              {initiated.provider.charAt(0).toUpperCase() + initiated.provider.slice(1)} payment started
            </h3>
            {initiated.checkout.test_mode && <Badge className="bg-amber-100 text-amber-800">Test mode</Badge>}
          </div>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-ink-500">Amount</dt><dd className="font-medium">{formatNPR(initiated.amount)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-ink-500">Reference</dt><dd className="font-mono text-xs">{initiated.transaction_reference}</dd></div>
            {initiated.checkout.gateway && (
              <div className="flex justify-between"><dt className="text-ink-500">Gateway</dt><dd className="font-medium">{String(initiated.checkout.gateway)}</dd></div>
            )}
          </dl>
          {initiated.checkout.payment_url && (
            <Button variant="outline" className="w-full"
              onClick={() => { window.location.href = initiated.checkout.payment_url!; }}>
              Open {initiated.provider} checkout again
            </Button>
          )}
          <div className="rounded-xl bg-ink-50 p-3 text-xs text-ink-500">
            ℹ️ After you complete the payment in the provider's page/app, press verify below. Verification
            happens <strong>server-side</strong> — CargoNepal asks the provider directly and only marks the
            order paid when the provider confirms it.
          </div>
          <Button className="w-full" loading={verifying} onClick={() => void handleVerify()}>
            I've completed payment — verify
          </Button>
          {verifyResult && (
            <div className={cn("rounded-xl p-3 text-sm",
              verifyResult.ok ? "bg-green-50 text-green-800" : "bg-accent-50 text-accent-800")}>
              Server result: <strong>{verifyResult.ok ? "payment confirmed" : verifyResult.status}</strong>
              {!verifyResult.ok && " — if you already paid, wait a few seconds and verify again."}
            </div>
          )}
        </Card>
      )}

      <Card className="flex items-center justify-between p-4">
        <div>
          <p className="text-sm font-semibold text-ink-800">Prefer cash?</p>
          <p className="text-xs text-ink-500">Track your order and pay the rider on delivery.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate(`/customer/track/${order.id}`)}>
          Go to tracking →
        </Button>
      </Card>
    </div>
  );
}
