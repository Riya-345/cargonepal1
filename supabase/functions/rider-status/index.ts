// ============================================================
// CargoNepal — Edge Function: rider-status (spec §22, §35, §45)
// POST /functions/v1/rider-status   (PUT /riders/status)
// ============================================================
// Admin approves/rejects/suspends/activates a rider. Writes an audit
// log entry (spec §45). Approving sets status=approved + approved_at/by.
// ============================================================

import { adminClient, requireUser, requireRole, readJson, json, handler, HttpError } from "../_shared/http.ts";
import { sendNotification } from "../_shared/notify.ts";

interface Body {
  rider_id: string;
  action: "approve" | "reject" | "suspend" | "activate";
  reason?: string;
}

export default handler(async (req: Request): Promise<Response> => {
  const admin = adminClient();
  const user = await requireUser(req);
  requireRole(user, ["admin", "super_admin"]);
  const body = await readJson<Body>(req);
  if (!body.rider_id || !body.action) throw new HttpError("rider_id and action are required");

  const { data: rider, error } = await admin
    .from("rider_profiles").select("id, status").eq("id", body.rider_id).maybeSingle();
  if (error || !rider) throw new HttpError("Rider not found", 404);

  const statusMap: Record<string, string> = {
    approve: "approved", reject: "rejected", suspend: "suspended", activate: "approved",
  };
  const auditMap: Record<string, string> = {
    approve: "rider_approved", reject: "rider_rejected", suspend: "rider_suspended", activate: "rider_activated",
  };
  const newStatus = statusMap[body.action];

  const patch: Record<string, unknown> = { status: newStatus };
  if (body.action === "approve" || body.action === "activate") {
    patch.approved_at = new Date().toISOString();
    patch.approved_by = user.id;
    patch.rejection_reason = null;
  }
  if (body.action === "reject" || body.action === "suspend") {
    patch.rejection_reason = body.reason ?? null;
    patch.availability = "offline";
  }

  const { error: uErr } = await admin.from("rider_profiles").update(patch).eq("id", body.rider_id);
  if (uErr) throw new HttpError("Failed to update rider status", 500);

  // Sync rider_documents status on approval.
  if (body.action === "approve") {
    await admin.from("rider_documents").update({ status: "approved", reviewed_by: user.id, reviewed_at: new Date().toISOString() }).eq("rider_id", body.rider_id);
  }

  await admin.rpc("write_audit", {
    p_admin_id: user.id, p_action: auditMap[body.action], p_target_type: "rider",
    p_target_id: body.rider_id, p_metadata: { new_status: newStatus, reason: body.reason ?? null },
  });

  await sendNotification(admin, {
    user_id: body.rider_id, audience: "rider",
    title: `Rider ${newStatus}`,
    body: body.action === "approve"
      ? "Congratulations! Your account is approved. Go online to start receiving deliveries."
      : `Your rider account was ${newStatus}${body.reason ? `: ${body.reason}` : ""}.`,
    data: { screen: "home" },
  });

  return json({ ok: true, rider_id: body.rider_id, status: newStatus });
});
