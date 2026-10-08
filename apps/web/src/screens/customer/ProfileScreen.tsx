// ============================================================
// CargoNepal — Customer profile (spec §27)
// ============================================================
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Button, Card, Input, Modal, Spinner, useToast, Badge,
} from "@/components/ui";
import { useAuth } from "@/core/hooks/useAuth";
import { getPublicUrl } from "@/services/storage/storageService";
import { supabase } from "@/services/supabaseClient";
import { isConfigured } from "@/core/config/env";
import { BRAND } from "@/core/constants";
import { cn, formatNPR } from "@/core/utils";

const MENU = [
  { to: "/customer/addresses", icon: "📍", label: "Saved addresses", hint: "Home, work and other shortcuts" },
  { to: "/customer/payments", icon: "💳", label: "Payment history", hint: "All transactions and receipts" },
  { to: "/customer/support", icon: "🎧", label: "Help & support", hint: "Tickets, refunds and questions" },
];

const TERMS_TEXT = [
  "CargoNepal connects you with independent bike couriers for instant parcel delivery within our service cities.",
  "Bookings: Fares are estimated before you confirm and finalised at booking. Promotional discounts are applied automatically when a valid code is used.",
  "Payments: Digital payments (Khalti, eSewa, Fonepay) are verified server-side with the provider before an order is marked paid. Cash-on-delivery amounts are collected by the rider from the receiver.",
  "Prohibited items: We do not carry illegal, hazardous, perishable-unsafe or oversized items. Riders may refuse parcels that violate these rules.",
  "Cancellations: Orders can be cancelled free of charge before the rider arrives at pickup. Late cancellations may incur a fee as shown at booking.",
  "Liability: Declared value helps us handle claims. Liability for undeclared high-value items is limited per our carrier policy.",
].join("\n\n");

const PRIVACY_TEXT = [
  "We collect your name, phone number, and locations you provide (pickup/drop-off pins and saved addresses) solely to fulfil deliveries.",
  "Riders see your pickup/drop-off details and contact numbers only while an order is active.",
  "Live GPS tracking data is stored per order and used to show delivery progress; it is not sold or shared with third parties.",
  "Payment details are processed by licensed payment providers (Khalti, eSewa, Fonepay). CargoNepal never stores your wallet credentials or card numbers.",
  "You can request export or deletion of your account and associated data by contacting " + BRAND.supportEmail + ".",
].join("\n\n");

export default function ProfileScreen() {
  const { user, customerProfile, loading, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [nameOpen, setNameOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [legalDoc, setLegalDoc] = useState<"terms" | "privacy" | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const avatarUrl = useMemo(() => {
    if (!user?.avatar_url) return null;
    if (user.avatar_url.startsWith("http")) return user.avatar_url;
    return getPublicUrl("avatars", user.avatar_url);
  }, [user?.avatar_url]);

  const initials = useMemo(() => {
    const parts = (user?.full_name ?? "?").trim().split(/\s+/);
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
  }, [user?.full_name]);

  async function saveName() {
    if (!user) return;
    const name = nameDraft.trim();
    if (name.length < 2) { setNameError("Name must be at least 2 characters."); return; }
    setSavingName(true);
    setNameError(null);
    try {
      const { error } = await supabase.from("users").update({ full_name: name }).eq("id", user.id);
      if (error) throw new Error(error.message);
      await refreshProfile();
      toast("Name updated", "success");
      setNameOpen(false);
    } catch (e) {
      setNameError(e instanceof Error ? e.message : "Could not update your name.");
    } finally {
      setSavingName(false);
    }
  }

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await supabase.auth.signOut();
      navigate("/", { replace: true });
    } catch {
      toast("Could not sign out — please try again", "error");
      setSigningOut(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner className="h-8 w-8 text-brand-600" />
      </div>
    );
  }

  return (
    <div className="pb-4 space-y-5 animate-fade-in">
      <h1 className="font-display text-xl font-bold text-ink-900">Profile</h1>

      {!isConfigured.supabase && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Supabase is not configured.{" "}
          <Link to="/setup" className="font-semibold underline">Open the setup guide</Link>.
        </div>
      )}

      {/* Identity card */}
      <Card className="flex items-center gap-4 p-5">
        {avatarUrl ? (
          <img src={avatarUrl} alt={user?.full_name ?? "Avatar"}
            className="h-16 w-16 rounded-full object-cover border border-ink-100" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 font-display text-xl font-bold text-brand-700">
            {initials}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-lg font-bold text-ink-900">{user?.full_name ?? "Unnamed"}</p>
          {user?.phone && <p className="text-sm text-ink-500">{user.phone}</p>}
          {user?.email && <p className="truncate text-xs text-ink-400">{user.email}</p>}
        </div>
        <Button variant="outline" size="sm"
          onClick={() => { setNameDraft(user?.full_name ?? ""); setNameError(null); setNameOpen(true); }}>
          Edit
        </Button>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4 text-center">
          <p className="font-display text-2xl font-bold text-brand-700">{customerProfile?.total_orders ?? 0}</p>
          <p className="text-xs text-ink-500">Orders</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="font-display text-lg font-bold text-ink-900">{formatNPR(customerProfile?.total_spent ?? 0)}</p>
          <p className="text-xs text-ink-500">Total spent</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="font-display text-2xl font-bold text-accent-600">{customerProfile?.loyalty_points ?? 0}</p>
          <p className="text-xs text-ink-500">Loyalty points</p>
        </Card>
      </div>

      {customerProfile?.referral_code && (
        <Card className="flex items-center justify-between p-4">
          <div>
            <p className="text-sm font-semibold text-ink-800">Your referral code</p>
            <p className="text-xs text-ink-500">Share it and earn loyalty points on referred deliveries.</p>
          </div>
          <Badge className="bg-brand-100 font-mono text-brand-800">{customerProfile.referral_code}</Badge>
        </Card>
      )}

      {/* Menu */}
      <div className="space-y-2">
        {MENU.map((m) => (
          <Card key={m.to} className="flex items-center gap-3 p-4" onClick={() => navigate(m.to)}>
            <span className="text-2xl">{m.icon}</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-ink-800">{m.label}</p>
              <p className="text-xs text-ink-500">{m.hint}</p>
            </div>
            <span className="text-ink-300">›</span>
          </Card>
        ))}
        <Card className="flex items-center gap-3 p-4" onClick={() => setLegalDoc("terms")}>
          <span className="text-2xl">📜</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-ink-800">Terms of Service</p>
            <p className="text-xs text-ink-500">How bookings, fares and cancellations work</p>
          </div>
          <span className="text-ink-300">›</span>
        </Card>
        <Card className="flex items-center gap-3 p-4" onClick={() => setLegalDoc("privacy")}>
          <span className="text-2xl">🔒</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-ink-800">Privacy Policy</p>
            <p className="text-xs text-ink-500">What we collect and how it's used</p>
          </div>
          <span className="text-ink-300">›</span>
        </Card>
      </div>

      <Button variant="accent" className={cn("w-full")} loading={signingOut} onClick={() => void handleSignOut()}>
        Sign out
      </Button>
      <p className="text-center text-xs text-ink-400">
        {BRAND.name} · {BRAND.tagline} · Support: {BRAND.supportEmail}
      </p>

      {/* Edit name modal */}
      <Modal open={nameOpen} onClose={() => setNameOpen(false)} title="Edit your name" size="sm"
        footer={
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setNameOpen(false)}>Cancel</Button>
            <Button className="flex-1" loading={savingName} onClick={() => void saveName()}>Save</Button>
          </div>
        }>
        <Input label="Full name" value={nameDraft} error={nameError ?? undefined}
          onChange={(e) => setNameDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void saveName()} />
      </Modal>

      {/* Legal modals */}
      <Modal open={legalDoc !== null} onClose={() => setLegalDoc(null)}
        title={legalDoc === "privacy" ? "Privacy Policy" : "Terms of Service"} size="lg"
        footer={<Button variant="outline" className="w-full" onClick={() => setLegalDoc(null)}>Close</Button>}>
        <div className="space-y-3 text-sm leading-relaxed text-ink-600">
          {(legalDoc === "privacy" ? PRIVACY_TEXT : TERMS_TEXT).split("\n\n").map((para, i) => (
            <p key={i}>{para}</p>
          ))}
          <p className="pt-2 text-xs text-ink-400">
            Last updated: October 2026 · Questions? Write to {BRAND.supportEmail}.
          </p>
        </div>
      </Modal>
    </div>
  );
}
