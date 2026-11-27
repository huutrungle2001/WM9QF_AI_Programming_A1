"use client";

import { useCallback, useState } from "react";
import type { AvailabilityQuery, AvailabilitySlot } from "@/types";
import { checkAvailability } from "@/lib/resources.api";
import { ApiError } from "@/lib/api-client";
import { useActor } from "./useActor";

export function useAvailability() {
  const { actorHeadersContext } = useActor();
  const [slots, setSlots] = useState<AvailabilitySlot[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runCheck = useCallback(
    async (query: AvailabilityQuery) => {
      setLoading(true);
      setError(null);
      try {
        const data = await checkAvailability(actorHeadersContext, query);
        setSlots(data);
        return data;
      } catch (err) {
        const msg =
          err instanceof ApiError ? err.detail : "Failed to check availability.";
        setError(msg);
        setSlots(null);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [actorHeadersContext]
  );

  const clear = useCallback(() => {
    setSlots(null);
    setError(null);
  }, []);

  return { slots, loading, error, runCheck, clear };
}
