import type { CampusZone } from "./enums";

export interface DepartmentCreate {
  department_id: string;
  department_name: string;
  faculty: string;
}

export interface DepartmentUpdate {
  department_name?: string | null;
  faculty?: string | null;
}

export interface DepartmentOut {
  department_id: string;
  department_name: string;
  faculty: string;
}

export interface BuildingCreate {
  building_id: string;
  building_name: string;
  zone: CampusZone;
  lat?: number | null;
  lon?: number | null;
  floor_count?: number;
}

export interface BuildingUpdate {
  building_name?: string | null;
  zone?: CampusZone | null;
  lat?: number | null;
  lon?: number | null;
  floor_count?: number | null;
}

export interface BuildingOut {
  building_id: string;
  building_name: string;
  zone: CampusZone;
  lat?: number | null;
  lon?: number | null;
  floor_count: number;
}

export interface FacilityCreate {
  facility_id: string;
  facility_name: string;
}

export interface FacilityOut {
  facility_id: string;
  facility_name: string;
}

export interface BookingStatusOut {
  status_id: string;
  description: string;
  blocks_slot: boolean;
}
