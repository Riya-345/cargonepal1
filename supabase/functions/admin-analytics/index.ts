// ============================================================
// CargoNepal — Edge Function: admin-analytics (spec §19, §35, §44)
// GET /functions/v1/admin-analytics   (GET /admin/analytics)
// ============================================================
// Aggregates dashboard KPIs + time-series charts for the admin panel.
// Admin/super-admin only. Returns today's totals, revenue, COD pending,
// rider counts, and daily order series for charts.
// ============================================================

import { adminClient, requireUser, requireRole, json, handler } from "../_shared/http.ts";

export default handler(async (req: Request): Promise<Response> => {
  const user = await requireUser(req);
  requireRole(user, ["admin", "super_admin"]);
  const admin = adminClient();

  const url = new URL(req.url);
  const days = Math.min(90, Number(url.searchParams.get("days") ?? 30));
  const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - (days - 1));
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

  const ACTIVE = ["PENDING","SEARCHING_RIDER","RIDER_ASSIGNED","RIDER_ACCEPTED","RIDER_ON_THE_WAY_TO_PICKUP","ARRIVED_AT_PICKUP","PARCEL_PICKED_UP","ON_THE_WAY_TO_DESTINATION","ARRIVED_AT_DESTINATION"];

  // Today's orders
  const { count: todaysOrders } = await admin.from("orders").select("*", { count: "exact", head: true }).gte("created_at", todayStart.toISOString());
  const { count: activeDeliveries } = await admin.from("orders").select("*", { count: "exact", head: true }).in("status", ACTIVE);
  const { count: completedToday } = await admin.from("orders").select("*", { count: "exact", head: true }).eq("status", "DELIVERED").gte("delivered_at", todayStart.toISOString());
  const { count: cancelledToday } = await admin.from("orders").select("*", { count: "exact", head: true }).eq("status", "CANCELLED").gte("created_at", todayStart.toISOString());

  // Revenue (successful payments)
  const { data: payments } = await admin.from("payments").select("amount, status, created_at").eq("status", "successful").gte("created_at", start.toISOString());
  const totalRevenue = (payments ?? []).reduce((s, p) => s + Number(p.amount), 0);
  const { data: earnings } = await admin.from("rider_earnings").select("net_earning, platform_commission, earned_at").gte("earned_at", start.toISOString());
  const riderEarnings = (earnings ?? []).reduce((s, e) => s + Number(e.net_earning), 0);
  const platformCommission = (earnings ?? []).reduce((s, e) => s + Number(e.platform_commission), 0);

  // COD pending
  const { data: codPending } = await admin.from("cod_transactions").select("amount").eq("status", "collected");
  const codPendingTotal = (codPending ?? []).reduce((s, c) => s + Number(c.amount), 0);

  // Riders
  const { count: totalRiders } = await admin.from("rider_profiles").select("*", { count: "exact", head: true }).eq("status", "approved");
  const { count: onlineRiders } = await admin.from("rider_profiles").select("*", { count: "exact", head: true }).in("availability", ["online", "busy"]);
  const { count: pendingRiders } = await admin.from("rider_profiles").select("*", { count: "exact", head: true }).eq("status", "pending");

  // Customers
  const { count: totalCustomers } = await admin.from("customer_profiles").select("*", { count: "exact", head: true });

  // Daily series for charts
  const { data: rangeOrders } = await admin.from("orders")
    .select("created_at, status, total_amount").gte("created_at", start.toISOString());
  const series = buildDailySeries(rangeOrders ?? [], days);

  // Status distribution
  const statusCounts: Record<string, number> = {};
  for (const o of rangeOrders ?? []) statusCounts[o.status] = (statusCounts[o.status] ?? 0) + 1;

  return json({
    kpis: {
      todays_orders: todaysOrders ?? 0,
      active_deliveries: activeDeliveries ?? 0,
      completed_today: completedToday ?? 0,
      cancelled_today: cancelledToday ?? 0,
      total_revenue: round2(totalRevenue),
      rider_earnings: round2(riderEarnings),
      platform_commission: round2(platformCommission),
      cod_pending: round2(codPendingTotal),
      total_riders: totalRiders ?? 0,
      online_riders: onlineRiders ?? 0,
      pending_riders: pendingRiders ?? 0,
      total_customers: totalCustomers ?? 0,
    },
    charts: { daily_series: series, status_distribution: statusCounts },
    generated_at: new Date().toISOString(),
  });
});

function buildDailySeries(orders: { created_at: string; status: string; total_amount: number }[], days: number) {
  const buckets: Record<string, { date: string; total: number; completed: number; cancelled: number; revenue: number }> = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    buckets[key] = { date: key, total: 0, completed: 0, cancelled: 0, revenue: 0 };
  }
  for (const o of orders) {
    const key = o.created_at.slice(0, 10);
    if (!buckets[key]) continue;
    buckets[key].total += 1;
    if (o.status === "DELIVERED") { buckets[key].completed += 1; buckets[key].revenue += Number(o.total_amount); }
    if (o.status === "CANCELLED") buckets[key].cancelled += 1;
  }
  return Object.values(buckets).map((b) => ({ ...b, revenue: round2(b.revenue) }));
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
