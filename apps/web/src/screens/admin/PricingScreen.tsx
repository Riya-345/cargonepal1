// ============================================================
// CargoNepal — Admin Pricing configuration (spec §24, §52)
// ============================================================
// Pricing is data-driven: admins change fares here and the fare engine
// picks them up immediately — no code changes or redeploy needed.
// Every save writes a snapshot into pricing_history for auditability.
// ============================================================
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/services/supabaseClient";
import { useAuth } from "@/core/hooks/useAuth";
import { isConfigured } from "@/core/config/env";
import {
  Button, Card, Input, Toggle, Badge,
  Skeleton, EmptyState, ErrorState, useToast,
} from "@/components/ui";
import { formatDateTime } from "@/core/utils";
import type { PricingRule } from "@/models/types";

type NumericField = Exclude<keyof PricingRule, "id" | "service_area_id" | "name" | "is_active" | "peak_hours">;

const FIELDS: { key: NumericField; label: string; hint?: string; step?: string }[] = [
  { key: "base_fare", label: "Base fare (NPR)", hint: "Flat charge for every delivery" },
  { key: "per_km_rate", label: "Per-km rate (NPR)" },
  { key: "per_kg_rate", label: "Per-kg rate (NPR)" },
  { key: "minimum_fare", label: "Minimum fare (NPR)" },
  { key: "cod_fee", label: "COD fee (NPR)" },
  { key: "cod_percent", label: "COD percent (%)", hint: "Optional % of the COD amount" },
  { key: "waiting_fee_per_min", label: "Waiting fee / min (NPR)" },
  { key: "free_waiting_minutes", label: "Free waiting minutes", step: "1" },
  { key: "priority_fee", label: "Priority fee (NPR)" },
  { key: "express_fee", label: "Express fee (NPR)" },
  { key: "fragile_fee", label: "Fragile fee (NPR)" },
  { key: "peak_multiplier", label: "Peak multiplier (×)", hint: "e.g. 1.25 = +25% during peak hours", step: "0.05" },
  { key: "platform_commission_percent", label: "Platform commission (%)", step: "0.5" },
  { key: "min_distance_km", label: "Min distance (km)" },
  { key: "max_distance_km", label: "Max distance (km)" },
  { key: "rider_matching_radius_km", label: "Rider matching radius (km)" },
  { key: "cancellation_free_minutes", label: "Free cancellation window (min)", step: "1" },
  { key: "cancellation_fee", label: "Cancellation fee (NPR)" },
];

const DEFAULTS: Record<NumericField, number> = {
  base_fare: 50, per_km_rate: 15, per_kg_rate: 5, minimum_fare: 60,
  cod_fee: 20, cod_percent: 0, waiting_fee_per_min: 2, free_waiting_minutes: 5,
  priority_fee: 30, express_fee: 60, fragile_fee: 25, peak_multiplier: 1,
  platform_commission_percent: 20, min_distance_km: 0, max_distance_km: 40,
  rider_matching_radius_km: 5, cancellation_free_minutes: 3, cancellation_fee: 20,
};

interface HistoryRow {
  id: string;
  pricing_rule_id: string;
  changed_by: string | null;
  snapshot: Record<string, unknown>;
  created_at: string;
  admin_name?: string | null;
}

export default function PricingScreen() {
  const { user } = useAuth();
  const toast = useToast();
  const [rule, setRule] = useState<PricingRule | null>(null);
  const [form, setForm] = useState<Record<NumericField, string>>(
    Object.fromEntries(Object.entries(DEFAULTS).map(([k, v]) => [k, String(v)])) as Record<NumericField, string>,
  );
  const [isActive, setIsActive] = useState(true);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isConfigured.supabase) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const { data, error: e } = await supabase.from("pricing_rules").select("*").order("created_at", { ascending: true }).limit(10);
      if (e) throw new Error(e.message);
      const rules = (data as PricingRule[]) ?? [];
      const active = rules.find((r) => r.is_active) ?? rules[0] ?? null;
      setRule(active);
      if (active) {
        setForm(Object.fromEntries(FIELDS.map((f) => [f.key, String(active[f.key] ?? DEFAULTS[f.key])])) as Record<NumericField, string>);
        setIsActive(active.is_active);
        const { data: hist } = await supabase.from("pricing_history")
          .select("*").eq("pricing_rule_id", active.id).order("created_at", { ascending: false }).limit(20);
        const histRows = (hist as HistoryRow[]) ?? [];
        const adminIds = [...new Set(histRows.map((h) => h.changed_by).filter((x): x is string => Boolean(x)))];
        if (adminIds.length) {
          const { data: admins } = await supabase.from("users").select("id, full_name").in("id", adminIds);
          const aMap = new Map((admins ?? []).map((a) => [a.id as string, a.full_name as string]));
          histRows.forEach((h) => { h.admin_name = h.changed_by ? aMap.get(h.changed_by) ?? null : null; });
        }
        setHistory(histRows);
      } else {
        setHistory([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load pricing rules");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function buildValues(): Record<NumericField, number> {
    const out = {} as Record<NumericField, number>;
    for (const f of FIELDS) out[f.key] = Number(form[f.key] || 0);
    return out;
  }

  async function createDefaultRule() {
    setCreating(true);
    try {
      const values = buildValues();
      const { error: e } = await supabase.from("pricing_rules")
        .insert({ name: "default", is_active: true, ...values });
      if (e) throw new Error(e.message);
      toast("Default pricing rule created", "success");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to create rule", "error");
    } finally {
      setCreating(false);
    }
  }

  async function save() {
    if (!rule || !user?.id) return;
    setSaving(true);
    try {
      const values = buildValues();
      const { error: e } = await supabase.from("pricing_rules")
        .update({ ...values, is_active: isActive, updated_at: new Date().toISOString() })
        .eq("id", rule.id);
      if (e) throw new Error(e.message);
      const { error: hErr } = await supabase.from("pricing_history").insert({
        pricing_rule_id: rule.id,
        changed_by: user.id,
        snapshot: { name: rule.name, is_active: isActive, ...values },
      });
      if (hErr) throw new Error(hErr.message);
      toast("Pricing updated — new fares apply to future quotes immediately", "success");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to save pricing", "error");
    } finally {
      setSaving(false);
    }
  }

  if (!isConfigured.supabase) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold text-ink-900">Pricing</h1>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Supabase is not configured. <Link to="/setup" className="font-semibold underline">Run setup</Link>.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-ink-900">Pricing</h1>
        <p className="text-sm text-ink-500">
          Fares, fees and commission are business configuration — change them here at any time,
          no code changes or redeploy required. Changes take effect for new fare quotes immediately.
        </p>
      </div>

      {loading ? (
        <div className="mt-6 space-y-4">
          <Skeleton className="h-64 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      ) : error ? (
        <ErrorState title="Could not load pricing" message={error} onRetry={() => void load()} />
      ) : !rule ? (
        <Card className="mt-6">
          <EmptyState icon="🏷️" title="No pricing rule yet"
            message="Create the default rule to enable fare estimates. Defaults match the launch pricing (base NPR 50, NPR 15/km, 20% commission)."
            action={<Button loading={creating} onClick={() => void createDefaultRule()}>Create default rule</Button>} />
        </Card>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="p-5 lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ink-800">Rule: <span className="font-mono">{rule.name}</span></h3>
              <label className="flex items-center gap-2 text-sm text-ink-600">
                <Toggle checked={isActive} onChange={setIsActive} label="Active" /> Active
              </label>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FIELDS.map((f) => (
                <Input key={f.key} type="number" step={f.step ?? "0.5"} min="0"
                  label={f.label} hint={f.hint}
                  value={form[f.key]}
                  onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))} />
              ))}
            </div>
            <div className="mt-5 flex justify-end gap-2 border-t border-ink-100 pt-4">
              <Button variant="ghost" onClick={() => void load()}>Reset</Button>
              <Button loading={saving} onClick={() => void save()}>Save pricing</Button>
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="mb-3 text-sm font-semibold text-ink-800">Change history</h3>
            {history.length === 0 ? (
              <p className="text-sm text-ink-500">No changes recorded yet. Every save stores a full snapshot here.</p>
            ) : (
              <ul className="space-y-3">
                {history.map((h) => (
                  <li key={h.id} className="rounded-xl border border-ink-100 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-ink-700">{h.admin_name ?? (h.changed_by ? h.changed_by.slice(0, 8) : "system")}</span>
                      <Badge className="bg-brand-100 text-brand-800">{formatDateTime(h.created_at)}</Badge>
                    </div>
                    <p className="mt-2 text-xs text-ink-500">
                      base {String((h.snapshot as Record<string, unknown>).base_fare ?? "—")} · km {String((h.snapshot as Record<string, unknown>).per_km_rate ?? "—")} · commission {String((h.snapshot as Record<string, unknown>).platform_commission_percent ?? "—")}%
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
