// ============================================================
// CargoNepal — Realtime hooks (spec §36)
// ============================================================
// Scoped subscriptions only. A customer subscribes to their own
// order's channel; the admin live map subscribes to rider positions.
// Subscriptions are torn down on unmount to avoid leaks.
// ============================================================

import { useEffect, useState, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/services/supabaseClient";
import type { Order, OrderTrackingPoint, RiderProfile } from "@/models/types";

/** Live updates to a single order row (status changes, rider assignment). */
export function useOrderRealtime(orderId: string | null, onOrder?: (o: Order) => void) {
  const [order, setOrder] = useState<Order | null>(null);
  useEffect(() => {
    if (!orderId) return;
    const channel: RealtimeChannel = supabase
      .channel(`order:${orderId}`)
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${orderId}` },
        (payload) => {
          const o = payload.new as Order;
          setOrder(o);
          onOrder?.(o);
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);
  return order;
}

/** Live GPS breadcrumbs for an order (customer tracking view). */
export function useOrderTracking(orderId: string | null) {
  const [points, setPoints] = useState<OrderTrackingPoint[]>([]);
  const [latest, setLatest] = useState<OrderTrackingPoint | null>(null);
  useEffect(() => {
    if (!orderId) return;
    let mounted = true;
    supabase.from("order_tracking").select("*").eq("order_id", orderId)
      .order("recorded_at", { ascending: true }).limit(500)
      .then(({ data }) => { if (mounted && data) { setPoints(data as OrderTrackingPoint[]); setLatest((data as OrderTrackingPoint[]).at(-1) ?? null); } });

    const channel = supabase.channel(`tracking:${orderId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "order_tracking", filter: `order_id=eq.${orderId}` },
        (payload) => {
          const p = payload.new as OrderTrackingPoint;
          setPoints((prev) => [...prev, p]);
          setLatest(p);
        })
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(channel); };
  }, [orderId]);
  return { points, latest };
}

/** Rider's own live position broadcast while online (spec §12). */
export function useRiderLocationSender(enabled: boolean, getPosition: () => Promise<GeolocationPosition | null>) {
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!enabled) {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
      return;
    }
    const send = async () => {
      const pos = await getPosition();
      if (!pos) return;
      await supabase.from("rider_profiles").update({
        current_lat: pos.coords.latitude,
        current_lng: pos.coords.longitude,
        heading: pos.coords.heading ?? null,
        speed: pos.coords.speed ?? null,
        accuracy: pos.coords.accuracy ?? null,
        location_updated_at: new Date().toISOString(),
      }).eq("id", (await supabase.auth.getUser()).data.user?.id);
    };
    void send();
    timer.current = setInterval(send, 5000); // 5s cadence
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [enabled, getPosition]);
}

/** Admin live map: all online/busy rider positions (spec §21, §36). */
export function useLiveRiders(enabled: boolean) {
  const [riders, setRiders] = useState<RiderProfile[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let mounted = true;
    const load = () => supabase.from("rider_profiles")
      .select("*").eq("status", "approved").in("availability", ["online", "busy"])
      .then(({ data }) => { if (mounted && data) setRiders(data as RiderProfile[]); });
    void load();
    const channel = supabase.channel("live-riders")
      .on("postgres_changes", { event: "*", schema: "public", table: "rider_profiles" }, () => void load())
      .subscribe();
    const poll = setInterval(() => void load(), 15000);
    return () => { mounted = false; clearInterval(poll); supabase.removeChannel(channel); };
  }, [enabled]);
  return riders;
}

/** In-app notification stream for the current user (spec §29). */
export function useNotifications(userId: string | null) {
  const [items, setItems] = useState<import("@/models/types").Notification[]>([]);
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!userId) return;
    let mounted = true;
    const load = () => supabase.from("notifications").select("*").eq("user_id", userId)
      .order("created_at", { ascending: false }).limit(50)
      .then(({ data }) => {
        if (!mounted || !data) return;
        setItems(data as import("@/models/types").Notification[]);
        setUnread((data as import("@/models/types").Notification[]).filter((n) => !n.is_read).length);
      });
    void load();
    const channel = supabase.channel(`notif:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, () => void load())
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(channel); };
  }, [userId]);

  const markAllRead = async () => {
    if (!userId) return;
    await supabase.from("notifications").update({ is_read: true }).eq("user_id", userId).eq("is_read", false);
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnread(0);
  };

  return { items, unread, markAllRead, refresh: () => setItems((i) => i) };
}
