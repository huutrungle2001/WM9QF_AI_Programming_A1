export type Role = "admin" | "manager" | "student_services" | "member";

export type UserType = "ug_student" | "pg_student" | "pgr_student" | "staff";

export type ResourceType =
  | "study_room"
  | "group_space"
  | "computer_lab"
  | "specialist_equipment"
  | "academic_support";

export type RoomStyle =
  | "seminar"
  | "lecture"
  | "boardroom"
  | "study_pod"
  | "flexible"
  | "standard";

export type BookingEligibility =
  | "all_users"
  | "students_only"
  | "staff_only"
  | "pg_only"
  | "pgr_and_staff"
  | "disability_only";

export type CheckinMethod = "none" | "pin" | "card_swipe";

export type ResourceStatus = "active" | "maintenance" | "retired";

export type BookingStatusId =
  | "pending"
  | "confirmed"
  | "cancelled"
  | "rejected"
  | "completed"
  | "no_show";

export type CampusZone =
  | "Main Site"
  | "Gibbet Hill Site"
  | "Westwood Site"
  | "Innovation Campus";

export const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  study_room: "Study Rooms",
  group_space: "Group Spaces",
  computer_lab: "Computer Labs",
  specialist_equipment: "Specialist Equipment",
  academic_support: "Academic Support",
};

export const RESOURCE_TYPE_SINGULAR: Record<ResourceType, string> = {
  study_room: "Study Room",
  group_space: "Group Space",
  computer_lab: "Computer Lab",
  specialist_equipment: "Specialist Equipment",
  academic_support: "Academic Support",
};

export const ELIGIBILITY_LABELS: Record<BookingEligibility, string> = {
  all_users: "All Campus Users",
  students_only: "Students Only",
  staff_only: "Staff Only",
  pg_only: "Postgraduate Only",
  pgr_and_staff: "PGR & Staff",
  disability_only: "Accessibility Priority",
};

export const ROOM_STYLE_LABELS: Record<RoomStyle, string> = {
  seminar: "Seminar",
  lecture: "Lecture",
  boardroom: "Boardroom",
  study_pod: "Study Pod",
  flexible: "Flexible",
  standard: "Standard",
};

export const CHECKIN_LABELS: Record<CheckinMethod, string> = {
  none: "No check-in required",
  pin: "PIN Door Access",
  card_swipe: "University Card Swipe",
};

export const CAMPUS_ZONES: CampusZone[] = [
  "Main Site",
  "Gibbet Hill Site",
  "Westwood Site",
  "Innovation Campus",
];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrator",
  manager: "Resources Manager",
  student_services: "Student Services",
  member: "Campus Member",
};

export const USER_TYPE_LABELS: Record<UserType, string> = {
  ug_student: "UG Student",
  pg_student: "PG Student",
  pgr_student: "PGR Student",
  staff: "Staff",
};
