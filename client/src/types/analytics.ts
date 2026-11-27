import type { ResourceType } from "./enums";

export interface OverviewKPI {
  total_bookings: number;
  active_bookings: number;
  confirmed_bookings: number;
  pending_bookings: number;
  completed_bookings: number;
  cancelled_bookings: number;
  rejected_bookings: number;
  no_show_bookings: number;
  active_rate: number;
  cancellation_rate: number;
  rejection_rate: number;
  no_show_rate: number;
  total_resources: number;
  active_resources: number;
  total_users: number;
  active_users: number;
}

export interface DemandItem {
  resource_id: string;
  resource_name: string;
  resource_type: ResourceType;
  department_id: string;
  booking_count: number;
  total_hours: number;
}

export interface DemandReport {
  most_booked?: DemandItem[];
  top_booked?: DemandItem[];
  underused: DemandItem[];
}

export interface HeatmapCell {
  day_of_week: number;
  day_name: string;
  hour: number;
  booking_count: number;
}

export interface TrendPoint {
  week_label: string;
  week_start_ts: number;
  booking_count: number;
  total_hours: number;
  cancelled_count: number;
}

export interface CancellationBreakdown {
  dimension: string;
  label: string;
  total_bookings: number;
  cancelled_count: number;
  rejected_count: number;
  no_show_count: number;
  cancellation_rate: number;
  no_show_rate: number;
}

export interface FairnessRow {
  course: string;
  unique_users: number;
  booking_count: number;
  total_hours: number;
  avg_hours_per_user: number;
  is_suppressed: boolean;
}

export interface ChartExportResult {
  output_dir: string;
  generated_files: string[];
}
