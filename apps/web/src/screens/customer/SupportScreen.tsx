// ============================================================
// CargoNepal — Help & support (spec §30)
// Create tickets, list them, and chat in a ticket thread via
// `support_tickets` / `support_ticket_messages` (RLS-scoped).
// ============================================================
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Button, Card, Input, Select, Textarea, Modal, SkeletonList,
  EmptyState, ErrorState, Badge, useToast,
} from "@/components/ui";
import { useAuth } from "@/core/hooks/useAuth";
import { fetchOrders } from "@/services/orders/ordersService";
import { supabase } from "@/services/supabaseClient";
import { isConfigured } from "@/core/config/env";
import { BRAND, TICKET_CATEGORIES } from "@/core/constants";
import { cn, formatDateTime, timeAgo } from "@/core/utils";
import type { Order, SupportTicket, TicketCategory } from "@/models/types";

interface TicketMessage {
  id: string;
  ticket_id: string;
  sender_id: string | null;
  sender_role: string | null;
  message: string;
  created_at: string;
}

const TICKET_TONE: Record<string, string> = {
  open: "bg-brand-100 text-brand-800",
  in_progress: "bg-amber-100 text-amber-800",
  resolved: "bg-green-100 text-green-800",
  closed: "bg-ink-200 text-ink-700",
};

export default function SupportScreen() {
  const { user } = useAuth();
  const toast = useToast();

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create form
  const [category, setCategory] = useState<TicketCategory>("delivery_issue");
  const [orderId, setOrderId] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);

  // Thread modal
  const [thread, setThread] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [reply, setReply] = useState("");
  const [replying, setReplying] = useState(false);

  const load = useCallback(async () => {
    if (!isConfigured.supabase || !user?.id) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const [{ data, error: e }, ords] = await Promise.all([
        supabase.from("support_tickets").select("*").eq("user_id", user.id)
          .order("created_at", { ascending: false }).limit(50),
        fetchOrders("all").catch(() => [] as Order[]),
      ]);
      if (e) throw new Error(e.message);
      setTickets((data as SupportTicket[]) ?? []);
      setOrders(ords.slice(0, 20));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your tickets.");
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { void load(); }, [load]);

  async function createTicket() {
    if (!user?.id || creating) return;
    const e: Record<string, string> = {};
    if (!subject.trim()) e.subject = "Add a short subject.";
    if (message.trim().length < 10) e.message = "Describe the issue in at least 10 characters.";
    setFormErrors(e);
    if (Object.keys(e).length > 0) return;
    setCreating(true);
    try {
      const { error: err } = await supabase.from("support_tickets").insert({
        user_id: user.id,
        order_id: orderId || null,
        category,
        subject: subject.trim(),
        message: message.trim(),
        status: "open",
      });
      if (err) throw new Error(err.message);
      toast("Ticket created — our team will reply soon", "success");
      setSubject(""); setMessage(""); setOrderId(""); setFormErrors({});
      await load();
    } catch (e2) {
      toast(e2 instanceof Error ? e2.message : "Could not create the ticket", "error");
    } finally {
      setCreating(false);
    }
  }

  async function openThread(t: SupportTicket) {
    setThread(t);
    setReply("");
    setMessages([]);
    setThreadLoading(true);
    const { data, error: e } = await supabase.from("support_ticket_messages").select("*")
      .eq("ticket_id", t.id).order("created_at", { ascending: true });
    if (e) toast(e.message, "error");
    else setMessages((data as TicketMessage[]) ?? []);
    setThreadLoading(false);
  }

  async function sendReply() {
    if (!thread || !user?.id || replying || !reply.trim()) return;
    setReplying(true);
    const text = reply.trim();
    try {
      const { error: e } = await supabase.from("support_ticket_messages").insert({
        ticket_id: thread.id,
        sender_id: user.id,
        sender_role: "customer",
        message: text,
      });
      if (e) throw new Error(e.message);
      setReply("");
      await openThread(thread);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not send your reply", "error");
    } finally {
      setReplying(false);
    }
  }

  if (!isConfigured.supabase) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        Support requires a configured Supabase backend.{" "}
        <Link to="/setup" className="font-semibold underline">Open the setup guide</Link>.
      </div>
    );
  }

  return (
    <div className="pb-4 space-y-5 animate-fade-in">
      <header className="flex items-center gap-3">
        <Link to="/customer/profile" className="text-ink-400 hover:text-ink-700 text-xl leading-none">←</Link>
        <div>
          <h1 className="font-display text-xl font-bold text-ink-900">Help & support</h1>
          <p className="text-xs text-ink-500">{BRAND.supportEmail} · {BRAND.supportPhone}</p>
        </div>
      </header>

      {/* New ticket form */}
      <Card className="space-y-3 p-4">
        <h2 className="font-display text-base font-bold text-ink-900">Need a hand? Open a ticket</h2>
        <Select label="Category" value={category}
          onChange={(e) => setCategory(e.target.value as TicketCategory)}>
          {TICKET_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </Select>
        <Select label="Related order (optional)" value={orderId} onChange={(e) => setOrderId(e.target.value)}>
          <option value="">No specific order</option>
          {orders.map((o) => (
            <option key={o.id} value={o.id}>{o.order_code ?? o.id.slice(0, 8)} — {o.pickup_address.slice(0, 30)}</option>
          ))}
        </Select>
        <Input label="Subject" placeholder="e.g. Parcel not delivered" value={subject}
          error={formErrors.subject} onChange={(e) => setSubject(e.target.value)} />
        <Textarea label="Message" rows={4} placeholder="Tell us what happened, with as much detail as possible…"
          value={message} error={formErrors.message} onChange={(e) => setMessage(e.target.value)} />
        <Button className="w-full" loading={creating} onClick={() => void createTicket()}>Submit ticket</Button>
      </Card>

      {/* Ticket list */}
      <section className="space-y-2">
        <h2 className="font-display text-base font-bold text-ink-900">Your tickets</h2>
        {loading ? (
          <SkeletonList rows={2} />
        ) : error ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : tickets.length === 0 ? (
          <EmptyState icon="🎧" title="No tickets yet"
            message="Tickets you open will show up here with their status and replies." />
        ) : (
          tickets.map((t) => (
            <Card key={t.id} className="flex items-center justify-between gap-3 p-4" onClick={() => void openThread(t)}>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink-900">
                  {t.ticket_no ? `${t.ticket_no} · ` : ""}{t.subject}
                </p>
                <p className="text-xs text-ink-500">
                  {TICKET_CATEGORIES.find((c) => c.value === t.category)?.label ?? t.category} · {timeAgo(t.created_at)}
                </p>
              </div>
              <Badge className={cn("shrink-0", TICKET_TONE[t.status] ?? "bg-ink-100 text-ink-700")}>
                {t.status.replace("_", " ")}
              </Badge>
            </Card>
          ))
        )}
      </section>

      {/* Thread modal */}
      <Modal open={thread !== null} onClose={() => setThread(null)}
        title={thread ? thread.subject : ""} size="lg">
        <div className="space-y-4">
          {thread && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
              <Badge className={TICKET_TONE[thread.status] ?? "bg-ink-100 text-ink-700"}>
                {thread.status.replace("_", " ")}
              </Badge>
              {thread.ticket_no && <span className="font-mono">{thread.ticket_no}</span>}
              <span>Opened {formatDateTime(thread.created_at)}</span>
            </div>
          )}
          {threadLoading ? (
            <SkeletonList rows={2} />
          ) : (
            <div className="space-y-2">
              {thread && (
                <div className="rounded-2xl rounded-tl-sm bg-ink-100 p-3 text-sm text-ink-800">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400">You · {formatDateTime(thread.created_at)}</p>
                  {thread.message}
                </div>
              )}
              {messages.map((m) => {
                const mine = m.sender_role === "customer";
                return (
                  <div key={m.id}
                    className={cn("rounded-2xl p-3 text-sm",
                      mine ? "rounded-tl-sm bg-ink-100 text-ink-800" : "rounded-tr-sm bg-brand-50 text-brand-950")}>
                    <p className={cn("mb-1 text-[11px] font-semibold uppercase tracking-wide",
                      mine ? "text-ink-400" : "text-brand-600")}>
                      {mine ? "You" : "CargoNepal support"} · {formatDateTime(m.created_at)}
                    </p>
                    {m.message}
                  </div>
                );
              })}
              {messages.length === 0 && (
                <p className="py-2 text-center text-xs text-ink-400">No replies yet — our team usually responds within a few hours.</p>
              )}
            </div>
          )}
          <div className="flex gap-2">
            <Input placeholder="Write a reply…" value={reply} aria-label="Reply"
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void sendReply()} />
            <Button loading={replying} disabled={!reply.trim()} onClick={() => void sendReply()}>Send</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
