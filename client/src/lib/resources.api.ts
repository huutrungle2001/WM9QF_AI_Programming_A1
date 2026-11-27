import type {
  ActorContext,
  AvailabilityQuery,
  AvailabilitySlot,
  BookingStatusOut,
  BuildingCreate,
  BuildingOut,
  DepartmentCreate,
  DepartmentOut,
  FacilityCreate,
  FacilityOut,
  ResourceCreate,
  ResourceFilter,
  ResourceOut,
  ResourceUpdate,
  UserCreate,
  UserOut,
} from "@/types";
import { apiRequest } from "./api-client";

export async function listResources(
  actor: ActorContext,
  filters: ResourceFilter = {}
): Promise<ResourceOut[]> {
  return apiRequest<ResourceOut[]>("/resources", {
    actor,
    params: {
      resource_type: filters.resource_type,
      department_id: filters.department_id,
      building_id: filters.building_id,
      zone: filters.zone,
      facility: filters.facility,
      min_capacity: filters.min_capacity,
      status: filters.status,
      search: filters.search,
      limit: filters.limit,
      offset: filters.offset,
    },
  });
}

export async function getResource(
  actor: ActorContext,
  resourceId: string
): Promise<ResourceOut> {
  return apiRequest<ResourceOut>(`/resources/${encodeURIComponent(resourceId)}`, {
    actor,
  });
}

export async function createResource(
  actor: ActorContext,
  payload: ResourceCreate
): Promise<ResourceOut> {
  return apiRequest<ResourceOut>("/resources", {
    method: "POST",
    actor,
    body: payload,
  });
}

export async function updateResource(
  actor: ActorContext,
  resourceId: string,
  payload: ResourceUpdate
): Promise<ResourceOut> {
  return apiRequest<ResourceOut>(`/resources/${encodeURIComponent(resourceId)}`, {
    method: "PATCH",
    actor,
    body: payload,
  });
}

export async function retireResource(
  actor: ActorContext,
  resourceId: string
): Promise<void> {
  return apiRequest<void>(`/resources/${encodeURIComponent(resourceId)}`, {
    method: "DELETE",
    actor,
  });
}

export async function checkAvailability(
  actor: ActorContext,
  query: AvailabilityQuery
): Promise<AvailabilitySlot[]> {
  return apiRequest<AvailabilitySlot[]>("/availability", {
    actor,
    params: {
      start_time: query.start_time,
      end_time: query.end_time,
      resource_type: query.resource_type,
      department_id: query.department_id,
      building_id: query.building_id,
      zone: query.zone,
      facility: query.facility,
      min_capacity: query.min_capacity,
    },
  });
}

export async function listDepartments(actor: ActorContext): Promise<DepartmentOut[]> {
  return apiRequest<DepartmentOut[]>("/departments", { actor });
}

export async function createDepartment(
  actor: ActorContext,
  payload: DepartmentCreate
): Promise<DepartmentOut> {
  return apiRequest<DepartmentOut>("/departments", {
    method: "POST",
    actor,
    body: payload,
  });
}

export async function listBuildings(
  actor: ActorContext,
  zone?: string
): Promise<BuildingOut[]> {
  return apiRequest<BuildingOut[]>("/buildings", {
    actor,
    params: { zone },
  });
}

export async function createBuilding(
  actor: ActorContext,
  payload: BuildingCreate
): Promise<BuildingOut> {
  return apiRequest<BuildingOut>("/buildings", {
    method: "POST",
    actor,
    body: payload,
  });
}

export async function listFacilities(actor: ActorContext): Promise<FacilityOut[]> {
  return apiRequest<FacilityOut[]>("/facilities", { actor });
}

export async function createFacility(
  actor: ActorContext,
  payload: FacilityCreate
): Promise<FacilityOut> {
  return apiRequest<FacilityOut>("/facilities", {
    method: "POST",
    actor,
    body: payload,
  });
}

export async function listBookingStatuses(
  actor: ActorContext
): Promise<BookingStatusOut[]> {
  return apiRequest<BookingStatusOut[]>("/booking-statuses", { actor });
}

export async function listUsers(actor: ActorContext): Promise<UserOut[]> {
  return apiRequest<UserOut[]>("/users", { actor });
}

export async function createUser(
  actor: ActorContext,
  payload: UserCreate
): Promise<UserOut> {
  return apiRequest<UserOut>("/users", {
    method: "POST",
    actor,
    body: payload,
  });
}

export async function deactivateUser(
  actor: ActorContext,
  userId: string
): Promise<void> {
  return apiRequest<void>(`/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    actor,
  });
}
