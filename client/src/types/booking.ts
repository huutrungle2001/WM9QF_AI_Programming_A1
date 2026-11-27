import type { ResourceType } from "./enums";

export interface BookingCreate {
  user_id?: string | null;
  resource_id: string;
  start_time: number;
  end_time: number;
  purpose?: string | null;
  notes?: string | null;
  group_size?: number | null;
}

export interface BookingUpdate {
  start_time?: number | null;
  end_time?: number | null;
  purpose?: string | null;
  notes?: string | null;
  group_size?: number | null;
}

export interface BookingTransitionRequest {
  notes?: string | null;
}

export interface BookingOut {
  booking_id: number;
  user_id: string;
  user_name?: string | null;
  course?: string | null;
  department_id?: string | null;
  resource_id: string;
  resource_name?: string | null;
  resource_type?: ResourceType | null;
  start_time: number;
  end_time: number;
  status_id: string;
  purpose?: string | null;
  notes?: string | null;
  created_at: number;
  updated_at: number;
}

export interface BookingFilter {
  user_id?: string | null;
  resource_id?: string | null;
  resource_type?: ResourceType | null;
  department_id?: string | null;
  course?: string | null;
  status_id?: string | null;
  from_ts?: number | null;
  to_ts?: number | null;
  limit?: number;
  offset?: number;
}

export interface ImportErrorItem {
  line_number: number;
  error: string;
  row_data?: Record<string, unknown> | null;
}

export interface ImportSummary {
  total_rows: number;
  imported_count: number;
  failed_count: number;
  created_booking_ids: number[];
  errors: ImportErrorItem[];
}
