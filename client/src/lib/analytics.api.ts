import type {
  ActorContext,
  CancellationBreakdown,
  ChartExportResult,
  DemandItem,
  DemandReport,
  FairnessRow,
  HeatmapCell,
  OverviewKPI,
  TrendPoint,
} from "@/types";
import { apiRequest } from "./api-client";

export async function getOverview(actor: ActorContext): Promise<OverviewKPI> {
  return apiRequest<OverviewKPI>("/analytics/overview", { actor });
}

export async function getDemand(
  actor: ActorContext,
  limit = 10
): Promise<{ top_booked: DemandItem[]; underused: DemandItem[] }> {
  const raw = await apiRequest<DemandReport | DemandItem[]>("/analytics/demand", {
    actor,
    params: { limit },
  });

  if (Array.isArray(raw)) {
    const sortedDesc = [...raw].sort((a, b) => b.booking_count - a.booking_count);
    const sortedAsc = [...raw].sort((a, b) => a.booking_count - b.booking_count);
    return {
      top_booked: sortedDesc.slice(0, limit),
      underused: sortedAsc.slice(0, limit),
    };
  }

  return {
    top_booked: raw.most_booked ?? raw.top_booked ?? [],
    underused: raw.underused ?? [],
  };
}

export async function getHeatmap(actor: ActorContext): Promise<HeatmapCell[]> {
  return apiRequest<HeatmapCell[]>("/analytics/heatmap", { actor });
}

export async function getTrends(actor: ActorContext): Promise<TrendPoint[]> {
  return apiRequest<TrendPoint[]>("/analytics/trends", { actor });
}

export async function getCancellations(
  actor: ActorContext,
  groupBy: "resource_type" | "department_id" = "resource_type"
): Promise<CancellationBreakdown[]> {
  return apiRequest<CancellationBreakdown[]>("/analytics/cancellations", {
    actor,
    params: { group_by: groupBy },
  });
}

export async function getFairness(actor: ActorContext): Promise<FairnessRow[]> {
  return apiRequest<FairnessRow[]>("/analytics/fairness", { actor });
}

export async function generateCharts(
  actor: ActorContext
): Promise<ChartExportResult> {
  return apiRequest<ChartExportResult>("/analytics/charts", {
    method: "POST",
    actor,
  });
}
