// ============================================================
// CargoNepal — Notifications (spec §26)
// ============================================================
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Card, EmptyState, ErrorState, useToast } from "@/components/ui";
import { useAuth } from "@/core/hooks/useAuth";
import { useNotifications } from "@/core/hooks/useRealtime";
import { isConfigured } from "@/core/config/env";
import { cn, timeAgo } from "@/core/utils";

export default function NotificationsScreen() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const { items, unread, markAllRead } = useNotifications(user?.id ?? null);
  const [marking, setMarking] = useState(false);

  async function handleMarkAll() {
    if (marking) return;
    setMarking(true);
    try {
      await markAllRead();
      toast("All notifications marked as read", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not mark notifications read", "error");
    } finally {
      setMarking(false);
    }
  }

  function openNotification(n: (typeof items)[number]) {
    const orderId = n.order_id ?? (n.data?.order_id as string | undefined);
    if (orderId) navigate(`/customer/track/${orderId}`);
  }

  if (!isConfigured.supabase) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        Notifications require a configured Supabase backend.{" "}
        <Link to="/setup" className="font-semibold underline">Open the setup guide</Link>.
      </div>
    );
  }

  return (
    <div className="pb-4 space-y-4 animate-fade-in">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-bold text-ink-900">Alerts</h1>
          {unread > 0 && <p className="text-xs text-ink-500">{unread} unread</p>}
        </div>
        {unread > 0 && (
          <Button variant="outline" size="sm" loading={marking} onClick={() => void handleMarkAll()}>
            Mark all read
          </Button>
        )}
      </header>

      {!user ? (
        <ErrorState title="Not signed in" message="Sign in again to see your notifications." />
      ) : items.length === 0 ? (
        <EmptyState icon="🔔" title="You're all caught up"
          message="Order updates, rider arrivals and promotions will appear here." />
      ) : (
        <div className="space-y-2">
          {items.map((n) => (
            <Card key={n.id}
              className={cn("relative p-4", !n.is_read && "border-brand-200 bg-brand-50/40")}
              onClick={n.order_id || n.data?.order_id ? () => openNotification(n) : undefined}>
              <div className="flex items-start gap-3">
                {!n.is_read && <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-accent-500" aria-label="Unread" />}
                <div className={cn("min-w-0 flex-1", n.is_read && "pl-[22px]")}>
                  <p className={cn("text-sm text-ink-900", !n.is_read ? "font-semibold" : "font-medium")}>{n.title}</p>
                  {n.body && <p className="mt-0.5 text-sm text-ink-600">{n.body}</p>}
                  <p className="mt-1 text-xs text-ink-400">{timeAgo(n.created_at)}</p>
                </div>
                {(n.order_id || n.data?.order_id) && <span className="text-ink-300">›</span>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
