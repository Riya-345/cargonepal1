// ============================================================
// CargoNepal — Admin Support inbox (spec §30)
// ============================================================
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/services/supabaseClient";
import { useAuth } from "@/core/hooks/useAuth";
import { isConfigured } from "@/core/config/env";
import { TICKET_CATEGORIES } from "@/core/constants";
import {
  Button, Card, Badge, Select, Textarea, Modal, Input,
  SkeletonList, EmptyState, ErrorState, useToast,
} from "@/components/ui";
import { cn, formatDateTime, timeAgo } from "@/core/utils";
import type { SupportTicket, TicketCategory, TicketStatus, User } from "@/models/types";

type TicketRow = SupportTicket & {
  users: Pick<User, "id" | "full_name" | "phone"> | null;
};

interface TicketMessage {
  id: string;
  ticket_id: string;
  sender_id: string | null;
  sender_role: string | null;
  is_internal: boolean;
  message: string;
  created_at: string;
}

const STATUS_TONES: Record<TicketStatus, string> = {
  open: "bg-amber-100 text-amber-800",
  in_progress: "bg-blue-100 text-blue-800",
  resolved: "bg-green-100 text-green-800",
  closed: "bg-ink-200 text-ink-700",
};

const STATUSES: TicketStatus[] = ["open", "in_progress", "resolved", "closed"];

export default function SupportScreen() {
  const { user: admin } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState<TicketRow[]>([]);
  const [agents, setAgents] = useState<Pick<User, "id" | "full_name">[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [search, setSearch] = useState("");

  const [thread, setThread] = useState<TicketRow | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [updatingTicket, setUpdatingTicket] = useState(false);

  const load = useCallback(async () => {
    if (!isConfigured.supabase) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const { data, error: e } = await supabase.from("support_tickets")
        .select("*, users(id, full_name, phone)")
        .order("created_at", { ascending: false })
        .limit(300);
      if (e) throw new Error(e.message);
      setRows((data as TicketRow[]) ?? []);
      const { data: adminUsers } = await supabase.from("users")
        .select("id, full_name").in("role", ["admin", "super_admin"]).limit(50);
      setAgents((adminUsers as Pick<User, "id" | "full_name">[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tickets");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function openThread(t: TicketRow) {
    setThread(t);
    setReply("");
    setMessages([]);
    setLoadingThread(true);
    const { data, error: e } = await supabase.from("support_ticket_messages")
      .select("*").eq("ticket_id", t.id).order("created_at", { ascending: true });
    if (e) toast(e.message, "error");
    else setMessages((data as TicketMessage[]) ?? []);
    setLoadingThread(false);
  }

  async function sendReply() {
    if (!thread || !reply.trim()) return;
    setSending(true);
    try {
      const { error: e } = await supabase.from("support_ticket_messages").insert({
        ticket_id: thread.id,
        sender_id: admin?.id ?? null,
        sender_role: "admin",
        message: reply.trim(),
      });
      if (e) throw new Error(e.message);
      // First admin reply moves an open ticket to in_progress.
      if (thread.status === "open") {
        await supabase.from("support_tickets").update({ status: "in_progress", updated_at: new Date().toISOString() }).eq("id", thread.id);
        setThread({ ...thread, status: "in_progress" });
      }
      setReply("");
      toast("Reply sent", "success");
      await openThread(thread);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to send reply", "error");
    } finally {
      setSending(false);
    }
  }

  async function updateTicket(patch: { status?: TicketStatus; assigned_to?: string | null }) {
    if (!thread) return;
    setUpdatingTicket(true);
    try {
      const { error: e } = await supabase.from("support_tickets")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", thread.id);
      if (e) throw new Error(e.message);
      setThread({ ...thread, ...patch } as TicketRow);
      setRows((prev) => prev.map((t) => (t.id === thread.id ? { ...t, ...patch } : t)));
      toast("Ticket updated", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to update ticket", "error");
    } finally {
      setUpdatingTicket(false);
    }
  }

  const q = search.trim().toLowerCase();
  const filtered = rows.filter((t) => {
    if (statusFilter && t.status !== statusFilter) return false;
    if (categoryFilter && t.category !== categoryFilter) return false;
    if (q && !`${t.ticket_no ?? ""} ${t.subject} ${t.users?.full_name ?? ""} ${t.users?.phone ?? ""}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const openCount = rows.filter((t) => t.status === "open" || t.status === "in_progress").length;

  if (!isConfigured.supabase) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold text-ink-900">Support</h1>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Supabase is not configured. <Link to="/setup" className="font-semibold underline">Run setup</Link>.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Support</h1>
          <p className="text-sm text-ink-500">{rows.length} tickets · {openCount} awaiting resolution</p>
        </div>
      </div>

      <Card className="mb-4 grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Input placeholder="Search ticket no, subject, customer…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
        </Select>
        <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="">All categories</option>
          {TICKET_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </Select>
        <div className="flex items-end">
          <Button variant="outline" size="sm" className="w-full" onClick={() => void load()}>↻ Refresh</Button>
        </div>
      </Card>

      {error ? (
        <ErrorState title="Could not load tickets" message={error} onRetry={() => void load()} />
      ) : loading ? (
        <SkeletonList rows={5} />
      ) : filtered.length === 0 ? (
        <Card><EmptyState icon="🎧" title="No tickets" message="No support tickets match the current filters. Inbox zero!" /></Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="min-w-full divide-y divide-ink-100 text-sm">
            <thead className="bg-ink-50">
              <tr>
                {["Ticket", "Customer", "Category", "Subject", "Status", "Priority", "Assigned", "Created", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-50">
              {filtered.map((t) => (
                <tr key={t.id} className={cn("cursor-pointer transition hover:bg-ink-50", t.status === "open" && "bg-amber-50/50")}
                  onClick={() => void openThread(t)}>
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-brand-700">{t.ticket_no ?? t.id.slice(0, 8)}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink-800">{t.users?.full_name ?? "—"}</p>
                    <p className="text-xs text-ink-500">{t.users?.phone ?? ""}</p>
                  </td>
                  <td className="px-4 py-3 text-ink-600">{TICKET_CATEGORIES.find((c) => c.value === t.category)?.label ?? t.category}</td>
                  <td className="max-w-[220px] truncate px-4 py-3 text-ink-700">{t.subject}</td>
                  <td className="px-4 py-3"><Badge className={STATUS_TONES[t.status]}>{t.status.replace("_", " ")}</Badge></td>
                  <td className="px-4 py-3">
                    <Badge className={t.priority === "high" ? "bg-accent-100 text-accent-800" : "bg-ink-100 text-ink-700"}>{t.priority}</Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-500">
                    {t.assigned_to ? (agents.find((a) => a.id === t.assigned_to)?.full_name ?? (t.assigned_to === admin?.id ? "You" : t.assigned_to.slice(0, 8))) : <span className="text-ink-400">Unassigned</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-500" title={formatDateTime(t.created_at)}>{timeAgo(t.created_at)}</td>
                  <td className="px-4 py-3"><Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); void openThread(t); }}>Open</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Thread modal */}
      <Modal open={Boolean(thread)} onClose={() => setThread(null)} size="lg"
        title={thread ? `${thread.ticket_no ?? thread.id.slice(0, 8)} — ${thread.subject}` : "Ticket"}>
        {thread && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              <Badge className={STATUS_TONES[thread.status]}>{thread.status.replace("_", " ")}</Badge>
              <Badge className="bg-ink-100 text-ink-700">{TICKET_CATEGORIES.find((c) => c.value === (thread.category as TicketCategory))?.label ?? thread.category}</Badge>
              <span className="text-xs text-ink-500">
                {thread.users?.full_name ?? "Customer"} · {thread.users?.phone ?? "—"} · {formatDateTime(thread.created_at)}
              </span>
              {thread.order_id && (
                <Link to={`/admin/orders/${thread.order_id}`} className="text-xs font-medium text-brand-600 hover:underline">
                  Related order →
                </Link>
              )}
            </div>

            <div className="rounded-xl bg-ink-50 p-4 text-sm text-ink-700">{thread.message}</div>

            <div className="flex flex-wrap items-end gap-3">
              <div className="w-44">
                <Select label="Status" value={thread.status} disabled={updatingTicket}
                  onChange={(e) => void updateTicket({ status: e.target.value as TicketStatus })}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                </Select>
              </div>
              <div className="w-52">
                <Select label="Assigned to" value={thread.assigned_to ?? ""} disabled={updatingTicket}
                  onChange={(e) => void updateTicket({ assigned_to: e.target.value || null })}>
                  <option value="">Unassigned</option>
                  {agents.map((a) => <option key={a.id} value={a.id}>{a.full_name ?? a.id.slice(0, 8)}</option>)}
                </Select>
              </div>
              <Button variant="outline" size="md" disabled={updatingTicket || thread.assigned_to === admin?.id}
                onClick={() => void updateTicket({ assigned_to: admin?.id ?? null })}>
                Assign to me
              </Button>
            </div>

            <div>
              <h4 className="mb-2 text-sm font-semibold text-ink-800">Conversation</h4>
              {loadingThread ? (
                <SkeletonList rows={2} />
              ) : messages.length === 0 ? (
                <p className="text-sm text-ink-500">No replies yet — be the first to respond.</p>
              ) : (
                <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
                  {messages.map((m) => (
                    <li key={m.id} className={cn("rounded-xl px-3 py-2 text-sm",
                      m.sender_role === "admin" ? "ml-8 bg-brand-50 text-brand-900" : "mr-8 bg-ink-100 text-ink-700")}>
                      <p>{m.message}</p>
                      <p className="mt-1 text-[11px] opacity-60">
                        {m.sender_role ?? "user"} · {formatDateTime(m.created_at)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <Textarea label="Reply as admin" rows={3} value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Type your reply to the customer…" />
              <div className="mt-2 flex justify-end">
                <Button loading={sending} disabled={!reply.trim()} onClick={() => void sendReply()}>Send reply</Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
