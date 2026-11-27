import type {
  BookingEligibility,
  CampusZone,
  CheckinMethod,
  ResourceStatus,
  ResourceType,
  RoomStyle,
} from "./enums";

export interface RoomDetails {
  capacity: number;
  room_style: RoomStyle;
}

export interface EquipmentDetails {
  category: string;
  quantity: number;
  specifications?: string | null;
}

export interface SupportDetails {
  category: string;
  max_attendees: number;
  host_name?: string | null;
}

export type ResourceDetails = RoomDetails | EquipmentDetails | SupportDetails;

export function isRoomDetails(
  details: ResourceDetails,
  type?: ResourceType
): details is RoomDetails {
  if (type) {
    return type === "study_room" || type === "group_space" || type === "computer_lab";
  }
  return "capacity" in details;
}

export function isEquipmentDetails(
  details: ResourceDetails,
  type?: ResourceType
): details is EquipmentDetails {
  if (type) {
    return type === "specialist_equipment";
  }
  return "quantity" in details;
}

export function isSupportDetails(
  details: ResourceDetails,
  type?: ResourceType
): details is SupportDetails {
  if (type) {
    return type === "academic_support";
  }
  return "max_attendees" in details;
}

export interface ResourceCreate {
  resource_id: string;
  resource_name: string;
  resource_type: ResourceType;
  department_id: string;
  building_id?: string | null;
  location: string;
  description?: string | null;
  image_url?: string | null;
  requires_approval?: boolean;
  booking_eligibility?: BookingEligibility;
  checkin_method?: CheckinMethod;
  status?: ResourceStatus;
  facilities?: string[];
  details: ResourceDetails;
}

export interface ResourceUpdate {
  resource_name?: string | null;
  department_id?: string | null;
  building_id?: string | null;
  location?: string | null;
  description?: string | null;
  image_url?: string | null;
  requires_approval?: boolean | null;
  booking_eligibility?: BookingEligibility | null;
  checkin_method?: CheckinMethod | null;
  status?: ResourceStatus | null;
  facilities?: string[] | null;
  details?: Partial<RoomDetails & EquipmentDetails & SupportDetails> | ResourceDetails | null;
}

export interface ResourceOut {
  resource_id: string;
  resource_name: string;
  resource_type: ResourceType;
  department_id: string;
  building_id?: string | null;
  location: string;
  description?: string | null;
  image_url?: string | null;
  requires_approval: boolean;
  booking_eligibility: BookingEligibility;
  checkin_method: CheckinMethod;
  status: ResourceStatus;
  facilities: string[];
  details: ResourceDetails;
  department_name?: string | null;
  building_name?: string | null;
  zone?: CampusZone | null;
  lat?: number | null;
  lon?: number | null;
  max_concurrent_bookings?: number | null;
}

export interface ResourceFilter {
  resource_type?: ResourceType | null;
  department_id?: string | null;
  building_id?: string | null;
  zone?: CampusZone | null;
  facility?: string | null;
  min_capacity?: number | null;
  status?: ResourceStatus | null;
  search?: string | null;
  limit?: number;
  offset?: number;
}

export interface AvailabilityQuery {
  start_time: number;
  end_time: number;
  resource_type?: ResourceType | null;
  department_id?: string | null;
  building_id?: string | null;
  zone?: CampusZone | null;
  facility?: string | null;
  min_capacity?: number | null;
}

export interface AvailabilitySlot {
  resource: ResourceOut;
  start_time: number;
  end_time: number;
  max_concurrent_bookings: number;
  active_bookings: number;
  remaining_slots: number;
}
