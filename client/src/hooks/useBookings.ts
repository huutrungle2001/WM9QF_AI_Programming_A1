"use client";

import { useCallback, useEffect, useState } from "react";
import type { BookingFilter, BookingOut } from "@/types";
import { listBookings } from "@/lib/bookings.api";
import { ApiError } from "@/lib/api-client";
import { useActor } from "./useActor";

export function useBookings(filters: BookingFilter = {}) {
  const { actor, actorHeadersContext } = useActor();
  const [bookings, setBookings] = useState<BookingOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const serializedFilters = JSON.stringify(filters);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const parsed: BookingFilter = JSON.parse(serializedFilters);
      const data = await listBookings(actorHeadersContext, parsed);
      setBookings(data);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.detail : "Unable to load bookings."
      );
      setBookings([]);
    } finally {
      setLoading(false);
    }
  }, [actorHeadersContext, serializedFilters]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh, actor.id]);

  return { bookings, loading, error, refresh };
}
